-- Additive, server-only moderation gate. Publication starts disabled.
begin;
create table public.moderation_control (
  singleton boolean primary key default true check(singleton),
  active_policy text check(active_policy ~ '^v1:[0-9a-f]{64}$'),
  publishing_enabled boolean not null default false
);
insert into public.moderation_control(singleton) values(true);
create table public.moderation_decisions (
  request_id uuid primary key,
  payload_hash text not null check(payload_hash ~ '^v1:[0-9a-f]{64}$'),
  policy_version text not null check(policy_version ~ '^v1:[0-9a-f]{64}$'),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'evaluating' check(state in ('evaluating','allow','reject','uncertain')),
  reasons text[] not null default '{}',
  lease_token uuid, lease_expires_at timestamptz,
  retry_at timestamptz, quota_reserved boolean not null default false,
  updated_at timestamptz not null default now(),
  check(reasons <@ array['profanity','harassment','hate','threat','sexual','personal_data','spam','sensitive_context']::text[]),
  check((state in ('evaluating','allow') and cardinality(reasons)=0) or (state in ('reject','uncertain') and cardinality(reasons)>0))
);
create table public.moderation_budget (
  singleton boolean primary key default true check(singleton),
  minute_start timestamptz not null default date_trunc('minute',now()),
  day_start timestamptz not null default (date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'),
  minute_requests bigint not null default 0, day_requests bigint not null default 0,
  minute_tokens bigint not null default 0, day_tokens bigint not null default 0,
  retry_at timestamptz
);
insert into public.moderation_budget(singleton) values(true);
alter table public.messages add column safety_content_hash text check(safety_content_hash ~ '^[0-9a-f]{64}$');
alter table public.moderation_control enable row level security;
alter table public.moderation_decisions enable row level security;
alter table public.moderation_budget enable row level security;
revoke all on public.moderation_control,public.moderation_decisions,public.moderation_budget from public,anon,authenticated;
grant select on public.moderation_control to service_role;
grant select,insert,update on public.moderation_decisions,public.moderation_budget to service_role;

create function public.moderation_fingerprint(p_category text,p_recipient text,p_content text) returns text
language sql immutable security invoker set search_path='' as $$
 select encode(sha256(convert_to('{"category":'||to_json(p_category)::text||',"recipient":'||coalesce(to_json(p_recipient)::text,'null')||',"content":'||to_json(p_content)::text||'}','UTF8')),'hex');
$$;

create function public.lookup_submit_receipt(p_request_id uuid,p_payload_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare receipt jsonb; message_id uuid;
begin
 -- One statement/snapshot: a concurrent commit cannot look like a purged receipt.
 select m.request_id,to_jsonb(i) into message_id,receipt from public.messages m
 left join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
 if message_id is null then return jsonb_build_object('kind','missing'); end if;
 if receipt is null then return jsonb_build_object('kind','expired'); end if;
 if receipt->>'payload_hash' <> p_payload_hash then return jsonb_build_object('kind','conflict'); end if;
 if (receipt->>'expires_at')::timestamptz <= clock_timestamp() then return jsonb_build_object('kind','expired'); end if;
 return receipt||jsonb_build_object('kind','replay');
end;
$$;

create function public.reserve_moderation(p_request_id uuid,p_payload_hash text,p_policy_version text,p_content_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.moderation_decisions; t uuid := gen_random_uuid();
begin
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

create function public.reserve_moderation_quota(p_request_id uuid,p_lease_token uuid,p_reserved_tokens integer,
 p_rpm integer,p_rpd integer,p_tpm integer,p_tpd integer) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.moderation_decisions; b public.moderation_budget;
 n timestamptz; m timestamptz; d timestamptz;
begin
 if least(p_reserved_tokens,p_rpm,p_rpd,p_tpm,p_tpd)<=0 or p_reserved_tokens is null
   or p_rpm is null or p_rpd is null or p_tpm is null or p_tpd is null then return false; end if;
 select * into r from public.moderation_decisions where request_id=p_request_id for update;
 if not found or p_lease_token is null or r.lease_expires_at is null or r.lease_token is distinct from p_lease_token or r.state<>'evaluating' then return false; end if;
 if r.quota_reserved then return false; end if;
 select * into b from public.moderation_budget where singleton for update;
 n:=clock_timestamp();
 if r.lease_expires_at<=n then return false; end if;
 if b.retry_at>n then return false; end if;
 m:=date_trunc('minute',n); d:=date_trunc('day',n at time zone 'UTC') at time zone 'UTC';
 if b.minute_start>m or b.day_start>d then return false; end if;
 if b.minute_start<>m then b.minute_requests:=0; b.minute_tokens:=0; end if;
 if b.day_start<>d then b.day_requests:=0; b.day_tokens:=0; end if;
 if b.minute_requests+1>p_rpm or b.day_requests+1>p_rpd or b.minute_tokens+p_reserved_tokens>p_tpm or b.day_tokens+p_reserved_tokens>p_tpd then return false; end if;
 update public.moderation_budget set minute_start=m,day_start=d,
   minute_requests=b.minute_requests+1,day_requests=b.day_requests+1,
   minute_tokens=b.minute_tokens+p_reserved_tokens,day_tokens=b.day_tokens+p_reserved_tokens where singleton;
 update public.moderation_decisions set quota_reserved=true where request_id=p_request_id;
 return true;
end;
$$;

create function public.finish_moderation(p_request_id uuid,p_lease_token uuid,p_decision text,p_reasons text[]) returns boolean
language plpgsql security invoker set search_path='' as $$
declare r public.moderation_decisions;
begin
 select * into r from public.moderation_decisions where request_id=p_request_id for update;
 if not found or p_lease_token is null or r.lease_expires_at is null or r.lease_token is distinct from p_lease_token or r.lease_expires_at<=clock_timestamp() or r.state<>'evaluating' then return false; end if;
 if not r.quota_reserved or p_decision is null or p_decision not in ('allow','reject','uncertain') or p_reasons is null then
   raise exception 'Invalid moderation result' using errcode='23514';
 end if;
 update public.moderation_decisions set state=p_decision,reasons=p_reasons,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp() where request_id=p_request_id;
 return true;
end;
$$;

create function public.release_moderation(p_request_id uuid,p_lease_token uuid,p_retry_after integer default 15) returns void
language plpgsql security invoker set search_path='' as $$
declare reserved boolean;
begin
 update public.moderation_decisions set lease_token=null,lease_expires_at=null,
   retry_at=clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,15),86400))),updated_at=clock_timestamp()
 where request_id=p_request_id and state='evaluating' and lease_token=p_lease_token returning quota_reserved into reserved;
 -- Global cooldown also covers use of the organization outside this application.
 if reserved then
   update public.moderation_budget set retry_at=greatest(coalesce(retry_at,clock_timestamp()),clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,15),86400)))) where singleton;
 end if;
