-- Local admission is immediately web-visible; Instagram still requires current AI allow.
-- Admission metadata is immutable. AI policy is intentionally independent of admission policy.
begin;

alter table public.messages
  add column web_status text not null default 'hidden' check (web_status in ('visible','hidden')),
  add column web_published_at timestamptz,
  add constraint messages_web_visibility check (web_status <> 'visible' or web_published_at is not null);

-- Retain attempt identity after quarantine so a late, confirmed Meta success can
-- be recorded without making another network publication attempt.
alter table public.publication_jobs add column publication_attempt_token uuid;
update public.publication_jobs set publication_attempt_token=lock_token
where ambiguous_at is not null and lock_token is not null;

create table public.message_moderation_jobs (
  message_id uuid primary key references public.messages(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','approved','blocked')),
  target_policy text check (target_policy ~ '^v1:[0-9a-f]{64}$'),
  payload_hash text check (payload_hash ~ '^v1:[0-9a-f]{64}$'),
  lease_token uuid,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint message_moderation_lease check (
    (lease_token is null and lease_expires_at is null) or
    (state='pending' and lease_token is not null and lease_expires_at is not null)
  ),
  constraint message_moderation_settlement check ((state='pending') = (settled_at is null))
);
create index message_moderation_due_idx on public.message_moderation_jobs(next_attempt_at,message_id) where state='pending';
alter table public.message_moderation_jobs enable row level security;
revoke all on public.message_moderation_jobs from public,anon,authenticated;
grant select,insert,update on public.message_moderation_jobs to service_role;
create trigger message_moderation_updated before update on public.message_moderation_jobs
  for each row execute function public.touch_updated_at();

-- Match the submit validator: LF and TAB are accepted in content, not in recipient.
-- PostgreSQL ARE uses single backslashes in standard-conforming string literals.
create or replace function public.local_content_is_safe(p_content text,p_recipient text) returns boolean
language sql immutable set search_path='' as $$
  select p_content is not null and char_length(p_content) between 10 and 500
    and p_content=btrim(p_content) and p_content !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
    and p_content !~ E'\r'
    and (p_recipient is null or (char_length(p_recipient) between 1 and 80
      and p_recipient=btrim(p_recipient) and p_recipient !~ '[[:cntrl:]]'))
    and p_content !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
    and p_content !~* '(https?://|www\.)\S+'
    and p_content !~* '(^|\s)@[A-Z0-9._]{3,30}\M'
    and p_content !~* '(^|[^[:alnum:]])(kontol|ngentot|memek)($|[^[:alnum:]])'
    and p_content !~ '(\+?62|0)[\s().-]*(\d[\s().-]*){8,13}\M';
$$;

-- Decision wins so old, already moderated requests keep their original identity.
-- Receipts are never rewritten. The namespaced fallback is only for purged receipts.
create function public.message_moderation_payload_hash(p_message_id uuid) returns text
language sql stable security invoker set search_path='' as $$
  select coalesce(d.payload_hash,r.payload_hash,q.payload_hash,
    'v1:'||encode(sha256(convert_to('menfess-message-moderation:v1:'||m.request_id::text||':'||
      public.moderation_fingerprint(m.category,m.recipient,m.content),'UTF8')),'hex'))
  from public.messages m left join public.moderation_decisions d using(request_id)
  left join public.idempotency_receipts r using(request_id)
  left join public.message_moderation_jobs q on q.message_id=m.id where m.id=p_message_id;
$$;

create function public.message_has_current_ai_allow(p_message_id uuid) returns boolean
language sql stable security invoker set search_path='' as $$
  select exists(select 1 from public.messages m
    join public.moderation_decisions d using(request_id)
    join public.moderation_control c on c.singleton
    where m.id=p_message_id and d.state='allow' and d.policy_version=c.active_policy
      and d.payload_hash=public.message_moderation_payload_hash(m.id)
      and d.content_hash=public.moderation_fingerprint(m.category,m.recipient,m.content)
      and m.safety_approved_at is not null and m.safety_content_hash=d.content_hash
      and (m.safety_policy_version<>public.local_safety_policy() or exists(
        select 1 from public.message_moderation_jobs q where q.message_id=m.id
          and q.state='approved' and q.target_policy=c.active_policy)));
$$;

-- Row locking needs UPDATE privilege in PostgreSQL. Do not grant callers write
-- access to the publishing switch; expose only this narrow owner-owned lock helper.
create function public.lock_moderation_policy(p_policy_version text,p_require_publishing boolean default false)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.moderation_control where singleton and active_policy=p_policy_version
    and (not p_require_publishing or publishing_enabled) for share;
  return found;
end;
$$;

create or replace function public.guard_moderated_message() returns trigger
language plpgsql security invoker set search_path='' as $$
declare fp text; valid boolean;
begin
  if tg_op='UPDATE' then
    if new.category is distinct from old.category or new.recipient is distinct from old.recipient
      or new.content is distinct from old.content or new.request_id is distinct from old.request_id
      or new.safety_content_hash is distinct from old.safety_content_hash
      or new.safety_policy_version is distinct from old.safety_policy_version
      or new.safety_approved_at is distinct from old.safety_approved_at then
      raise exception 'Accepted message content and admission are immutable' using errcode='23514';
    end if;
  else
    fp:=public.moderation_fingerprint(new.category,new.recipient,new.content);
    valid:=new.safety_approved_at is not null and new.safety_content_hash=fp and (
      (new.safety_policy_version=public.local_safety_policy() and public.local_content_is_safe(new.content,new.recipient))
      or exists(select 1 from public.moderation_decisions d join public.moderation_control c on c.singleton
        where d.request_id=new.request_id and d.state='allow' and d.policy_version=c.active_policy
        and d.policy_version=new.safety_policy_version and d.content_hash=fp));
    if valid is distinct from true then
      raise exception 'Local or AI admission required' using errcode='23514';
    end if;
    new.web_status:=case when new.status='blocked' then 'hidden' else 'visible' end;
    new.web_published_at:=case when new.web_status='visible' then clock_timestamp() else null end;
  end if;
  if tg_op='UPDATE' and new.status is distinct from old.status then
    if new.status='publishing' then
      if not public.message_has_current_ai_allow(new.id)
        or not exists(select 1 from public.moderation_control where singleton and publishing_enabled) then
        raise exception 'Publication moderation gate closed' using errcode='23514';
      end if;
    elsif new.status='published' then
      -- Once Meta was called, a known successful response must be persisted even
      -- after policy changes or switch-off. No second publication attempt occurs.
      if old.status not in ('publishing','failed') or not exists(select 1 from public.publication_jobs j
        where j.message_id=new.id and j.status in ('processing','failed') and j.ambiguous_at is not null
          and j.publication_attempt_token is not null) then
        raise exception 'Durable publication attempt required' using errcode='23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Preserve exactly the rows visible before this migration. Never expose old unsafe rows.
update public.messages set web_status='visible',web_published_at=coalesce(safety_approved_at,created_at)
where status in ('queued','processing','publishing','retry_scheduled','published','failed')
  and safety_approved_at is not null;
create index messages_web_timeline_idx on public.messages(created_at desc,public_id desc) where web_status='visible';
create or replace view public.timeline_messages with (security_invoker=true,security_barrier=true) as
select public_id,category,recipient,content,status,created_at,published_at,ig_permalink
from public.messages where web_status='visible' and safety_approved_at is not null
  and status in ('queued','processing','publishing','retry_scheduled','published','failed');
-- Keep the existing column list/order: API, likes and leaderboard remain compatible.

create or replace function public.enqueue_publication() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status='queued' then
    insert into public.publication_jobs(message_id,eligible_at)
    values(new.id,case when new.safety_policy_version=public.local_safety_policy() then null else clock_timestamp() end)
    on conflict(message_id) do nothing;
  end if;
  return new;
end;
$$;

create function public.enqueue_message_moderation() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.status='queued' and new.safety_policy_version=public.local_safety_policy() then
    perform pg_advisory_xact_lock(hashtextextended('message-moderation-capacity',0));
    if (select count(*) from public.message_moderation_jobs where state='pending')>=10000 then
      raise exception 'Message moderation capacity exhausted' using errcode='53000';
    end if;
    -- Receipt is inserted after this trigger. Resolve it at claim time.
    insert into public.message_moderation_jobs(message_id,payload_hash)
    select new.id,d.payload_hash from (select 1) seed
      left join public.moderation_decisions d on d.request_id=new.request_id
    on conflict(message_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger messages_enqueue_moderation after insert on public.messages
for each row execute function public.enqueue_message_moderation();

create or replace function public.submit_menfess_direct_atomic(
  p_request_id uuid,p_tracking_code_hash text,p_category text,p_recipient text,p_content text,
  p_payload_hash text,p_encrypted_response bytea,p_encryption_key_version text
) returns public.submit_result
language plpgsql security invoker set search_path='' as $$
declare r public.submit_result; fp text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if exists(select 1 from public.moderation_intake where request_id=p_request_id) then
    raise exception 'Request belongs to moderation intake' using errcode='23514';
  end if;
  if exists(select 1 from public.messages where request_id=p_request_id) then
    select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,false
      into r from public.messages m left join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
    if r.receipt_payload_hash is not null and r.receipt_payload_hash<>p_payload_hash then
      raise exception 'Request ID payload conflict' using errcode='23505';
    end if;
    return r;
  end if;
  if p_category is null or p_category not in ('menfess','aspirasi','curhat','apresiasi')
    or public.local_content_is_safe(p_content,p_recipient) is distinct from true then
    raise exception 'Invalid local content' using errcode='23514';
  end if;
  fp:=public.moderation_fingerprint(p_category,p_recipient,p_content);
  if exists(select 1 from public.moderation_decisions where request_id=p_request_id
    and (payload_hash<>p_payload_hash or content_hash<>fp)) then
    raise exception 'Request ID payload conflict' using errcode='23505';
  end if;
  insert into public.messages(request_id,tracking_code_hash,category,recipient,content,status,
    safety_approved_at,safety_policy_version,safety_content_hash)
  values(p_request_id,p_tracking_code_hash,p_category,p_recipient,p_content,'queued',clock_timestamp(),public.local_safety_policy(),fp);
  insert into public.idempotency_receipts(request_id,payload_hash,encrypted_response,encryption_key_version)
  values(p_request_id,p_payload_hash,p_encrypted_response,p_encryption_key_version);
  select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,true
    into r from public.messages m join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
  return r;
end;
$$;

-- Preserve existing reserve semantics, adding immutable accepted-message identity.
create or replace function public.reserve_moderation(p_request_id uuid,p_payload_hash text,p_policy_version text,p_content_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.moderation_decisions; t uuid:=gen_random_uuid(); m public.messages;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if exists(select 1 from public.moderation_intake where request_id=p_request_id and payload_hash<>p_payload_hash) then
    return jsonb_build_object('kind','conflict');
  end if;
  select * into m from public.messages where request_id=p_request_id;
  if found and (p_payload_hash is distinct from public.message_moderation_payload_hash(m.id)
    or p_content_hash is distinct from public.moderation_fingerprint(m.category,m.recipient,m.content)) then
    return jsonb_build_object('kind','conflict');
  end if;
  if not public.lock_moderation_policy(p_policy_version) then return jsonb_build_object('kind','unavailable'); end if;
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

create function public.claim_message_moderation_jobs(p_limit integer,p_policy_version text)
returns table(message_id uuid,request_id uuid,lease_token uuid,input jsonb,payload_hash text)
language plpgsql security invoker set search_path='' as $$
begin
  if p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid worker limit' using errcode='22023'; end if;
  if not public.lock_moderation_policy(p_policy_version) then return; end if;
  return query with due as (
    select q.message_id from public.message_moderation_jobs q
    join public.messages m on m.id=q.message_id
    join public.publication_jobs j on j.message_id=m.id
    where q.state='pending' and q.next_attempt_at<=clock_timestamp()
      and (q.target_policy is null or q.target_policy=p_policy_version)
      and (q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp())
      and m.status in ('queued','retry_scheduled') and j.status in ('queued','retry_scheduled')
      and j.ambiguous_at is null and j.attempt_count<10
    order by q.next_attempt_at,q.message_id limit p_limit for update of q skip locked
  ), claimed as (
    update public.message_moderation_jobs q set target_policy=p_policy_version,
      payload_hash=public.message_moderation_payload_hash(q.message_id),
      lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+interval '60 seconds'
    from due where q.message_id=due.message_id returning q.*
  ) select q.message_id,m.request_id,q.lease_token,
      jsonb_build_object('category',m.category,'recipient',m.recipient,'content',m.content),q.payload_hash
    from claimed q join public.messages m on m.id=q.message_id;
end;
$$;

create function public.release_message_moderation_job(p_message_id uuid,p_lease_token uuid,p_retry_after integer)
returns void language sql security invoker set search_path='' as $$
  update public.message_moderation_jobs set lease_token=null,lease_expires_at=null,
    next_attempt_at=clock_timestamp()+make_interval(secs=>greatest(1,least(coalesce(p_retry_after,60),86400)))
  where message_id=p_message_id and state='pending' and lease_token=p_lease_token
    and lease_expires_at>clock_timestamp();
$$;

create function public.settle_message_moderation_job(p_message_id uuid,p_lease_token uuid,p_decision text,p_policy_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.message_moderation_jobs; m public.messages; d public.moderation_decisions; j public.publication_jobs;
begin
  if not public.lock_moderation_policy(p_policy_version) then return false; end if;
  select * into q from public.message_moderation_jobs where message_id=p_message_id for update;
  if not found or q.state<>'pending' or p_lease_token is null or q.lease_token is distinct from p_lease_token
    or q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp()
    or q.target_policy is distinct from p_policy_version then return false; end if;
  if p_decision is null or p_decision not in ('allow','reject','uncertain','local_reject') then return false; end if;
  select * into j from public.publication_jobs where message_id=p_message_id for update;
  if not found or j.status not in ('queued','retry_scheduled') or j.ambiguous_at is not null then return false; end if;
  select * into m from public.messages where id=p_message_id for update;
  if m.status not in ('queued','retry_scheduled') then return false; end if;
  if p_decision<>'local_reject' then
    select * into d from public.moderation_decisions where request_id=m.request_id for update;
    if d.state is distinct from p_decision or d.policy_version is distinct from p_policy_version
      or d.payload_hash is distinct from q.payload_hash
      or d.payload_hash is distinct from public.message_moderation_payload_hash(m.id)
      or d.content_hash is distinct from public.moderation_fingerprint(m.category,m.recipient,m.content) then return false; end if;
  end if;
  if p_decision='allow' then
    update public.publication_jobs set eligible_at=coalesce(eligible_at,clock_timestamp()) where id=j.id;
  else
    update public.messages set web_status='hidden' where id=m.id;
    update public.publication_jobs set eligible_at=null where id=j.id;
  end if;
  update public.message_moderation_jobs set state=case when p_decision='allow' then 'approved' else 'blocked' end,
    lease_token=null,lease_expires_at=null,settled_at=clock_timestamp() where message_id=m.id;
  return true;
end;
$$;

create function public.enqueue_message_moderation_backfill(p_limit integer default 100) returns integer
language plpgsql security invoker set search_path='' as $$
declare n integer; room integer;
begin
  if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid backfill limit' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('message-moderation-capacity',0));
  select greatest(0,10000-count(*)::integer) into room from public.message_moderation_jobs where state='pending';
  with candidates as (
    select m.id from public.messages m join public.publication_jobs j on j.message_id=m.id
    where m.safety_policy_version=public.local_safety_policy() and m.safety_approved_at is not null
      and m.status in ('queued','retry_scheduled') and m.ig_media_id is null
      and j.status in ('queued','retry_scheduled') and j.ambiguous_at is null and j.attempt_count<10
      and (j.lease_expires_at is null or j.lease_expires_at<=clock_timestamp())
      and not exists(select 1 from public.message_moderation_jobs q where q.message_id=m.id)
    order by m.created_at,m.id limit least(p_limit,room) for update of j skip locked
  ), inserted as (
    insert into public.message_moderation_jobs(message_id,payload_hash)
    select id,public.message_moderation_payload_hash(id) from candidates
    on conflict(message_id) do nothing returning 1
  ) select count(*)::integer into n from inserted;
  return n;
end;
$$;

create or replace function public.claim_publication_jobs(p_limit integer,p_lease_seconds integer)
returns table(job_id uuid,message_id uuid,lock_token uuid,attempt_count integer)
language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); j public.publication_jobs; m public.messages;
begin
  if p_limit is null or p_limit not between 1 and 20 or p_lease_seconds is null or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid worker limits' using errcode='22023';
  end if;
  -- Recover split/expired state before claiming. An attempted Meta call is never retried.
  for j in select pj.* from public.publication_jobs pj
    where (pj.status='processing' and pj.lease_expires_at<=v_now)
      or (pj.status in ('queued','retry_scheduled') and (pj.attempt_count>=10 or pj.ambiguous_at is not null))
    order by pj.id limit 100 for update skip locked
  loop
    select * into m from public.messages where id=j.message_id for update;
    if m.status='published' then
      update public.publication_jobs set status='completed',locked_at=null,lease_expires_at=null,lock_token=null,last_stage='completed' where id=j.id;
    elsif j.ambiguous_at is not null or j.attempt_count>=10 then
      update public.publication_jobs set status='failed',locked_at=null,lease_expires_at=null,lock_token=null,
        last_error_code=case when j.ambiguous_at is not null then 'PUBLISH_AMBIGUOUS' else 'RETRY_EXHAUSTED' end,
        last_stage=case when j.ambiguous_at is not null then 'ambiguous' else 'failed' end where id=j.id;
      update public.messages set status='failed' where id=m.id and status in ('queued','processing','publishing','retry_scheduled');
    else
      update public.publication_jobs set status='retry_scheduled',locked_at=null,lease_expires_at=null,lock_token=null,
        last_stage='lease_expired',next_attempt_at=v_now where id=j.id;
      update public.messages set status='retry_scheduled' where id=m.id and status in ('processing','publishing');
    end if;
  end loop;
  if not public.lock_moderation_policy((select active_policy from public.moderation_control where singleton),true) then return; end if;
  return query with candidates as (
    select pj.id from public.publication_jobs pj join public.messages pm on pm.id=pj.message_id
    where pj.eligible_at is not null and pj.ambiguous_at is null and pj.next_attempt_at<=v_now
      and pj.status in ('queued','retry_scheduled') and pj.attempt_count<10
      and pm.status in ('queued','retry_scheduled') and public.message_has_current_ai_allow(pm.id)
    order by pj.next_attempt_at,pj.id limit p_limit for update of pj,pm skip locked
  ), claimed as (
    update public.publication_jobs pj set status='processing',attempt_count=pj.attempt_count+1,
      locked_at=v_now,lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),
      lock_token=gen_random_uuid(),last_stage='claim',last_error_code=null
    from candidates c where pj.id=c.id returning pj.id,pj.message_id,pj.lock_token,pj.attempt_count
  ), messages_claimed as (
    update public.messages pm set status='processing' from claimed c where pm.id=c.message_id returning pm.id
  ) select c.id,c.message_id,c.lock_token,c.attempt_count from claimed c join messages_claimed mc on mc.id=c.message_id;
end;
$$;

create or replace function public.prepare_ai_publication(p_job_id uuid,p_lock_token uuid,p_policy_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
  if not public.lock_moderation_policy(p_policy_version,true) then return false; end if;
  select j.id into selected from public.publication_jobs j join public.messages m on m.id=j.message_id
    join public.moderation_decisions d on d.request_id=m.request_id
    where j.id=p_job_id and j.lock_token=p_lock_token and j.status='processing'
      and j.lease_expires_at>clock_timestamp() and j.ambiguous_at is null
      and m.status='publishing' and public.message_has_current_ai_allow(m.id)
      and d.policy_version=p_policy_version
    for update of j,m,d;
  if selected is null then return false; end if;
  update public.publication_jobs set ambiguous_at=clock_timestamp(),last_stage='publish_attempted',
    publication_attempt_token=p_lock_token where id=selected;
  return true;
end;
$$;

create or replace function public.guard_message_status() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.status not in ('queued','blocked') then raise exception 'Invalid initial message status' using errcode='23514'; end if;
  elsif new.status<>old.status and not (
    (old.status='queued' and new.status in ('processing','failed')) or
    (old.status='processing' and new.status in ('publishing','retry_scheduled','failed')) or
    (old.status='publishing' and new.status in ('published','retry_scheduled','failed')) or
    (old.status='retry_scheduled' and new.status in ('processing','failed')) or
    (old.status='failed' and new.status='published' and exists(
      select 1 from public.publication_jobs j where j.message_id=new.id and j.status='failed'
        and j.ambiguous_at is not null and j.publication_attempt_token is not null))
  ) then raise exception 'Invalid message status transition' using errcode='23514'; end if;
  return new;
end;
$$;

create or replace function public.complete_publication_job(p_job_id uuid,p_lock_token uuid,p_media_id text,p_permalink text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.publication_jobs;
begin
  select * into j from public.publication_jobs where id=p_job_id for update;
  if not found or p_lock_token is null then return false; end if;
  if j.status='completed' then
    return j.publication_attempt_token=p_lock_token and exists(select 1 from public.messages m
      where m.id=j.message_id and m.status='published' and m.ig_media_id=p_media_id);
  end if;
  if j.status not in ('processing','failed') or j.ambiguous_at is null
    or j.publication_attempt_token is distinct from p_lock_token then return false; end if;
  update public.messages set status='published',ig_media_id=p_media_id,ig_permalink=p_permalink,published_at=clock_timestamp()
    where id=j.message_id and status in ('publishing','failed');
  if not found then return false; end if;
  update public.publication_jobs set status='completed',locked_at=null,lease_expires_at=null,lock_token=null,
    last_stage='completed',ambiguous_at=null,last_error_code=null where id=j.id;
  return true;
end;
$$;

-- Quarantine must retain the marker even if a transport incorrectly labels the error.
create or replace function public.finish_publication_job(p_job_id uuid,p_lock_token uuid,p_error_code text,p_retryable boolean)
returns text language plpgsql security invoker set search_path='' as $$
declare j public.publication_jobs; next_status text; delay_seconds integer;
begin
  select * into j from public.publication_jobs where id=p_job_id and lock_token=p_lock_token and status='processing' for update;
  if not found then return 'stale'; end if;
  -- Approval/configuration drift is not a failed Instagram attempt. Defer even
  -- at attempt 10, but never erase uncertainty once Meta may have been called.
  if p_error_code='MODERATION_REQUIRED' and p_retryable and j.ambiguous_at is null then
    update public.publication_jobs set status='retry_scheduled',attempt_count=greatest(0,attempt_count-1),
      next_attempt_at=clock_timestamp()+interval '60 seconds',locked_at=null,lease_expires_at=null,
      lock_token=null,last_error_code=null,last_stage='moderation_deferred' where id=j.id;
    update public.messages set status='retry_scheduled' where id=j.message_id and status in ('processing','publishing');
    return 'deferred';
  end if;
  if j.ambiguous_at is not null or p_error_code='PUBLISH_AMBIGUOUS' then
    next_status:='failed'; p_error_code:='PUBLISH_AMBIGUOUS';
  elsif p_retryable and j.attempt_count<10 then next_status:='retry_scheduled';
  else next_status:='failed'; end if;
  -- Worker-only gate errors are not a publication error-code enum value.
  if p_error_code='MODERATION_REQUIRED' then p_error_code:='INTERNAL_ERROR'; end if;
  delay_seconds:=least(86400,greatest(15,(2^least(j.attempt_count-1,10))*15))::integer;
  update public.publication_jobs set status=next_status,
    next_attempt_at=case when next_status='retry_scheduled' then clock_timestamp()+make_interval(secs=>delay_seconds) else next_attempt_at end,
    last_error_code=case when p_error_code='PUBLISH_AMBIGUOUS' then p_error_code
      when j.attempt_count>=10 and p_retryable then 'RETRY_EXHAUSTED' else p_error_code end,
    ambiguous_at=case when p_error_code='PUBLISH_AMBIGUOUS' then coalesce(ambiguous_at,clock_timestamp()) else ambiguous_at end,
    locked_at=null,lease_expires_at=null,lock_token=null,
    last_stage=case when p_error_code='PUBLISH_AMBIGUOUS' then 'ambiguous' else next_status end where id=j.id;
  update public.messages set status=next_status where id=j.message_id and status in ('processing','publishing');
  return next_status;
end;
$$;

-- Legacy intake shares the same narrow policy lock (no UPDATE grant on control).
create or replace function public.settle_moderation_intake(p_request_id uuid,p_lease_token uuid,p_decision text,p_policy_version text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare q public.moderation_intake; d public.moderation_decisions;
begin
 select * into q from public.moderation_intake where request_id=p_request_id for update;
 if not found or q.state<>'pending' or p_lease_token is null or q.lease_token is distinct from p_lease_token
   or q.lease_expires_at is null or q.lease_expires_at<=clock_timestamp() then return false; end if;
 if p_decision is null or p_decision not in ('allow','reject','uncertain','local_reject') then return false; end if;
 -- Hold the active policy stable through the transaction and all publication guards.
 if not public.lock_moderation_policy(p_policy_version) then return false; end if;
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

-- No browser access to helpers, triggers, or queue RPCs.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('message_moderation_payload_hash','message_has_current_ai_allow',
      'enqueue_message_moderation','claim_message_moderation_jobs','release_message_moderation_job',
      'settle_message_moderation_job','enqueue_message_moderation_backfill','local_content_is_safe','lock_moderation_policy')
  loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end;
$$;
commit;
