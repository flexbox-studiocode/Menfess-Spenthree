-- Operator-only reconciliation. NEVER infer not_published from a timeout, a missing
-- receipt, or container PUBLISHED. Verify Meta/account evidence outside this RPC.
-- p_evidence_sha256 is a SHA-256 reference to retained evidence, not raw API data.
-- No service_role EXECUTE grant: invoke as the database owner after investigation.
begin;
create table public.publication_reconciliations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.publication_jobs(id),
  outcome text not null check (outcome in ('published','not_published')),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text not null check (reason_code in ('meta_media_verified','meta_nonpublication_verified')),
  previous_ambiguous_at timestamptz not null,
  actor text not null default session_user,
  created_at timestamptz not null default clock_timestamp(),
  check ((outcome='published' and reason_code='meta_media_verified') or
    (outcome='not_published' and reason_code='meta_nonpublication_verified'))
);
alter table public.publication_reconciliations enable row level security;
revoke all on public.publication_reconciliations from public,anon,authenticated,service_role;
grant select on public.publication_reconciliations to service_role;

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
        and j.ambiguous_at is not null and j.publication_attempt_token is not null)) or
    (old.status='failed' and new.status='retry_scheduled' and exists(
      select 1 from public.publication_jobs j join public.publication_reconciliations r on r.job_id=j.id
      where j.message_id=new.id and j.status='failed' and j.ambiguous_at=r.previous_ambiguous_at
        and r.outcome='not_published' and r.created_at>=transaction_timestamp()))
  ) then raise exception 'Invalid message status transition' using errcode='23514'; end if;
  return new;
end;
$$;

create function public.reconcile_publication_job(
  p_job_id uuid,p_outcome text,p_evidence_sha256 text,p_reason_code text,
  p_media_id text default null,p_permalink text default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare j public.publication_jobs; m public.messages; t uuid;
begin
  if p_outcome is null or p_outcome not in ('published','not_published')
    or p_evidence_sha256 is null or p_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or p_reason_code is distinct from (case when p_outcome='published' then 'meta_media_verified' else 'meta_nonpublication_verified' end) then
    raise exception 'Verified reconciliation evidence required' using errcode='22023';
  end if;
  select * into j from public.publication_jobs where id=p_job_id for update;
  if not found or j.status<>'failed' or j.ambiguous_at is null then return false; end if;
  select * into m from public.messages where id=j.message_id for update;
  if m.status<>'failed' or m.ig_media_id is not null then return false; end if;
  if p_outcome='published' then
    if p_media_id is null or p_media_id !~ '^[0-9]{1,64}$' then
      raise exception 'Confirmed media ID required' using errcode='22023';
    end if;
  else
    -- The operator must stop the publisher/scheduler and drain all old invocations
    -- before supplying evidence. A missing post while an old request is live is not proof.
    if p_media_id is not null or p_permalink is not null or j.attempt_count>=10
      or j.ambiguous_at>clock_timestamp()-interval '15 minutes'
      or exists(select 1 from public.moderation_control where singleton and publishing_enabled)
      or not public.message_has_current_ai_allow(m.id) then return false; end if;
  end if;
  insert into public.publication_reconciliations(job_id,outcome,evidence_sha256,reason_code,previous_ambiguous_at)
  values(j.id,p_outcome,p_evidence_sha256,p_reason_code,j.ambiguous_at);
  if p_outcome='published' then
    t:=coalesce(j.publication_attempt_token,gen_random_uuid());
    update public.publication_jobs set publication_attempt_token=t where id=j.id;
    return public.complete_publication_job(j.id,t,p_media_id,p_permalink);
  end if;
  update public.messages set status='retry_scheduled' where id=m.id;
  update public.publication_jobs set status='retry_scheduled',ambiguous_at=null,publication_attempt_token=null,
    container_id=null,next_attempt_at=clock_timestamp(),last_error_code=null,last_stage='operator_reconciled',
    eligible_at=clock_timestamp() where id=j.id;
  return true;
end;
$$;
revoke all on function public.reconcile_publication_job(uuid,text,text,text,text,text) from public,anon,authenticated,service_role;
commit;
