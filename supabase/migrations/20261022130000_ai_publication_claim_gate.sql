-- Claims must respect current AI approval and stop ambiguous Meta publication retries.
begin;
create or replace function public.claim_publication_jobs(p_limit integer, p_lease_seconds integer)
returns table (job_id uuid, message_id uuid, lock_token uuid, attempt_count integer)
language plpgsql security invoker set search_path = '' as $$
declare v_now timestamptz := clock_timestamp();
begin
  if p_limit not between 1 and 20 or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid worker limits' using errcode = '22023';
  end if;
  return query
  with candidates as (
    select j.id from public.publication_jobs j
    join public.messages m on m.id=j.message_id
    join public.moderation_decisions d on d.request_id=m.request_id
    join public.moderation_control c on c.singleton
    where c.publishing_enabled and d.state='allow'
      and d.policy_version=c.active_policy and m.safety_policy_version=c.active_policy
      and m.safety_approved_at is not null and m.safety_content_hash=d.content_hash
      and d.content_hash=public.moderation_fingerprint(m.category,m.recipient,m.content)
      and m.status in ('queued','processing','publishing','retry_scheduled')
      and j.eligible_at is not null and j.ambiguous_at is null
      and j.next_attempt_at <= v_now
      and (j.status in ('queued','retry_scheduled') or (j.status='processing' and j.lease_expires_at <= v_now))
      and j.attempt_count < 10
    order by j.next_attempt_at,j.id
    for update of j skip locked limit p_limit
  ), claimed as (
    update public.publication_jobs j
    set status='processing',attempt_count=j.attempt_count+1,
        locked_at=v_now,lease_expires_at=v_now+make_interval(secs=>p_lease_seconds),
        lock_token=gen_random_uuid(),last_stage='claim',last_error_code=null
    from candidates c where j.id=c.id
    returning j.id,j.message_id,j.lock_token,j.attempt_count
  ) select c.id,c.message_id,c.lock_token,c.attempt_count from claimed c;
end;
$$;
create function public.prepare_ai_publication(p_job_id uuid,p_lock_token uuid,p_policy_version text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare selected uuid;
begin
  select j.id into selected from public.publication_jobs j
  join public.messages m on m.id=j.message_id
  join public.moderation_decisions d on d.request_id=m.request_id
  join public.moderation_control c on c.singleton
  where j.id=p_job_id and j.lock_token=p_lock_token and j.status='processing'
    and j.lease_expires_at>clock_timestamp() and j.ambiguous_at is null
    and c.publishing_enabled and c.active_policy=p_policy_version
    and m.status='publishing' and m.safety_approved_at is not null
    and d.state='allow' and d.policy_version=p_policy_version and m.safety_policy_version=p_policy_version
    and d.content_hash=m.safety_content_hash
    and d.content_hash=public.moderation_fingerprint(m.category,m.recipient,m.content)
  for update of j,m,d;
  if selected is null then return false; end if;
  update public.publication_jobs set ambiguous_at=clock_timestamp(),last_stage='publish_attempted' where id=selected;
  return true;
end;
$$;
revoke all on function public.prepare_ai_publication(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.prepare_ai_publication(uuid,uuid,text) to service_role;
commit;
