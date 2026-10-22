-- Atomic publication failure handling: retry transient failures, quarantine ambiguity,
-- and recover expired leases without leaving the message/job states split.
begin;

create function public.complete_publication_job(
  p_job_id uuid, p_lock_token uuid, p_media_id text, p_permalink text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare mid uuid;
begin
  select message_id into mid from public.publication_jobs
    where id=p_job_id and lock_token=p_lock_token and status='processing' and ambiguous_at is not null
    for update;
  if not found then return false; end if;
  update public.messages set status='published', ig_media_id=p_media_id,
    ig_permalink=p_permalink, published_at=clock_timestamp()
    where id=mid and status='publishing';
  if not found then return false; end if;
  update public.publication_jobs set status='completed', locked_at=null,
    lease_expires_at=null, lock_token=null, last_stage='completed', ambiguous_at=null
    where id=p_job_id and lock_token=p_lock_token and status='processing';
  return found;
end;
$$;

create or replace function public.finish_publication_job(
  p_job_id uuid,
  p_lock_token uuid,
  p_error_code text,
  p_retryable boolean
) returns text
language plpgsql security invoker set search_path = '' as $$
declare
  j public.publication_jobs%rowtype;
  next_status text;
  delay_seconds integer;
begin
  select * into j
  from public.publication_jobs
  where id = p_job_id and lock_token = p_lock_token and status = 'processing'
  for update;
  if not found then return 'stale'; end if;

  -- A publish attempt has an unknown outcome. Never retry it automatically.
  if p_error_code = 'PUBLISH_AMBIGUOUS' or j.ambiguous_at is not null then
    next_status := 'failed';
  elsif p_retryable and j.attempt_count < 10 then
    next_status := 'retry_scheduled';
  else
    next_status := 'failed';
  end if;

  if next_status = 'retry_scheduled' then
    delay_seconds := least(86400, greatest(15, (2 ^ least(j.attempt_count - 1, 10)) * 15));
    update public.publication_jobs
      set status = next_status, next_attempt_at = clock_timestamp() + make_interval(secs => delay_seconds),
          last_error_code = p_error_code, locked_at = null, lease_expires_at = null,
          lock_token = null, last_stage = 'retry_scheduled'
      where id = j.id;
    update public.messages set status = 'retry_scheduled'
      where id = j.message_id and status in ('processing','publishing');
  else
    update public.publication_jobs
      set status = 'failed', last_error_code = case when j.attempt_count >= 10 and p_retryable then 'RETRY_EXHAUSTED' else p_error_code end,
          locked_at = null, lease_expires_at = null, lock_token = null,
          last_stage = case when p_error_code = 'PUBLISH_AMBIGUOUS' then 'ambiguous' else 'failed' end
      where id = j.id;
    update public.messages set status = 'failed'
      where id = j.message_id and status in ('processing','publishing');
  end if;
  return next_status;
end;
$$;

revoke all on function public.complete_publication_job(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.complete_publication_job(uuid,uuid,text,text) to service_role;
revoke all on function public.finish_publication_job(uuid,uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.finish_publication_job(uuid,uuid,text,boolean) to service_role;
commit;
