begin;
do $$
declare rid uuid:=gen_random_uuid(); mid uuid; jid uuid; total integer; token uuid;
  policy text:='v1:'||repeat('a',64); content text:='Synthetic publication gate test message.';
begin
  update public.moderation_control set active_policy=policy,publishing_enabled=false;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('b',64),policy,public.moderation_fingerprint('menfess',null,content),'allow');
  insert into public.messages(request_id,tracking_code_hash,category,content,safety_approved_at,safety_policy_version,safety_content_hash)
  values(rid,'v1:'||repeat('c',64),'menfess',content,now(),policy,public.moderation_fingerprint('menfess',null,content)) returning id into mid;
  select id into jid from public.publication_jobs where message_id=mid;
  select count(*) into total from public.claim_publication_jobs(3,240);
  assert total=0,'Disabled gate claimed a job';
  update public.moderation_control set publishing_enabled=true;
  update public.moderation_decisions set state='uncertain',reasons=array['sensitive_context'] where request_id=rid;
  select count(*) into total from public.claim_publication_jobs(3,240);
  assert total=0,'Uncertain decision claimed';
  update public.moderation_decisions set state='allow',reasons='{}' where request_id=rid;
  update public.publication_jobs set ambiguous_at=clock_timestamp() where id=jid;
  select count(*) into total from public.claim_publication_jobs(3,240);
  assert total=0,'Ambiguous publication was retried';
  assert (select status='failed' and last_error_code='PUBLISH_AMBIGUOUS' from public.publication_jobs where id=jid),
    'Ambiguous queued job was not quarantined';
  -- Explicit test-only reconciliation: no network publication occurred in this fixture.
  update public.publication_jobs set ambiguous_at=null,status='queued' where id=jid;
  -- The original message is terminal failed. A new approved fixture exercises claims.
  rid:=gen_random_uuid();
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('b',64),policy,public.moderation_fingerprint('menfess',null,content),'allow');
  insert into public.messages(request_id,tracking_code_hash,category,content,safety_approved_at,safety_policy_version,safety_content_hash)
  values(rid,'v1:'||repeat('d',64),'menfess',content,now(),policy,public.moderation_fingerprint('menfess',null,content)) returning id into mid;
  select id into jid from public.publication_jobs where message_id=mid;
  select count(*) into total from public.claim_publication_jobs(3,240);
  assert total=1,'Current approved job missing';
  select count(*) into total from public.claim_publication_jobs(3,240);
  assert total=0,'Active lease claimed again';
  update public.messages set status='processing' where id=mid;
  update public.messages set status='publishing' where id=mid;
  select lock_token into token from public.publication_jobs where id=jid;
  update public.moderation_decisions set state='reject',reasons=array['harassment'] where request_id=rid;
  assert not public.prepare_ai_publication(jid,token,policy),'Revoked approval prepared publication';
  update public.moderation_decisions set state='allow',reasons='{}' where request_id=rid;
  set local role service_role;
  assert not public.prepare_ai_publication(jid,gen_random_uuid(),policy),'Wrong lease prepared publication';
  assert public.prepare_ai_publication(jid,token,policy),'Valid final approval not prepared';
  assert not public.prepare_ai_publication(jid,token,policy),'Ambiguous publish repeated';
  reset role;
  raise notice 'PASS: publication switch, current AI allow, ambiguous quarantine, one claim';
end;
$$;
rollback;
