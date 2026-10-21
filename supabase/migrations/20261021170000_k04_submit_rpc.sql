-- K-04 atomic submit primitive. Secrets and encryption remain in the Edge Function.
begin;

create type public.submit_result as (
  request_id uuid,
  tracking_code_hash text,
  receipt_payload_hash text,
  encrypted_response bytea,
  encryption_key_version text,
  expires_at timestamptz,
  inserted boolean
);

create function public.submit_menfess_atomic(
  p_request_id uuid,
  p_tracking_code_hash text,
  p_category text,
  p_recipient text,
  p_content text,
  p_payload_hash text,
  p_encrypted_response bytea,
  p_encryption_key_version text
) returns public.submit_result
language plpgsql security invoker set search_path = '' as $$
declare r public.submit_result;
begin
  insert into public.messages(request_id, tracking_code_hash, category, recipient, content)
  values (p_request_id, p_tracking_code_hash, p_category, p_recipient, p_content)
  on conflict (request_id) do nothing;

  insert into public.idempotency_receipts(request_id, payload_hash, encrypted_response, encryption_key_version)
  values (p_request_id, p_payload_hash, p_encrypted_response, p_encryption_key_version)
  on conflict (request_id) do nothing;

  select m.request_id, m.tracking_code_hash, i.payload_hash, i.encrypted_response,
         i.encryption_key_version, i.expires_at,
         (m.tracking_code_hash = p_tracking_code_hash and i.payload_hash = p_payload_hash)
    into r
    from public.messages m join public.idempotency_receipts i using (request_id)
   where m.request_id = p_request_id;
  if not found then raise exception 'submit result unavailable' using errcode = '40001'; end if;
  return r;
end;
$$;

revoke all on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text) from public, anon, authenticated;
grant execute on function public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text) to service_role;
commit;
