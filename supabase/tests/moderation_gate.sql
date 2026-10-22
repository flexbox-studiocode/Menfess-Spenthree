-- Run only against the isolated local test database. All fixtures roll back.
begin;
do $$
declare rid uuid := gen_random_uuid(); r jsonb; token uuid; old_token uuid; cutoff timestamptz;
  ph text := 'v1:' || repeat('a',64); policy text := 'v1:' || repeat('b',64);
begin
  update public.moderation_control set active_policy=policy;
  r := public.lookup_submit_receipt(rid,ph);
  assert r->>'kind' = 'missing';
  r := public.reserve_moderation(rid, ph, policy, repeat('c',64)); token := (r->>'lease_token')::uuid;
  assert r->>'kind' = 'acquired';
  assert public.reserve_moderation(rid,ph,policy,repeat('c',64))->>'kind' = 'busy';
  assert public.reserve_moderation(rid,'v1:'||repeat('d',64),policy,repeat('c',64))->>'kind' = 'conflict';
  begin
    perform public.finish_moderation(rid,token,'allow','{}');
    raise exception 'Unbudgeted allow accepted';
  exception when check_violation then null; end;
  assert public.reserve_moderation_quota(rid,token,500,30,1000,8000,200000);
  assert public.finish_moderation(rid,token,'allow','{}');
  assert public.reserve_moderation(rid,ph,policy,repeat('c',64))->>'kind' = 'cached';
  update public.moderation_control set active_policy='v1:'||repeat('e',64);
  r := public.reserve_moderation(rid,ph,'v1:'||repeat('e',64),repeat('c',64));
  old_token := token; token := (r->>'lease_token')::uuid;
  assert r->>'kind' = 'acquired';
  assert not public.finish_moderation(rid,old_token,'allow','{}');
  perform public.release_moderation(rid,token,15);
  assert public.reserve_moderation(rid,ph,'v1:'||repeat('e',64),repeat('c',64))->>'kind' = 'busy';
  assert not has_function_privilege('anon','public.reserve_moderation(uuid,text,text,text)','execute');
  assert not has_table_privilege('authenticated','public.moderation_decisions','select');
  begin
    insert into public.messages(request_id,tracking_code_hash,category,content)
    values(gen_random_uuid(),'v1:'||repeat('f',64),'menfess','Unapproved synthetic message.');
    raise exception 'Direct insert bypassed moderation';
  exception when check_violation then null; end;
  assert not exists(select 1 from public.messages where request_id=rid);
  assert not exists(select 1 from public.idempotency_receipts where request_id=rid);
  rid:=gen_random_uuid();
  r:=public.reserve_moderation(rid,ph,'v1:'||repeat('e',64),repeat('c',64)); token:=(r->>'lease_token')::uuid;
  update public.moderation_budget set retry_at=clock_timestamp()+interval '5 seconds' where singleton;
  select retry_at into cutoff from public.moderation_budget where singleton;
  assert not public.reserve_moderation_quota(rid,token,500,30,1000,8000,200000);
  perform public.release_moderation(rid,token,15);
  assert (select retry_at=cutoff from public.moderation_budget where singleton), 'Unbudgeted request prolonged global cooldown';
  rid:=gen_random_uuid();
  r:=public.reserve_moderation(rid,ph,'v1:'||repeat('e',64),repeat('c',64)); token:=(r->>'lease_token')::uuid;
  update public.moderation_budget set retry_at=null,minute_start=date_trunc('minute',clock_timestamp())+interval '1 minute',minute_requests=1 where singleton;
  assert not public.reserve_moderation_quota(rid,token,500,1,1000,8000,200000), 'Quota clock moved backwards';
  perform public.release_moderation(rid,token,1);
  update public.moderation_budget set retry_at=null,minute_start=date_trunc('minute',clock_timestamp()),minute_requests=0,minute_tokens=0 where singleton;
  assert not public.reserve_moderation_quota(rid,null,500,30,1000,8000,200000), 'Null lease reserved quota';
  assert not public.finish_moderation(rid,null,'allow','{}'), 'Null lease finalized approval';
  raise notice 'PASS: moderation lease, policy refresh, stale result, quota, roles, no messages/jobs';
end;
$$;
rollback;
