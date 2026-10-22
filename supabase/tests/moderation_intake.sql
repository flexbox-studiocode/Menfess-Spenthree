begin;
do $$
declare rid uuid:=gen_random_uuid(); r jsonb; replay jsonb; token uuid;
 ph text:='v1:'||repeat('a',64); policy text:='v1:'||repeat('b',64); th text:='v1:'||repeat('c',64);
 message_input jsonb:='{"category":"aspirasi","recipient":null,"content":"Tolong tambah buku di perpustakaan."}';
begin
 r:=public.enqueue_moderation_intake(rid,ph,th,message_input,decode('010203','hex'),'v1');
 assert r->>'kind'='accepted';
 assert not exists(select 1 from public.messages where request_id=rid);
 assert not exists(select 1 from public.timeline_messages where content=message_input->>'content');
 replay:=public.enqueue_moderation_intake(rid,ph,'v1:'||repeat('d',64),message_input,decode('040506','hex'),'v1');
 assert replay->>'encrypted_response'=r->>'encrypted_response';
 assert public.enqueue_moderation_intake(rid,'v1:'||repeat('e',64),th,message_input,decode('040506','hex'),'v1')->>'kind'='conflict';
 assert public.lookup_submit_receipt(rid,ph)->>'kind'='replay';
 assert public.track_moderation_intake(th)->>'status'='pending_moderation';
 update public.moderation_control set active_policy=policy;
 assert public.reserve_moderation(rid,'v1:'||repeat('f',64),policy,repeat('a',64))->>'kind'='conflict',
   'In-flight legacy moderation changed an accepted request';
 select lease_token into token from public.claim_moderation_intake(3) where request_id=rid;
 assert token is not null;
 assert not public.settle_moderation_intake(rid,token,'allow',policy),'Unapproved queue item promoted';
 insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
 values(rid,ph,policy,public.moderation_fingerprint(message_input->>'category',null,message_input->>'content'),'allow');
 assert public.settle_moderation_intake(rid,token,'allow',policy);
 assert (select count(*) from public.messages where request_id=rid)=1;
 assert (select count(*) from public.publication_jobs j join public.messages m on m.id=j.message_id where m.request_id=rid)=1;
 assert (select q.input is null from public.moderation_intake q where request_id=rid),'Queue plaintext not erased';
 assert not public.settle_moderation_intake(rid,token,'allow',policy),'Completed lease reused';
 assert not has_table_privilege('anon','public.moderation_intake','select');
 assert not has_function_privilege('authenticated','public.claim_moderation_intake(integer)','execute');
 raise notice 'PASS: immediate private intake, replay, conflict, tracking, approval gate, one job, plaintext removal';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); token uuid; old_token uuid; receipt jsonb;
 ph text:='v1:'||repeat('1',64); policy text:='v1:'||repeat('2',64); th text:='v1:'||repeat('3',64);
 message_input jsonb:='{"category":"apresiasi","recipient":null,"content":"Terima kasih telah membantu tugas sekolah."}';
begin
 update public.moderation_control set active_policy=policy;
 perform public.enqueue_moderation_intake(rid,ph,th,message_input,decode('010203','hex'),'v1');
 select lease_token into old_token from public.claim_moderation_intake(1) where request_id=rid;
 assert not exists(select 1 from public.claim_moderation_intake(3) where request_id=rid),'Live lease claimed twice';
 perform public.release_moderation_intake(rid,old_token,60);
 assert (select q.input=message_input from public.moderation_intake q where request_id=rid),'Retry lost content';
 assert not exists(select 1 from public.claim_moderation_intake(3) where request_id=rid),'Backoff ignored';
 update public.moderation_intake set next_attempt_at=now()-interval '1 minute' where request_id=rid;
 select lease_token into token from public.claim_moderation_intake(1) where request_id=rid;
 assert token<>old_token;
 perform public.release_moderation_intake(rid,old_token,60);
 assert (select lease_token=token from public.moderation_intake where request_id=rid),'Stale release overwrote lease';
 insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state,reasons)
 values(rid,ph,policy,public.moderation_fingerprint(message_input->>'category',null,message_input->>'content'),'reject',array['harassment']);
 assert not public.settle_moderation_intake(rid,token,'allow',policy);
 assert public.settle_moderation_intake(rid,token,'reject',policy);
 assert not exists(select 1 from public.messages where request_id=rid),'Rejected content entered messages';
 assert public.track_moderation_intake(th)->>'status'='blocked';
 assert (select q.input is null from public.moderation_intake q where request_id=rid);
 receipt:=public.lookup_submit_receipt(rid,ph);
 assert receipt->>'kind'='replay' and not receipt ? 'input';
 raise notice 'PASS: live/stale lease, backoff, durable retry, reject privacy, receipt contains no plaintext';