end;
$$;

create function public.guard_moderated_message() returns trigger
language plpgsql security invoker set search_path='' as $$
declare valid boolean; publishing boolean; active text;
begin
 if tg_op='UPDATE' then
   if new.category is distinct from old.category or new.recipient is distinct from old.recipient or new.content is distinct from old.content or new.request_id is distinct from old.request_id then
     raise exception 'Accepted message content is immutable' using errcode='23514';
   end if;
 end if;
 select active_policy,publishing_enabled into active,publishing from public.moderation_control where singleton;
 valid:=exists(select 1 from public.moderation_decisions d where d.request_id=new.request_id and d.state='allow'
   and d.policy_version=new.safety_policy_version and d.policy_version=active
   and d.content_hash=new.safety_content_hash and d.content_hash=public.moderation_fingerprint(new.category,new.recipient,new.content));
 if tg_op='INSERT' or (tg_op='UPDATE' and (new.safety_content_hash is distinct from old.safety_content_hash or new.safety_policy_version is distinct from old.safety_policy_version or new.safety_approved_at is distinct from old.safety_approved_at)) then
   if not valid or new.safety_approved_at is null then raise exception 'Moderation approval required' using errcode='23514'; end if;
 end if;
 if new.status in ('publishing','published') and (tg_op='INSERT' or new.status is distinct from old.status) then
   if not valid or not publishing then raise exception 'Publication moderation gate closed' using errcode='23514'; end if;
 end if;
 return new;
end;
$$;
create trigger messages_moderation before insert or update on public.messages for each row execute function public.guard_moderated_message();

create or replace function public.submit_menfess_atomic(
 p_request_id uuid,p_tracking_code_hash text,p_category text,p_recipient text,p_content text,p_payload_hash text,
 p_encrypted_response bytea,p_encryption_key_version text,p_safety_policy_version text
) returns public.submit_result language plpgsql security invoker set search_path='' as $$
declare r public.submit_result; inserted boolean; d public.moderation_decisions;
begin
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

do $$
declare f record;
begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('moderation_fingerprint','lookup_submit_receipt','reserve_moderation','reserve_moderation_quota','finish_moderation','release_moderation','guard_moderated_message')
 loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
   execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end;
$$;
commit;

