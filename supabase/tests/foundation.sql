-- Run with: npx supabase db query --local --file supabase/tests/foundation.sql
-- Also safe on linked development: synthetic fixtures are rolled back.
do $$
declare
  mid uuid;
  rid uuid := gen_random_uuid();
  pubid uuid;
  role_name text;
  target_table text;
  invalid_value text;
  caught boolean;
  total integer;
  publication_job uuid;
  publication_token uuid;
begin
  update public.moderation_control set active_policy='v1:'||repeat('d',64),publishing_enabled=true;
  insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
  values(rid,'v1:'||repeat('c',64),'v1:'||repeat('d',64),public.moderation_fingerprint('menfess',null,'Terima kasih untuk bantuannya.'),'allow');
  insert into public.messages(request_id, tracking_code_hash, category, content, safety_approved_at, safety_policy_version,safety_content_hash)
  values (rid, 'v1:' || repeat('a',64), 'menfess', 'Terima kasih untuk bantuannya.', now(), 'v1:' || repeat('d',64),public.moderation_fingerprint('menfess',null,'Terima kasih untuk bantuannya.')) returning id, public_id into mid, pubid;
  select count(*) into total from public.publication_jobs where message_id = mid;
  assert total = 1, 'Queued insert must atomically create one job';

  begin
    insert into public.publication_jobs(message_id) values(mid);
    raise exception 'Duplicate job accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.publication_jobs(message_id) values(gen_random_uuid());
    raise exception 'Orphan job accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.messages(request_id, tracking_code_hash, category, content,safety_approved_at,safety_policy_version,safety_content_hash)
    values(rid, 'v1:' || repeat('b',64), 'menfess', 'Terima kasih untuk bantuannya.',now(),'v1:'||repeat('d',64),public.moderation_fingerprint('menfess',null,'Terima kasih untuk bantuannya.'));
    raise exception 'Duplicate request accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
    values(gen_random_uuid(),'v1:'||repeat('c',64),'v1:'||repeat('d',64),public.moderation_fingerprint('menfess',null,'Terima kasih untuk bantuannya.'),'allow') returning request_id into rid;
    insert into public.messages(request_id, tracking_code_hash, category, content,safety_approved_at,safety_policy_version,safety_content_hash)
    values(rid, 'v1:' || repeat('a',64), 'menfess', 'Terima kasih untuk bantuannya.',now(),'v1:'||repeat('d',64),public.moderation_fingerprint('menfess',null,'Terima kasih untuk bantuannya.'));
    raise exception 'Duplicate tracking hash accepted';
  exception when unique_violation then null; end;

  foreach invalid_value in array array['invalid', '', 'MENFESS'] loop
    begin
      update public.messages set category = invalid_value where id = mid;
      raise exception 'Invalid category accepted';
    exception when check_violation then null; end;
  end loop;
  foreach invalid_value in array array['', repeat('a',9), repeat('a',501), '          '] loop
    begin
      update public.messages set content = invalid_value where id = mid;
      raise exception 'Invalid content accepted';
    exception when check_violation then null; end;
  end loop;
  select request_id into rid from public.messages where id=mid;
  foreach invalid_value in array array[repeat('a',10),repeat('a',500)] loop
    begin
      update public.messages set content = invalid_value where id = mid;
      raise exception 'Accepted content was changed';
    exception when check_violation then null; end;
  end loop;
  foreach invalid_value in array array['menfess','aspirasi','curhat','apresiasi'] loop
    if invalid_value <> 'menfess' then
      begin
        update public.messages set category = invalid_value where id = mid;
        raise exception 'Accepted category was changed';
      exception when check_violation then null; end;
    end if;
  end loop;
  begin
    update public.messages set recipient = repeat('a',81) where id = mid;
    raise exception 'Long recipient accepted';
  exception when check_violation then null; end;
  begin
    update public.messages set safety_policy_version = null where id = mid;
    raise exception 'Incomplete safety approval accepted';
  exception when check_violation then null; end;
  begin
    insert into public.messages(request_id, tracking_code_hash, category, content, safety_approved_at, safety_policy_version)
    values(gen_random_uuid(), 'v1:' || repeat('e',64), 'menfess', 'Konten aman untuk uji constraint.', now(), 'invalid');
    raise exception 'Invalid safety policy hash accepted';
  exception when check_violation then null; end;
  begin
    update public.messages set status = 'unknown' where id = mid;
    raise exception 'Invalid status accepted';
  exception when check_violation then null; end;
  begin
    update public.messages set status = 'published' where id = mid;
    raise exception 'Illegal transition accepted';
  exception when check_violation then null; end;

  insert into public.idempotency_receipts(request_id, payload_hash, encrypted_response, encryption_key_version)
  values(rid, 'v1:' || repeat('c',64), decode('010203','hex'), 'v1');
  begin
    insert into public.idempotency_receipts(request_id, payload_hash, encrypted_response, encryption_key_version)
    values(rid, 'v1:' || repeat('c',64), decode('010203','hex'), 'v1');
    raise exception 'Duplicate receipt accepted';
  exception when unique_violation then null; end;
  begin
    update public.idempotency_receipts set expires_at = created_at + interval '25 hours' where request_id = rid;
    raise exception 'Long receipt retention accepted';
  exception when check_violation then null; end;

  begin
    update public.publication_jobs set status = 'processing', locked_at = now(), lock_token = gen_random_uuid() where message_id = mid;
    raise exception 'Processing job without lease accepted';
  exception when check_violation then null; end;
  begin
    update public.publication_jobs set attempt_count = -1 where message_id = mid;
    raise exception 'Negative attempts accepted';
  exception when check_violation then null; end;
  begin
    update public.publication_jobs set last_error_code = 'secret-bearing arbitrary error' where message_id = mid;
    raise exception 'Arbitrary internal error accepted';
  exception when check_violation then null; end;
  assert not exists(select 1 from public.published_messages where public_id = pubid), 'Queued record visible in feed';
  update public.messages set status = 'processing' where id = mid;
  update public.messages set status = 'publishing' where id = mid;
  begin
    update public.messages set status = 'published' where id = mid;
    raise exception 'Publication without confirmation accepted';
  exception when check_violation then null; end;
  select id into publication_job from public.publication_jobs where message_id=mid;
  publication_token:=gen_random_uuid();
  update public.publication_jobs set status='processing',locked_at=clock_timestamp(),
    lease_expires_at=clock_timestamp()+interval '4 minutes',lock_token=publication_token where id=publication_job;
  assert public.prepare_ai_publication(publication_job,publication_token,'v1:'||repeat('d',64));
  assert public.complete_publication_job(publication_job,publication_token,'999999999999999999',null);
  assert exists(select 1 from public.published_messages where public_id = pubid), 'Published record missing';
  begin
    update public.messages set status = 'queued', published_at = null where id = mid;
    raise exception 'Published record requeued';
  exception when check_violation then null; end;

  foreach target_table in array array['messages','publication_jobs','idempotency_receipts'] loop
    assert (select relrowsecurity from pg_class where oid = ('public.' || target_table)::regclass), 'Missing RLS';
  end loop;
  foreach role_name in array array['anon','authenticated'] loop
    foreach target_table in array array['messages','publication_jobs','idempotency_receipts','published_messages','timeline_messages'] loop
      assert not has_table_privilege(role_name, 'public.' || target_table, 'SELECT'), 'Public read grant';
      assert not has_table_privilege(role_name, 'public.' || target_table, 'INSERT,UPDATE,DELETE'), 'Public write grant';
      execute format('set local role %I', role_name);
      caught := false;
      begin
        execute format('select * from public.%I limit 1', target_table);
      exception when insufficient_privilege then caught := true; end;
      reset role;
      assert caught, 'Role actually read internal data';
    end loop;
    execute format('set local role %I', role_name);
    caught := false;
    begin
      update public.messages set status = 'failed' where id = mid;
    exception when insufficient_privilege then caught := true; end;
    reset role;
    assert caught, 'Role actually changed message status';
    execute format('set local role %I', role_name);
    caught := false;
    begin
      perform tracking_code_hash, ig_media_id from public.messages;
    exception when insufficient_privilege then caught := true; end;
    reset role;
    assert caught, 'Role read internal metadata';
  end loop;
  assert not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name in ('published_messages','timeline_messages') and column_name in ('id','request_id','tracking_code_hash','ig_media_id','rendered_image_path','safety_approved_at','safety_policy_version')), 'Feed leaks internal fields';
  assert not has_function_privilege('anon', 'public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text,text)', 'EXECUTE'), 'Anon can execute approved submit RPC';
  assert not has_function_privilege('authenticated', 'public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text,text)', 'EXECUTE'), 'Authenticated can execute approved submit RPC';
  assert has_function_privilege('service_role', 'public.submit_menfess_atomic(uuid,text,text,text,text,text,bytea,text,text)', 'EXECUTE'), 'Service role cannot execute approved submit RPC';
  set local role service_role;
  assert exists(select 1 from public.published_messages where public_id = pubid), 'Server cannot read public projection';
  assert exists(select 1 from public.timeline_messages where public_id = pubid), 'Server cannot read safe timeline projection';
  reset role;
  -- A handled exception rolls back all fixture writes in this DO subtransaction.
  raise exception 'FOUNDATION_TEST_ROLLBACK' using errcode = 'ZX001';
exception when sqlstate 'ZX001' then
  raise notice 'PASS: constraints, outbox, status transitions, receipt TTL, grants, RLS enabled, public projection (fixtures rolled back)';
end;
$$;