end;
$$;

do $$
declare rid uuid:=gen_random_uuid(); token uuid; old_expiry timestamptz;
 ph text:='v1:'||repeat('4',64); policy text:='v1:'||repeat('5',64); th text:='v1:'||repeat('6',64);
 message_input jsonb:='{"category":"aspirasi","recipient":null,"content":"Tolong tambah lampu di perpustakaan sekolah."}';
begin
 update public.moderation_control set active_policy=policy;
 perform public.enqueue_moderation_intake(rid,ph,th,message_input,decode('010203','hex'),'v1');
 update public.moderation_intake set created_at=now()-interval '25 hours',expires_at=now()-interval '1 hour' where request_id=rid;
 select expires_at into old_expiry from public.moderation_intake where request_id=rid;
 perform public.purge_expired_receipts();
 assert (select encrypted_response is null and q.input is not null from public.moderation_intake q where request_id=rid);
 assert public.lookup_submit_receipt(rid,ph)->>'kind'='expired';
 assert public.enqueue_moderation_intake(rid,ph,th,message_input,decode('040506','hex'),'v1')->>'kind'='expired';
 select lease_token into token from public.claim_moderation_intake(3) where request_id=rid;
 insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash,state)
 values(rid,ph,policy,public.moderation_fingerprint(message_input->>'category',null,message_input->>'content'),'allow');
 update public.moderation_control set active_policy=null;
 assert not public.settle_moderation_intake(rid,token,'allow',policy),'Old policy promoted content';
 update public.moderation_control set active_policy=policy;
 assert public.settle_moderation_intake(rid,token,'allow',policy),'Expired receipt prevented processing';
 assert not exists(select 1 from public.idempotency_receipts where request_id=rid),'Expired receipt resurrected';
 assert public.lookup_submit_receipt(rid,ph)->>'kind'='expired';
 assert (select expires_at=old_expiry from public.moderation_intake where request_id=rid);
 assert public.track_moderation_intake(th)->>'status'='queued';
 raise notice 'PASS: original 24h TTL, purging, tombstone replay, policy change gate, approval after expiry, tracking boundary';
end;
$$;
do $$
declare rid uuid:=gen_random_uuid();
 ph text:='v1:'||repeat('7',64); policy text:='v1:'||repeat('8',64); th text:='v1:'||repeat('9',64);
 message_input jsonb:='{"category":"aspirasi","recipient":null,"content":"Tolong tambah lampu di taman sekolah."}';
begin
 insert into public.moderation_decisions(request_id,payload_hash,policy_version,content_hash)
 values(rid,ph,policy,public.moderation_fingerprint(message_input->>'category',null,message_input->>'content'));
 assert public.enqueue_moderation_intake(rid,'v1:'||repeat('0',64),th,message_input,decode('010203','hex'),'v1')->>'kind'='conflict';
 assert not exists(select 1 from public.moderation_intake where request_id=rid),'Conflicting legacy ID accepted';
 assert public.enqueue_moderation_intake(rid,ph,th,message_input,decode('010203','hex'),'v1')->>'kind'='accepted';
 raise notice 'PASS: legacy decision conflict and identical retry compatibility';
end;
$$;
rollback;
