begin;
do $$
declare rid uuid:=gen_random_uuid(); mid uuid; jid uuid; token uuid;
  policy text:='v1:'||repeat('4',64); body text:='Synthetic publication recovery integration fixture.';
begin
  update public.moderation_control set active_policy=policy,publishing_enabled=true;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('5',64),policy,public.moderation_fingerprint('menfess',null,body),'allow');
  insert into public.messages(request_id,tracking_code_hash,category,content,safety_approved_at,safety_policy_version,safety_content_hash)
  values(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),'menfess',body,now(),policy,
    public.moderation_fingerprint('menfess',null,body)) returning id into mid;
  select id into jid from public.publication_jobs where message_id=mid;
  update public.publication_jobs set attempt_count=9 where id=jid;
  set local role service_role;
  select lock_token into token from public.claim_publication_jobs(20,240) where message_id=mid;
  assert token is not null;
  assert public.finish_publication_job(jid,token,'MODERATION_REQUIRED',true)='deferred','Last-attempt deferral exhausted';
  assert (select attempt_count=9 and status='retry_scheduled' and ambiguous_at is null from public.publication_jobs where id=jid);
  update public.publication_jobs set next_attempt_at=now()-interval '1 minute' where id=jid;
  select lock_token into token from public.claim_publication_jobs(20,240) where message_id=mid;
  -- Container PUBLISHED without a known receipt: no prepare call but still ambiguous.
  assert public.finish_publication_job(jid,token,'PUBLISH_AMBIGUOUS',true)='failed';
  assert (select ambiguous_at is not null and last_error_code='PUBLISH_AMBIGUOUS' from public.publication_jobs where id=jid);
  assert not exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid);
  reset role;
  assert not has_function_privilege('service_role','public.reconcile_publication_job(uuid,text,text,text,text,text)','execute');
  assert not public.reconcile_publication_job(jid,'not_published',repeat('6',64),'meta_nonpublication_verified'),
    'Exhausted job automatically reset during reconciliation';
  assert public.reconcile_publication_job(jid,'published',repeat('7',64),'meta_media_verified','987654321',null),
    'Operator could not persist confirmed publication';
  assert (select status='published' from public.messages where id=mid);
  assert (select count(*) from public.publication_reconciliations where job_id=jid)=1;
  raise notice 'PASS: service claims, attempt-10 gate deferral, early ambiguity, operator-only confirmed reconciliation';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); mid uuid; jid uuid; token uuid;
  policy text:='v1:'||repeat('8',64); body text:='Synthetic proven nonpublication recovery fixture.';
begin
  update public.moderation_control set active_policy=policy,publishing_enabled=true;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('9',64),policy,public.moderation_fingerprint('menfess',null,body),'allow');
  insert into public.messages(request_id,tracking_code_hash,category,content,safety_approved_at,safety_policy_version,safety_content_hash)
  values(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),'menfess',body,now(),policy,
    public.moderation_fingerprint('menfess',null,body)) returning id into mid;
  select id into jid from public.publication_jobs where message_id=mid;
  select lock_token into token from public.claim_publication_jobs(20,240) where message_id=mid;
  perform public.finish_publication_job(jid,token,'PUBLISH_AMBIGUOUS',false);
  assert not public.reconcile_publication_job(jid,'not_published',repeat('a',64),'meta_nonpublication_verified'),
    'Live publisher/recent attempt allowed nonpublication reset';
  update public.moderation_control set publishing_enabled=false;
  assert not public.reconcile_publication_job(jid,'not_published',repeat('a',64),'meta_nonpublication_verified'),
    'Recent ambiguous attempt bypassed drain interval';
  update public.publication_jobs set ambiguous_at=now()-interval '16 minutes' where id=jid;
  assert public.reconcile_publication_job(jid,'not_published',repeat('a',64),'meta_nonpublication_verified');
  update public.moderation_control set publishing_enabled=true;
  assert (select status='retry_scheduled' and ambiguous_at is null and container_id is null from public.publication_jobs where id=jid);
  assert exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid),'Proven nonpublication was not retryable';
  assert (select count(*) from public.publication_reconciliations where job_id=jid)=1;
  raise notice 'PASS: audited operator nonpublication permits bounded retry with current AI';
end;
$$;
rollback;
