begin;
-- Only confirmed publication can carry final media metadata. Permalink remains
-- optional: Meta can confirm a media ID before permalink retrieval succeeds.
alter table public.messages add constraint final_media_only_after_publication
check (status = 'published' or (ig_media_id is null and ig_permalink is null));
-- Preserve request tombstones. Deletion requires owner maintenance until a
-- separate durable tombstone design is implemented alongside content retention.
revoke delete on public.messages from service_role;
commit;
