begin;
create table public.message_likes (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages(id) on delete cascade,
 voter_hash text not null check (voter_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 unique (message_id, voter_hash)
);
create index message_likes_message_idx on public.message_likes(message_id);
create index message_likes_created_idx on public.message_likes(created_at, message_id);
create index message_likes_voter_idx on public.message_likes(voter_hash, message_id);
alter table public.message_likes enable row level security;
revoke all on table public.message_likes from public, anon, authenticated;
grant select, insert, delete on public.message_likes to service_role;
create or replace function public.set_message_like(p_public_id uuid, p_voter_hash text, p_liked boolean)
returns table(like_count bigint, liked_by_me boolean) language plpgsql security definer set search_path = public as $$
declare mid uuid;
begin
 select m.id into mid from messages m join timeline_messages t on t.public_id=m.public_id where m.public_id=p_public_id and m.status='published';
 if mid is null then raise exception 'not public'; end if;
 if p_liked then insert into message_likes(message_id,voter_hash) values(mid,p_voter_hash) on conflict do nothing;
 else delete from message_likes where message_id=mid and voter_hash=p_voter_hash; end if;
 return query select count(*)::bigint, exists(select 1 from message_likes where message_id=mid and voter_hash=p_voter_hash);
end; $$;
revoke all on function public.set_message_like(uuid,text,boolean) from public, anon, authenticated;
grant execute on function public.set_message_like(uuid,text,boolean) to service_role;
create or replace function public.public_leaderboard(p_since timestamptz, p_limit integer)
returns table(public_id uuid, category text, recipient text, content text, created_at timestamptz, like_count bigint)
language sql security definer set search_path = public as $$
 select t.public_id,t.category,t.recipient,t.content,t.created_at,count(l.id)::bigint from timeline_messages t join messages m on m.public_id=t.public_id left join message_likes l on l.message_id=m.id and (p_since is null or l.created_at>=p_since) where m.status='published' group by t.public_id,t.category,t.recipient,t.content,t.created_at order by count(l.id) desc,t.created_at desc,t.public_id desc limit least(p_limit,10);
$$;
revoke all on function public.public_leaderboard(timestamptz,integer) from public, anon, authenticated;
grant execute on function public.public_leaderboard(timestamptz,integer) to service_role;
commit;
