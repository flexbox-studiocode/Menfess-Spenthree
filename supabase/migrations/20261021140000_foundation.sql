-- K-03: internal tables are server-only. No browser table privileges.
begin;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null unique default gen_random_uuid(),
  request_id uuid not null unique,
  tracking_code_hash text not null unique check (tracking_code_hash ~ '^v1:[0-9a-f]{64}$'),
  category text not null check (category in ('menfess', 'aspirasi', 'curhat', 'apresiasi')),
  recipient text check (recipient is null or (char_length(recipient) between 1 and 80 and recipient = btrim(recipient) and recipient !~ '[[:cntrl:]]')),
  content text not null check (char_length(content) between 10 and 500 and content = btrim(content) and content !~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'publishing', 'published', 'retry_scheduled', 'failed', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  ig_media_id text unique check (ig_media_id is null or ig_media_id ~ '^[0-9]{1,64}$'),
  ig_permalink text check (ig_permalink is null or ig_permalink ~ '^https://www\.instagram\.com/(p|reel)/[A-Za-z0-9_-]+/$'),
  rendered_image_path text check (rendered_image_path is null or char_length(rendered_image_path) between 1 and 512),
  constraint publication_confirmation check (
    (status = 'published' and published_at is not null and ig_media_id is not null)
    or (status <> 'published' and published_at is null)
  )
);

create index messages_feed_idx on public.messages (published_at desc, public_id desc) where status = 'published';
create index messages_category_feed_idx on public.messages (category, published_at desc, public_id desc) where status = 'published';

create table public.publication_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'retry_scheduled', 'completed', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  lease_expires_at timestamptz,
  lock_token uuid,
  last_error_code text check (last_error_code in ('RENDER_FAILED', 'MEDIA_UNAVAILABLE', 'IG_RATE_LIMIT', 'IG_AUTH_REQUIRED', 'IG_TEMPORARY', 'PUBLISH_AMBIGUOUS', 'RETRY_EXHAUSTED', 'INTERNAL_ERROR')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_lease check (
    (status = 'processing' and locked_at is not null and lease_expires_at is not null and lease_expires_at > locked_at and lock_token is not null)
    or (status <> 'processing' and locked_at is null and lease_expires_at is null and lock_token is null)
  )
);
create index publication_jobs_due_idx on public.publication_jobs (next_attempt_at, id) where status in ('queued', 'retry_scheduled');
create index publication_jobs_lease_idx on public.publication_jobs (lease_expires_at) where status = 'processing';

-- Ciphertext is produced by the future backend, NEVER by a SQL-embedded secret.
-- Request tombstone remains in messages after this short-lived receipt is purged.
create table public.idempotency_receipts (
  request_id uuid primary key references public.messages(request_id) on delete cascade,
  payload_hash text not null check (payload_hash ~ '^v1:[0-9a-f]{64}$'),
  encrypted_response bytea not null check (octet_length(encrypted_response) between 1 and 8192),
  encryption_key_version text not null check (encryption_key_version ~ '^v[0-9]{1,4}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at and expires_at <= created_at + interval '24 hours')
);
create index idempotency_receipts_expiry_idx on public.idempotency_receipts (expires_at);

create function public.touch_updated_at() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger messages_updated before update on public.messages for each row execute function public.touch_updated_at();
create trigger jobs_updated before update on public.publication_jobs for each row execute function public.touch_updated_at();

create function public.guard_message_status() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('queued', 'blocked') then
      raise exception 'Invalid initial message status' using errcode = '23514';
    end if;
  elsif new.status <> old.status and not (
    (old.status = 'queued' and new.status in ('processing', 'failed')) or
    (old.status = 'processing' and new.status in ('publishing', 'retry_scheduled', 'failed')) or
    (old.status = 'publishing' and new.status in ('published', 'retry_scheduled', 'failed')) or
    (old.status = 'retry_scheduled' and new.status in ('processing', 'failed'))
  ) then
    raise exception 'Invalid message status transition' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger messages_status before insert or update of status on public.messages for each row execute function public.guard_message_status();

-- Transactional outbox: a queued message always gets exactly one primary job.
create function public.enqueue_publication() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'queued' then
    insert into public.publication_jobs (message_id) values (new.id);
  end if;
  return new;
end;
$$;
create trigger messages_enqueue after insert on public.messages for each row execute function public.enqueue_publication();

create function public.purge_expired_receipts() returns bigint
language sql security invoker set search_path = '' as $$
  with deleted as (
    delete from public.idempotency_receipts where expires_at <= now() returning 1
  ) select count(*) from deleted;
$$;

-- API backend reads this projection, not SELECT * on messages.
-- Invoker semantics preserve grants/RLS; only the trusted server can read it.
create view public.published_messages with (security_invoker = true, security_barrier = true) as
select public_id, category, recipient, content, published_at, ig_permalink
from public.messages where status = 'published';

alter table public.messages enable row level security;
alter table public.publication_jobs enable row level security;
alter table public.idempotency_receipts enable row level security;

-- No policies for anon/authenticated: deliberate default-deny, including reads.
revoke all on table public.messages, public.publication_jobs, public.idempotency_receipts, public.published_messages from public, anon, authenticated;
revoke all on function public.touch_updated_at(), public.guard_message_status(), public.enqueue_publication(), public.purge_expired_receipts() from public, anon, authenticated;
grant select, insert, update, delete on public.messages, public.publication_jobs, public.idempotency_receipts to service_role;
grant select on public.published_messages to service_role;
grant execute on function public.touch_updated_at(), public.guard_message_status(), public.enqueue_publication(), public.purge_expired_receipts() to service_role;

-- Supabase supports pg_cron on local and hosted PostgreSQL. Receipts are
-- inaccessible to clients and physically purged hourly (at most 1h TTL lag).
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('purge-menfess-receipts', '17 * * * *', 'select public.purge_expired_receipts()');

commit;
