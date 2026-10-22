-- K-06: durable worker claims and safe activation. Existing jobs remain ineligible.
begin;

alter table public.publication_jobs add column if not exists eligible_at timestamptz;
alter table public.publication_jobs add column if not exists container_id text;
alter table public.publication_jobs add column if not exists ambiguous_at timestamptz;
alter table public.publication_jobs add column if not exists last_stage text;

create index if not exists publication_jobs_eligible_due_idx
  on public.publication_jobs (next_attempt_at, id)
  where status in ('queued', 'retry_scheduled') and eligible_at is not null;

create or replace function public.enqueue_publication() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'queued' then
    insert into public.publication_jobs (message_id, eligible_at) values (new.id, clock_timestamp());
  end if;
  return new;
end;
$$;

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
    where j.eligible_at is not null
      and j.next_attempt_at <= v_now
      and ((j.status in ('queued','retry_scheduled'))
        or (j.status = 'processing' and j.lease_expires_at <= v_now))
      and j.attempt_count < 10
    order by j.next_attempt_at, j.id
    for update skip locked limit p_limit
  ), claimed as (
    update public.publication_jobs j
    set status = 'processing', attempt_count = j.attempt_count + 1,
        locked_at = v_now, lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
        lock_token = gen_random_uuid(), last_stage = 'claim', last_error_code = null
    from candidates c where j.id = c.id
    returning j.id, j.message_id, j.lock_token, j.attempt_count
  )
  select c.id, c.message_id, c.lock_token, c.attempt_count from claimed c;
end;
$$;

create or replace function public.activate_legacy_publication_job(p_job_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed boolean;
begin
  update public.publication_jobs set eligible_at = clock_timestamp()
  where id = p_job_id and eligible_at is null and status = 'queued';
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.claim_publication_jobs(integer, integer) from public, anon, authenticated;
revoke all on function public.activate_legacy_publication_job(uuid) from public, anon, authenticated;
grant execute on function public.claim_publication_jobs(integer, integer) to service_role;
grant execute on function public.activate_legacy_publication_job(uuid) to service_role;

insert into storage.buckets (id, name, public)
values ('instagram-publications', 'instagram-publications', true)
on conflict (id) do update set public = true;

commit;
