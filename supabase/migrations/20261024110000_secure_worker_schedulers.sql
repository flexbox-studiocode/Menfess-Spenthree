-- Vault setup (outside migrations): SUPABASE_PROJECT_URL=https://<project>.supabase.co,
-- MODERATION_WORKER_SECRET, WORKER_CRON_SECRET. Then call configure_worker_schedules().
-- No HTTP call is made by this migration; jobs are only provisioned with all secrets.
begin;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create function public.invoke_queue_worker(p_worker text) returns bigint
language plpgsql security definer set search_path='' as $$
declare project_url text; worker_secret text; secret_name text;
begin
  if p_worker='process-moderation-queue' then secret_name:='MODERATION_WORKER_SECRET';
  elsif p_worker='process-publication-queue' then secret_name:='WORKER_CRON_SECRET';
  else raise exception 'Unknown worker' using errcode='22023'; end if;
  select decrypted_secret into project_url from vault.decrypted_secrets where name='SUPABASE_PROJECT_URL' limit 1;
  select decrypted_secret into worker_secret from vault.decrypted_secrets where name=secret_name limit 1;
  -- Reject arbitrary destinations, paths, credentials and header control characters.
  if project_url is null or project_url !~ '^https://[a-z0-9-]+\.supabase\.co/?$'
    or worker_secret is null or length(worker_secret)<32 or worker_secret ~ '[[:cntrl:]]' then return null; end if;
  return net.http_post(url:=rtrim(project_url,'/')||'/functions/v1/'||p_worker,
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_secret),
    body:='{}'::jsonb,timeout_milliseconds:=120000);
end;
$$;

create function public.configure_worker_schedules() returns boolean
language plpgsql security definer set search_path='' as $$
declare ready boolean; old_job record;
begin
  perform pg_advisory_xact_lock(hashtextextended('menfess-worker-schedules',0));
  select exists(select 1 from vault.decrypted_secrets where name='SUPABASE_PROJECT_URL'
      and decrypted_secret ~ '^https://[a-z0-9-]+\.supabase\.co/?$')
    and exists(select 1 from vault.decrypted_secrets where name='MODERATION_WORKER_SECRET'
      and length(decrypted_secret)>=32 and decrypted_secret !~ '[[:cntrl:]]')
    and exists(select 1 from vault.decrypted_secrets where name='WORKER_CRON_SECRET'
      and length(decrypted_secret)>=32 and decrypted_secret !~ '[[:cntrl:]]') into ready;
  -- Remove the old hardcoded extensions.http_post job even before Vault setup.
  for old_job in select jobid from cron.job where jobname in ('process-moderation-queue','process-publication-queue')
  loop perform cron.unschedule(old_job.jobid); end loop;
  if not ready then return false; end if;
  perform cron.schedule('process-moderation-queue','* * * * *',
    $job$select public.invoke_queue_worker('process-moderation-queue');$job$);
  perform cron.schedule('process-publication-queue','* * * * *',
    $job$select public.invoke_queue_worker('process-publication-queue');$job$);
  return true;
end;
$$;
revoke all on function public.invoke_queue_worker(text),public.configure_worker_schedules() from public,anon,authenticated;
grant execute on function public.invoke_queue_worker(text),public.configure_worker_schedules() to service_role;
select public.configure_worker_schedules();
commit;
