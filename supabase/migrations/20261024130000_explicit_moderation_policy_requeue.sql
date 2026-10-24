-- Explicit owner-only policy refresh. No automatic reset on deploy/policy change.
-- Admission and web visibility are untouched; approval never unhides a rejected row.
begin;
create function public.requeue_message_moderation(p_message_id uuid,p_policy_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare q public.message_moderation_jobs; j public.publication_jobs; m public.messages;
  d public.moderation_decisions; pending_count integer; had_job boolean;
begin
  if p_message_id is null or p_policy_version is null or p_policy_version !~ '^v1:[0-9a-f]{64}$' then
    raise exception 'Invalid moderation requeue arguments' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('message-moderation-capacity',0));
  if not public.lock_moderation_policy(p_policy_version) then return false; end if;
  select * into q from public.message_moderation_jobs where message_id=p_message_id for update;
  had_job:=found;
  if had_job and (q.target_policy=p_policy_version or q.lease_expires_at>clock_timestamp()) then return false; end if;
  select * into j from public.publication_jobs where message_id=p_message_id for update;
  if not found or j.status not in ('queued','retry_scheduled') or j.ambiguous_at is not null
    or j.publication_attempt_token is not null or j.attempt_count>=10
    or j.lease_expires_at>clock_timestamp() then return false; end if;
  select * into m from public.messages where id=p_message_id for update;
  -- Local admission only. Legacy AI admissions, including pre-eligibility jobs,
  -- are never activated by this RPC. No confirmed/failed/blocked message reset.
  if not found or m.safety_policy_version is distinct from public.local_safety_policy()
    or m.safety_approved_at is null or m.status not in ('queued','retry_scheduled')
    or m.ig_media_id is not null or m.published_at is not null then return false; end if;
  select * into d from public.moderation_decisions where request_id=m.request_id for update;
  if found and d.lease_expires_at>clock_timestamp() then return false; end if;
  if not had_job or q.state<>'pending' then
    select count(*)::integer into pending_count from public.message_moderation_jobs where state='pending';
    if pending_count>=10000 then raise exception 'Message moderation capacity exhausted' using errcode='53000'; end if;
  end if;
  insert into public.message_moderation_jobs(message_id,target_policy,payload_hash)
  values(m.id,p_policy_version,public.message_moderation_payload_hash(m.id))
  on conflict(message_id) do update set state='pending',target_policy=excluded.target_policy,
    payload_hash=excluded.payload_hash,lease_token=null,lease_expires_at=null,
    next_attempt_at=clock_timestamp(),settled_at=null;
  update public.publication_jobs set eligible_at=null where id=j.id;
  return true;
end;
$$;
-- Database owner invokes after deliberate policy rollout. Never worker/browser callable.
revoke all on function public.requeue_message_moderation(uuid,text) from public,anon,authenticated,service_role;
commit;
