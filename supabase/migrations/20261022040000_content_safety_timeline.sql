-- Content safety is fail-closed: existing rows remain unapproved until explicitly
-- revalidated by trusted server code. This migration never changes content/status.
begin;

alter table public.messages
  add column safety_approved_at timestamptz,
  add column safety_policy_version text,
  add constraint messages_safety_approval_complete check (
    (safety_approved_at is null and safety_policy_version is null) or
    (safety_approved_at is not null and safety_policy_version ~ '^v1:[0-9a-f]{64}$')
  ),
  add constraint messages_published_requires_safety check (
    status <> 'published' or safety_approved_at is not null
  ) not valid;

-- Existing published rows intentionally remain valid in storage but invisible.
-- Validate only after legacy rows have been revalidated or moved from published.
create index messages_safe_timeline_idx on public.messages
  (created_at desc, public_id desc) where status in ('queued', 'processing', 'publishing', 'retry_scheduled', 'published', 'failed') and safety_approved_at is not null;
create index messages_safe_category_timeline_idx on public.messages
  (category, created_at desc, public_id desc) where status in ('queued', 'processing', 'publishing', 'retry_scheduled', 'published', 'failed') and safety_approved_at is not null;

create view public.timeline_messages with (security_invoker = true, security_barrier = true) as
select public_id, category, recipient, content, status, created_at, published_at, ig_permalink
from public.messages
where status in ('queued', 'processing', 'publishing', 'retry_scheduled', 'published', 'failed')
  and safety_approved_at is not null;

revoke all on table public.timeline_messages from public, anon, authenticated;
grant select on public.timeline_messages to service_role;

create or replace function public.submit_menfess_atomic(
  p_request_id uuid, p_tracking_code_hash text, p_category text, p_recipient text,
  p_content text, p_payload_hash text, p_encrypted_response bytea,
  p_encryption_key_version text, p_safety_policy_version text
) returns public.submit_result
language plpgsql security invoker set search_path = '' as $$
declare r public.submit_result; message_inserted boolean;
begin
  if p_safety_policy_version !~ '^v1:[0-9a-f]{64}$' then
    raise exception 'Invalid safety approval' using errcode = '23514';
  end if;
  insert into public.messages(request_id, tracking_code_hash, category, recipient, content, safety_approved_at, safety_policy_version)
  values (p_request_id, p_tracking_code_hash, p_category, p_recipient, p_content, clock_timestamp(), p_safety_policy_version)
  on conflict (request_id) do nothing;
  message_inserted := found;
  if not message_inserted and not exists (select 1 from public.idempotency_receipts where request_id = p_request_id) then
    select m.request_id, m.tracking_code_hash, null::text, null::bytea, null::text, null::timestamptz, false
    into r from public.messages m where m.request_id = p_request_id;
    return r;
  end if;
  insert into public.idempotency_receipts(request_id, payload_hash, encrypted_response, encryption_key_version)
  values (p_request_id, p_payload_hash, p_encrypted_response, p_encryption_key_version)
  on conflict (request_id) do nothing;
  select m.request_id, m.tracking_code_hash, i.payload_hash, i.encrypted_response,
         i.encryption_key_version, i.expires_at, message_inserted
  into r from public.messages m join public.idempotency_receipts i using (request_id)
  where m.request_id = p_request_id;
  if not found then raise exception 'submit result unavailable' using errcode = '40001'; end if;
  return r;
end;
$$;
-- Keep the legacy signature during the rolling deploy, but make it fail closed.
-- It remains callable only so old function instances receive a controlled maintenance error.
create or replace function public.submit_menfess_atomic(
  p_request_id uuid, p_tracking_code_hash text, p_category text, p_recipient text,
  p_content text, p_payload_hash text, p_encrypted_response bytea,
  p_encryption_key_version text
) returns public.submit_result
language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Submit temporarily unavailable during safety rollout'
    using errcode = '55000';
end;
$$;
revoke all on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text) from public, anon, authenticated;
grant execute on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text) to service_role;
revoke all on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text,text) from public, anon, authenticated;
grant execute on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text,text) to service_role;

commit;
