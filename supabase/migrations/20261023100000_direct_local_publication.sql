begin;

-- Direct publication mode: deterministic local safety validation replaces the AI gate.
-- The value identifies this exact local rule set; it is not an AI policy hash.
create or replace function public.local_safety_policy() returns text
language sql immutable set search_path='' as $$ select 'v1:1111111111111111111111111111111111111111111111111111111111111111'::text $$;

create or replace function public.local_content_is_safe(p_content text, p_recipient text) returns boolean
language sql immutable set search_path='' as $$
  select p_content is not null
    and char_length(p_content) between 10 and 500
    and p_content !~ '[[:cntrl:]]'
    and (p_recipient is null or (char_length(p_recipient) between 1 and 80 and p_recipient !~ '[[:cntrl:]]'))
    and p_content !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}'
    and p_content !~* '(https?://|www\\.)\\S+'
    and p_content !~* '(^|\\s)@[A-Z0-9._]{3,30}\\b'
    and p_content !~* '(kontol|ngentot|memek)'
    and p_content !~ '(?:\\+?62|0)[\\s().-]*(?:\\d[\\s().-]*){8,13}\\b';
$$;

create or replace function public.guard_moderated_message() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.category is distinct from old.category or new.recipient is distinct from old.recipient or new.content is distinct from old.content or new.request_id is distinct from old.request_id) then
    raise exception 'Accepted message content is immutable' using errcode='23514';
  end if;
  if new.safety_approved_at is null or new.safety_policy_version is distinct from public.local_safety_policy()
     or not public.local_content_is_safe(new.content,new.recipient) then
    raise exception 'Local content validation required' using errcode='23514';
  end if;
  if new.safety_content_hash is distinct from public.moderation_fingerprint(new.category,new.recipient,new.content) then
    raise exception 'Invalid content fingerprint' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.submit_menfess_direct_atomic(
  p_request_id uuid,p_tracking_code_hash text,p_category text,p_recipient text,p_content text,
  p_payload_hash text,p_encrypted_response bytea,p_encryption_key_version text
) returns public.submit_result
language plpgsql security invoker set search_path='' as $$
declare r public.submit_result; inserted boolean; fp text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  if p_category not in ('menfess','aspirasi','curhat','apresiasi') or not public.local_content_is_safe(p_content,p_recipient) then
    raise exception 'Invalid local content' using errcode='23514';
  end if;
  if exists(select 1 from public.messages where request_id=p_request_id) then
    select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,false
      into r from public.messages m left join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
    if r.receipt_payload_hash is distinct from p_payload_hash then raise exception 'Request ID payload conflict' using errcode='23505'; end if;
    return r;
  end if;
  fp := public.moderation_fingerprint(p_category,p_recipient,p_content);
  insert into public.messages(request_id,tracking_code_hash,category,recipient,content,status,safety_approved_at,safety_policy_version,safety_content_hash)
    values(p_request_id,p_tracking_code_hash,p_category,p_recipient,p_content,'queued',clock_timestamp(),public.local_safety_policy(),fp);
  inserted := true;
  insert into public.idempotency_receipts(request_id,payload_hash,encrypted_response,encryption_key_version)
    values(p_request_id,p_payload_hash,p_encrypted_response,p_encryption_key_version);
  select m.request_id,m.tracking_code_hash,i.payload_hash,i.encrypted_response,i.encryption_key_version,i.expires_at,inserted
    into r from public.messages m join public.idempotency_receipts i using(request_id) where m.request_id=p_request_id;
  return r;
end;
$$;
revoke all on function public.submit_menfess_direct_atomic(uuid,text,text,text,text,text,bytea,text) from public,anon,authenticated;
grant execute on function public.submit_menfess_direct_atomic(uuid,text,text,text,text,text,bytea,text) to service_role;
commit;
