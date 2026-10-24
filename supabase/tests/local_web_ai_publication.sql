-- Isolated local SQL integration test. Fixtures are always rolled back.
begin;
do $$
declare
  rid uuid:=gen_random_uuid(); mid uuid; pub uuid; jid uuid; moderation_token uuid; publication_token uuid;
  policy text:='v1:'||repeat('a',64); ph text:='v1:'||repeat('b',64);
  body text:=E'Terima kasih untuk semua teman.\nSemoga harimu menyenangkan.';
  r public.submit_result; claim record; reservation jsonb; decision_token uuid;
begin
  update public.moderation_control set active_policy=policy,publishing_enabled=true;
  update public.moderation_budget set minute_start=date_trunc('minute',now()),
    day_start=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC',
    minute_requests=0,day_requests=0,minute_tokens=0,day_tokens=0,retry_at=null;
  assert public.local_content_is_safe(body,null),'LF rejected by SQL local validator';
  assert not public.local_content_is_safe(E'Terima kasih semuanya.\rBaris kedua.',null),'CR accepted';
  assert not public.local_content_is_safe('Hubungi saya test@example.com.',null),'Email regex bypass';
  assert not public.local_content_is_safe('Buka https://example.com sekarang.',null),'URL regex bypass';
  r:=public.submit_menfess_direct_atomic(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),
    'apresiasi',null,body,ph,decode('010203','hex'),'v1');
  assert r.inserted;
  select id,public_id into mid,pub from public.messages where request_id=rid;
  select id into jid from public.publication_jobs where message_id=mid;
  assert (select web_status='visible' and web_published_at is not null from public.messages where id=mid);
  assert exists(select 1 from public.timeline_messages where public_id=pub),'Local submission not visible';
  assert (select count(*) from public.message_moderation_jobs where message_id=mid)=1;
  assert (select eligible_at is null from public.publication_jobs where id=jid),'Local admission enabled Instagram';
  assert not exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid),'No AI decision claimed';
  r:=public.submit_menfess_direct_atomic(rid,'v1:'||repeat('c',64),'apresiasi',null,body,ph,decode('040506','hex'),'v1');
  assert not r.inserted;
  assert (select count(*) from public.message_moderation_jobs where message_id=mid)=1,'Replay duplicated moderation';
  select * into claim from public.claim_message_moderation_jobs(20,policy) where message_id=mid;
  moderation_token:=claim.lease_token;
  assert moderation_token is not null and claim.payload_hash=ph,'Claim lost original receipt identity';
  assert claim.input->>'content'=body;
  assert not exists(select 1 from public.claim_message_moderation_jobs(20,policy) where message_id=mid),'Active lease reclaimed';
  assert not public.settle_message_moderation_job(mid,moderation_token,'allow',policy),'Worker bypassed authoritative decision';
  reservation:=public.reserve_moderation(rid,ph,policy,public.moderation_fingerprint('apresiasi',null,body));
  decision_token:=(reservation->>'lease_token')::uuid;
  assert reservation->>'kind'='acquired';
  assert public.reserve_moderation_quota(rid,decision_token,500,1000,10000,100000,1000000);
  assert public.finish_moderation(rid,decision_token,'allow','{}');
  -- Simulate eligibility retained from an older deployment. A provider verdict
  -- alone must not publish local admissions before authoritative queue settlement.
  update public.publication_jobs set eligible_at=clock_timestamp() where id=jid;
  assert not public.message_has_current_ai_allow(mid),'Unsettled local admission accepted provider allow';
  assert not exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid),
    'Provider allow claimed before local queue settlement';
  assert not public.settle_message_moderation_job(mid,gen_random_uuid(),'allow',policy),'Wrong lease accepted';
  assert public.settle_message_moderation_job(mid,moderation_token,'allow',policy);
  assert not public.settle_message_moderation_job(mid,moderation_token,'allow',policy),'Settled lease reused';
  select lock_token into publication_token from public.claim_publication_jobs(20,240) where message_id=mid;
  assert publication_token is not null,'Local-policy message with AI allow not claimed';
  assert (select status='processing' from public.messages where id=mid),'Claim did not atomically update message';
  begin
    update public.messages set content='Changed accepted content.' where id=mid;
    raise exception 'Mutable content accepted';
  exception when check_violation then null; end;
  begin
    update public.messages set safety_policy_version=policy where id=mid;
    raise exception 'Mutable admission accepted';
  exception when check_violation then null; end;
  update public.messages set status='publishing' where id=mid;
  assert public.prepare_ai_publication(jid,publication_token,policy);
  assert not public.prepare_ai_publication(jid,publication_token,policy),'Publish marker reused';
  -- Simulate a crashed lease after Meta was called, then a delayed known success.
  update public.publication_jobs set locked_at=now()-interval '10 minutes',lease_expires_at=now()-interval '1 minute' where id=jid;
  perform public.claim_publication_jobs(20,240);
  assert (select status='failed' and last_error_code='PUBLISH_AMBIGUOUS' from public.publication_jobs where id=jid);
  update public.moderation_control set active_policy='v1:'||repeat('d',64),publishing_enabled=false;
  assert public.complete_publication_job(jid,publication_token,'123456789',null),'Known success lost after gate change';
  assert public.complete_publication_job(jid,publication_token,'123456789',null),'Known success not idempotent';
  assert not public.complete_publication_job(jid,gen_random_uuid(),'123456789',null),'Wrong attempt completed';
  assert (select status='published' from public.messages where id=mid);
  assert not has_table_privilege('anon','public.message_moderation_jobs','select');
  assert not has_function_privilege('authenticated','public.claim_message_moderation_jobs(integer,text)','execute');
  raise notice 'PASS: local visible, receipt hash, mandatory AI, leases, atomic claim, immutable admission, durable late success';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); mid uuid; pub uuid; token uuid; jid uuid;
  policy text:='v1:'||repeat('e',64); ph text:='v1:'||repeat('f',64);
  body text:='Synthetic rejection test for a locally accepted message.';
