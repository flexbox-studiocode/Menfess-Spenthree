begin;

-- Persistent fallback for the post-submit EdgeRuntime trigger. The worker secret
-- is read from Vault at execution time; no credential is stored in migrations.
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'process-moderation-queue') then
    perform cron.schedule(
      'process-moderation-queue',
      '* * * * *',
      $job$select extensions.http_post(
        url := 'https://tjhzcyeifrxyukcrpfsi.supabase.co/functions/v1/process-moderation-queue',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'MODERATION_WORKER_SECRET' limit 1)
        ),
        body := '{}'::jsonb
      )$job$
    );
  end if;
end
$$;

commit;
