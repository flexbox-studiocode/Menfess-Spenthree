begin;
do $$
declare rid uuid:=gen_random_uuid(); mid uuid; jid uuid; token uuid; ph text:='v1:'||repeat('a',64);
  first_policy text:='v1:'||repeat('b',64); next_policy text:='v1:'||repeat('c',64);
  third_policy text:='v1:'||repeat('d',64); body text:='Synthetic explicit moderation policy refresh fixture.';
begin
  update public.moderation_control set active_policy=first_policy,publishing_enabled=true;
  perform public.submit_menfess_direct_atomic(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),
    'menfess',null,body,ph,decode('010203','hex'),'v1');
  select id into mid from public.messages where request_id=rid;
  select id into jid from public.publication_jobs where message_id=mid;
  select lease_token into token from public.claim_message_moderation_jobs(20,first_policy) where message_id=mid;
  assert public.settle_message_moderation_job(mid,token,'local_reject',first_policy);
  assert not public.requeue_message_moderation(mid,first_policy),'Same policy reset blocked job';
  update public.moderation_control set active_policy=next_policy;
  assert not public.requeue_message_moderation(mid,first_policy),'Inactive policy accepted';
  update public.publication_jobs set eligible_at=now() where id=jid;
  assert public.requeue_message_moderation(mid,next_policy),'Stale blocked policy not requeued';
  assert (select state='pending' and target_policy=next_policy and settled_at is null from public.message_moderation_jobs where message_id=mid);
  assert (select eligible_at is null from public.publication_jobs where id=jid),'Requeue retained Instagram eligibility';
  assert (select web_status='hidden' from public.messages where id=mid),'Requeue unhid rejection';
  assert (select payload_hash=ph from public.idempotency_receipts where request_id=rid),'Requeue changed receipt';
  select lease_token into token from public.claim_message_moderation_jobs(20,next_policy) where message_id=mid;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,ph,next_policy,public.moderation_fingerprint('menfess',null,body),'allow');
  assert public.settle_message_moderation_job(mid,token,'allow',next_policy);
  assert public.message_has_current_ai_allow(mid),'New policy settlement not approved';
  assert (select web_status='hidden' from public.messages where id=mid),'New policy approval automatically unhid rejection';
  update public.moderation_control set active_policy=third_policy;
  assert not public.message_has_current_ai_allow(mid),'Old policy stayed publishable';
  assert public.requeue_message_moderation(mid,third_policy),'Stale approved policy not requeued';
  select lease_token into token from public.claim_message_moderation_jobs(20,third_policy) where message_id=mid;
  update public.moderation_control set active_policy=first_policy;
  assert not public.requeue_message_moderation(mid,first_policy),'Active moderation-job lease was revoked';
  perform public.release_message_moderation_job(mid,token,1);
  update public.moderation_decisions set state='evaluating',reasons='{}',lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '1 minute' where request_id=rid;
  assert not public.requeue_message_moderation(mid,first_policy),'Active provider lease was revoked';
  update public.moderation_decisions set lease_token=null,lease_expires_at=null where request_id=rid;
  assert public.requeue_message_moderation(mid,first_policy),'Stale pending policy not requeued';
  assert not public.requeue_message_moderation(mid,first_policy),'Same policy pending job reset';
  assert (select count(*) from public.message_moderation_jobs where message_id=mid)=1;
  update public.moderation_control set active_policy=next_policy;
  update public.publication_jobs set ambiguous_at=clock_timestamp() where id=jid;
  assert not public.requeue_message_moderation(mid,next_policy),'Ambiguous publication requeued';
  update public.publication_jobs set ambiguous_at=null,status='processing',locked_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+interval '4 minutes',lock_token=gen_random_uuid() where id=jid;
  assert not public.requeue_message_moderation(mid,next_policy),'Active publication lease requeued';
  update public.publication_jobs set status='failed',locked_at=null,lease_expires_at=null,lock_token=null where id=jid;
  assert not public.requeue_message_moderation(mid,next_policy),'Failed publication job requeued';
  update public.publication_jobs set status='queued',attempt_count=10 where id=jid;
  assert not public.requeue_message_moderation(mid,next_policy),'Exhausted publication job requeued';
  update public.publication_jobs set attempt_count=0 where id=jid;
  update public.messages set status='failed' where id=mid;
  assert not public.requeue_message_moderation(mid,next_policy),'Failed message requeued';
  assert not has_function_privilege('service_role','public.requeue_message_moderation(uuid,text)','execute');
  assert not has_function_privilege('anon','public.requeue_message_moderation(uuid,text)','execute');
  raise notice 'PASS: owner-only explicit stale policy refresh, no active lease revocation, no automatic unhide, receipt preserved';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); mid uuid; jid uuid; policy text:='v1:'||repeat('e',64);
  next_policy text:='v1:'||repeat('f',64); body text:='Synthetic legacy ineligible publication fixture.';
begin
  update public.moderation_control set active_policy=policy;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('0',64),policy,public.moderation_fingerprint('menfess',null,body),'allow');
  insert into public.messages(request_id,tracking_code_hash,category,content,safety_approved_at,safety_policy_version,safety_content_hash)
  values(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),'menfess',body,now(),policy,
    public.moderation_fingerprint('menfess',null,body)) returning id into mid;
  select id into jid from public.publication_jobs where message_id=mid;
  update public.publication_jobs set eligible_at=null where id=jid;
  update public.moderation_control set active_policy=next_policy;
  assert not public.requeue_message_moderation(mid,next_policy),'Legacy AI null-eligibility job activated';
  perform public.enqueue_message_moderation_backfill(100);
  assert not exists(select 1 from public.message_moderation_jobs where message_id=mid),'Legacy AI job backfilled';
  assert (select eligible_at is null from public.publication_jobs where id=jid);
  raise notice 'PASS: legacy AI ineligible job excluded from explicit requeue and backfill';
end;
$$;
rollback;
