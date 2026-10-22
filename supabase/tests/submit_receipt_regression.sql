-- Synthetic fixtures are rolled back, including their trigger-created jobs.
do $$
declare
  rid uuid := gen_random_uuid();
  tombstone uuid := gen_random_uuid();
  first_result public.submit_result;
  replay public.submit_result;
  expired public.submit_result;
begin
  first_result := public.submit_menfess_atomic(rid, 'v1:' || repeat('a',64), 'menfess', null,
    'Synthetic receipt regression test.', 'v1:' || repeat('b',64), decode('010203','hex'), 'v1', 'v1:' || repeat('a',64));
  assert first_result.inserted, 'New message not identified as inserted';
  assert first_result.receipt_payload_hash = 'v1:' || repeat('b',64), 'New receipt missing';
  assert first_result.encrypted_response = decode('010203','hex'), 'Receipt changed';
  assert first_result.expires_at > now(), 'New receipt expired';
  assert (select count(*) from public.messages where request_id = rid) = 1, 'Message count';
  assert (select count(*) from public.publication_jobs j join public.messages m on m.id=j.message_id where m.request_id=rid and j.status='queued' and m.status='queued') = 1, 'Queued job count';

  replay := public.submit_menfess_atomic(rid, 'v1:' || repeat('c',64), 'menfess', null,
    'Synthetic receipt regression test.', 'v1:' || repeat('b',64), decode('040506','hex'), 'v1', 'v1:' || repeat('a',64));
  assert not replay.inserted, 'Replay inserted';
  assert replay.encrypted_response = first_result.encrypted_response, 'Replay replaced receipt';
  assert replay.tracking_code_hash = first_result.tracking_code_hash, 'Replay replaced tracking';
  assert (select count(*) from public.publication_jobs j join public.messages m on m.id=j.message_id where m.request_id=rid) = 1, 'Duplicate replay job';

  replay := public.submit_menfess_atomic(rid, 'v1:' || repeat('d',64), 'curhat', null,
    'Different synthetic payload.', 'v1:' || repeat('e',64), decode('070809','hex'), 'v1', 'v1:' || repeat('a',64));
  assert replay.receipt_payload_hash = first_result.receipt_payload_hash, 'Conflict replaced payload hash';
  assert (select content from public.messages where request_id=rid) = 'Synthetic receipt regression test.', 'Conflict changed message';

  -- Simulate a retained message whose receipt no longer exists without deleting data.
  insert into public.messages(request_id,tracking_code_hash,category,content)
    values(tombstone,'v1:' || repeat('f',64),'menfess','Synthetic expired request fixture.');
  expired := public.submit_menfess_atomic(tombstone, 'v1:' || repeat('0',64), 'menfess', null,
    'Synthetic expired request fixture.', 'v1:' || repeat('1',64), decode('010203','hex'), 'v1', 'v1:' || repeat('a',64));
  assert not expired.inserted, 'Expired request inserted';
  assert expired.encrypted_response is null, 'Expired receipt recreated';
  assert not exists(select 1 from public.idempotency_receipts where request_id=tombstone), 'Tombstone receipt recreated';
  raise exception 'SUBMIT_RECEIPT_TEST_ROLLBACK' using errcode='ZX002';
exception when sqlstate 'ZX002' then
  raise notice 'PASS: new receipt, replay, conflict, expired tombstone, queued outbox (fixtures rolled back)';
end;
$$;
