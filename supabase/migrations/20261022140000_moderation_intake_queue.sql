begin;
-- Pending content never enters the public messages projection.
create table public.moderation_intake (
 request_id uuid primary key,
 payload_hash text not null check(payload_hash ~ '^v1:[0-9a-f]{64}$'),
 tracking_code_hash text not null unique check(tracking_code_hash ~ '^v1:[0-9a-f]{64}$'),
 input jsonb,
 encrypted_response bytea check(octet_length(encrypted_response) between 1 and 8192),
 encryption_key_version text not null check(encryption_key_version ~ '^v[0-9]{1,4}$'),
 state text not null default 'pending' check(state in ('pending','approved','blocked')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '24 hours',
 lease_token uuid, lease_expires_at timestamptz,
 next_attempt_at timestamptz not null default now(),
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours'),
 check((state='pending' and input is not null) or (state<>'pending' and input is null))
);
create index moderation_intake_due on public.moderation_intake(next_attempt_at,created_at) where state='pending';
alter table public.moderation_intake enable row level security;
revoke all on public.moderation_intake from public,anon,authenticated;
grant select,insert,update on public.moderation_intake to service_role;

create or replace function public.lookup_submit_receipt(p_request_id uuid,p_payload_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt jsonb;
begin
 -- One snapshot, including completed intake tombstones and legacy submissions.
 select r into receipt from (
   select to_jsonb(q) r,0 priority from public.moderation_intake q where q.request_id=p_request_id
   union all
   select coalesce(to_jsonb(i),'{}'::jsonb),1 from public.messages m
   left join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id
 ) receipts order by priority limit 1;
 if not found then return jsonb_build_object('kind','missing'); end if;
 if receipt->>'payload_hash' is not null and receipt->>'payload_hash'<>p_payload_hash then return jsonb_build_object('kind','conflict'); end if;
 if receipt->>'encrypted_response' is null or (receipt->>'expires_at')::timestamptz<=clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
 -- Do not return the pending plaintext in receipt RPC responses.
 return jsonb_build_object('kind','replay','payload_hash',receipt->>'payload_hash',
   'encrypted_response',receipt->>'encrypted_response','encryption_key_version',receipt->>'encryption_key_version','expires_at',receipt->>'expires_at');
end;
$$;

create function public.enqueue_moderation_intake(p_request_id uuid,p_payload_hash text,p_tracking_code_hash text,
 p_input jsonb,p_encrypted_response bytea,p_encryption_key_version text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 r:=public.lookup_submit_receipt(p_request_id,p_payload_hash);
 if r->>'kind'<>'missing' then return r; end if;
 if exists(select 1 from public.moderation_decisions where request_id=p_request_id and payload_hash<>p_payload_hash) then
   return jsonb_build_object('kind','conflict');
 end if;
 if p_input is null or jsonb_typeof(p_input)<>'object'
   or p_input->>'category' is null or p_input->>'category' not in ('menfess','aspirasi','curhat','apresiasi')
   or p_input->>'content' is null or char_length(p_input->>'content') not between 10 and 500
   or char_length(p_input->>'recipient')>80 then raise exception 'Invalid intake' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended('moderation-intake-capacity',0));
 if (select count(*) from public.moderation_intake where state='pending')>=10000 then return jsonb_build_object('kind','full'); end if;
 insert into public.moderation_intake(request_id,payload_hash,tracking_code_hash,input,encrypted_response,encryption_key_version)
 values(p_request_id,p_payload_hash,p_tracking_code_hash,p_input,p_encrypted_response,p_encryption_key_version);
 r:=public.lookup_submit_receipt(p_request_id,p_payload_hash);
 return r||jsonb_build_object('kind','accepted');
end;
$$;

create function public.track_moderation_intake(p_tracking_code_hash text) returns jsonb
language sql security invoker set search_path='' as $$
 select result from (
   select jsonb_build_object('status',status,'published_at',published_at,'ig_permalink',ig_permalink) result,0 priority
   from public.messages where tracking_code_hash=p_tracking_code_hash
   union all
   select jsonb_build_object('status',case when state='blocked' then 'blocked' else 'pending_moderation' end),1
   from public.moderation_intake where tracking_code_hash=p_tracking_code_hash and state<>'approved'
 ) statuses order by priority limit 1;
$$;

create function public.claim_moderation_intake(p_limit integer) returns setof public.moderation_intake
language sql security invoker set search_path='' as $$
 with due as (
   select request_id from public.moderation_intake where state='pending' and next_attempt_at<=clock_timestamp()
   and (lease_expires_at is null or lease_expires_at<=clock_timestamp())
   order by next_attempt_at,created_at,request_id limit greatest(0,least(coalesce(p_limit,0),3)) for update skip locked
 ) update public.moderation_intake q set lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
 from due where q.request_id=due.request_id returning q.*;
$$;

create function public.release_moderation_intake(p_request_id uuid,p_lease_token uuid,p_retry_after integer) returns void
language sql security invoker set search_path='' as $$
 update public.moderation_intake set lease_token=null,lease_expires_at=null,
 next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,60),86400)))
 where request_id=p_request_id and state='pending' and lease_token=p_lease_token;
$$;