begin
  update public.moderation_control set active_policy=policy,publishing_enabled=true;
  perform public.submit_menfess_direct_atomic(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),
    'menfess',null,body,ph,decode('010203','hex'),'v1');
  select id,public_id into mid,pub from public.messages where request_id=rid;
  select id into jid from public.publication_jobs where message_id=mid;
  -- Existing receipt must still win when reserving moderation after insert.
  assert public.reserve_moderation(rid,'v1:'||repeat('0',64),policy,
    public.moderation_fingerprint('menfess',null,body))->>'kind'='conflict';
  select lease_token into token from public.claim_message_moderation_jobs(20,policy) where message_id=mid;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state,reasons)
  values(rid,ph,policy,public.moderation_fingerprint('menfess',null,body),'uncertain',array['sensitive_context']);
  assert not public.settle_message_moderation_job(mid,token,'reject',policy),'Mismatched authoritative state accepted';
  assert public.settle_message_moderation_job(mid,token,'uncertain',policy);
  assert (select web_status='hidden' from public.messages where id=mid);
  assert not exists(select 1 from public.timeline_messages where public_id=pub),'Rejected content visible in timeline';
  assert not exists(select 1 from public.public_leaderboard(null,10) where public_id=pub),'Rejected content visible in leaderboard';
  begin
    perform public.set_message_like(pub,repeat('a',64),true);
    raise exception 'Hidden message could be liked';
  exception when raise_exception then
    if sqlerrm<>'not public' then raise; end if;
  end;
  assert not exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid),'Uncertain content claimed';
  perform public.enqueue_message_moderation_backfill(100);
  assert (select state='blocked' from public.message_moderation_jobs where message_id=mid),'Backfill reset blocked job';
  assert (select count(*) from public.messages where request_id=rid)=1;
  assert (select count(*) from public.publication_jobs where message_id=mid)=1;
  raise notice 'PASS: authoritative reject, hidden timeline/likes/leaderboard, no duplicate/reset on backfill';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); mid uuid; token uuid; old_token uuid; ph text; policy text:='v1:'||repeat('2',64);
begin
  update public.moderation_control set active_policy=policy;
  set local role service_role;
  perform public.submit_menfess_direct_atomic(rid,'v1:'||encode(sha256(convert_to(rid::text,'UTF8')),'hex'),
    'curhat',null,'Synthetic receipt retention and stale lease test.','v1:'||repeat('3',64),decode('0102','hex'),'v1');
  select id into mid from public.messages where request_id=rid;
  select lease_token,payload_hash into old_token,ph from public.claim_message_moderation_jobs(20,policy) where message_id=mid;
  delete from public.idempotency_receipts where request_id=rid;
  assert public.message_moderation_payload_hash(mid)=ph,'Purged receipt changed claimed identity';
  perform public.release_message_moderation_job(mid,old_token,60);
  assert not exists(select 1 from public.claim_message_moderation_jobs(20,policy) where message_id=mid),'Backoff ignored';
  update public.message_moderation_jobs set next_attempt_at=now()-interval '1 minute' where message_id=mid;
  select lease_token into token from public.claim_message_moderation_jobs(20,policy) where message_id=mid;
  assert token<>old_token;
  perform public.release_message_moderation_job(mid,old_token,1);
  assert (select lease_token=token from public.message_moderation_jobs where message_id=mid),'Stale release replaced token';
  -- A local rejection stays authoritative even if an existing provider verdict
  -- says allow and an old publication job still carries eligibility.
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,ph,policy,public.moderation_fingerprint('curhat',null,'Synthetic receipt retention and stale lease test.'),'allow');
  assert public.settle_message_moderation_job(mid,token,'local_reject',policy),'Fail-closed local rejection denied';
  update public.publication_jobs set eligible_at=clock_timestamp() where message_id=mid;
  assert not public.message_has_current_ai_allow(mid),'Blocked local admission accepted provider allow';
  assert not exists(select 1 from public.claim_publication_jobs(20,240) where message_id=mid),
    'Blocked local admission with provider allow claimed';
  assert (select web_status='hidden' from public.messages where id=mid);
  reset role;
  raise notice 'PASS: receipt purge stability, retry backoff, stale lease isolation, fail-closed local rejection';
end;
$$;
rollback;