create function public.settle_moderation_intake(p_request_id uuid,p_lease_token uuid,p_decision text,p_policy_version text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare q public.moderation_intake; d public.moderation_decisions;
begin
 select * into q from public.moderation_intake where request_id=p_request_id for update;
 if not found or q.state<>'pending' or p_lease_token is null or q.lease_token is distinct from p_lease_token
   or q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp() then return false; end if;
 if p_decision is null or p_decision not in ('allow','reject','uncertain','local_reject') then return false; end if;
 -- Hold the active policy stable through the transaction and all publication guards.
 perform 1 from public.moderation_control where active_policy=p_policy_version for share;
 if not found then return false; end if;
 if p_decision<>'local_reject' then
   select * into d from public.moderation_decisions where request_id=p_request_id for update;
   if d.state is distinct from p_decision or d.payload_hash is distinct from q.payload_hash
     or d.policy_version is distinct from p_policy_version
     or d.content_hash is distinct from public.moderation_fingerprint(q.input->>'category',q.input->>'recipient',q.input->>'content') then return false; end if;
 end if;
 if p_decision='allow' then
   insert into public.messages(request_id,tracking_code_hash,category,recipient,content,safety_approved_at,safety_policy_version,safety_content_hash)
   values(q.request_id,q.tracking_code_hash,q.input->>'category',q.input->>'recipient',q.input->>'content',clock_timestamp(),p_policy_version,d.content_hash);
   if q.encrypted_response is not null and q.expires_at>clock_timestamp() then
     insert into public.idempotency_receipts(request_id,payload_hash,encrypted_response,encryption_key_version,created_at,expires_at)
     values(q.request_id,q.payload_hash,q.encrypted_response,q.encryption_key_version,q.created_at,q.expires_at);
   end if;
 end if;
 update public.moderation_intake set state=case when p_decision='allow' then 'approved' else 'blocked' end,
   input=null,lease_token=null,lease_expires_at=null where request_id=p_request_id;
 return true;
end;
$$;

create or replace function public.purge_expired_receipts() returns bigint
language plpgsql security invoker set search_path='' as $$
declare n bigint; m bigint;
begin
 delete from public.idempotency_receipts where expires_at<=now();
 get diagnostics n=row_count;
 update public.moderation_intake set encrypted_response=null where expires_at<=now() and encrypted_response is not null;
 get diagnostics m=row_count;
 return n+m;
end;
$$;

do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('enqueue_moderation_intake','track_moderation_intake','claim_moderation_intake','release_moderation_intake','settle_moderation_intake')
 loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;
$$;
-- Serialize legacy in-flight submitters with the new intake.
create or replace function public.submit_menfess_atomic(
 p_request_id uuid,p_tracking_code_hash text,p_category text,p_recipient text,p_content text,p_payload_hash text,
 p_encrypted_response bytea,p_encryption_key_version text,p_safety_policy_version text
) returns public.submit_result language plpgsql security invoker set search_path='' as $$
declare r public.submit_result; inserted boolean; d public.moderation_decisions;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 if exists(select 1 from public.moderation_intake where request_id=p_request_id) then
   raise exception 'Request belongs to moderation intake' using errcode='23514';
 end if;
 -- Lock decision before insert so a policy refresh cannot race the gate.
 select * into d from public.moderation_decisions where request_id=p_request_id for update;
 if exists(select 1 from public.messages where request_id=p_request_id) then
   select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,false into r
   from public.messages m left join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
   return r;
 end if;
 if d.state is distinct from 'allow' or d.payload_hash is distinct from p_payload_hash or d.policy_version is distinct from p_safety_policy_version then
   raise exception 'Moderation decision required' using errcode='23514';
 end if;
 insert into public.messages(request_id,tracking_code_hash,category,recipient,content,safety_approved_at,safety_policy_version,safety_content_hash)
 values(p_request_id,p_tracking_code_hash,p_category,p_recipient,p_content,clock_timestamp(),p_safety_policy_version,d.content_hash)
 on conflict(request_id) do nothing;
 inserted:=found;
 insert into public.idempotency_receipts(request_id,payload_hash,encrypted_response,encryption_key_version)
 values(p_request_id,p_payload_hash,p_encrypted_response,p_encryption_key_version) on conflict do nothing;
 select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,inserted into r
 from public.messages m join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
 return r;
end;
$$;
create or replace function public.reserve_moderation(p_request_id uuid,p_payload_hash text,p_policy_version text,p_content_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.moderation_decisions; t uuid := gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 if exists(select 1 from public.moderation_intake where request_id=p_request_id and payload_hash<>p_payload_hash) then
   return jsonb_build_object('kind','conflict');
 end if;
 if not exists(select 1 from public.moderation_control where active_policy=p_policy_version) then
   return jsonb_build_object('kind','unavailable');
 end if;
 insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash)
 values(p_request_id,p_payload_hash,p_policy_version,p_content_hash) on conflict do nothing;
 select * into r from public.moderation_decisions where request_id=p_request_id for update;
 if r.payload_hash<>p_payload_hash or r.content_hash<>p_content_hash then return jsonb_build_object('kind','conflict'); end if;
 if r.policy_version=p_policy_version and r.state<>'evaluating' then
   return jsonb_build_object('kind','cached','decision',r.state,'reasons',r.reasons);
 end if;
 if r.lease_expires_at>clock_timestamp() or r.retry_at>clock_timestamp() then return jsonb_build_object('kind','busy'); end if;
 update public.moderation_decisions set policy_version=p_policy_version,state='evaluating',reasons='{}',
   lease_token=t,lease_expires_at=clock_timestamp()+interval '15 seconds',retry_at=null,quota_reserved=false,updated_at=clock_timestamp()
 where request_id=p_request_id;
 return jsonb_build_object('kind','acquired','lease_token',t);
end;
$$;
commit;
