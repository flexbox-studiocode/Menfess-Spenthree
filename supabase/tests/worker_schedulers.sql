-- No network calls. Validate missing-secret behavior and privilege boundaries.
-- Run only on an isolated QA database: scheduler changes are rolled back.
begin;
do $$
begin
  assert not has_function_privilege('anon','public.invoke_queue_worker(text)','execute');
  assert not has_function_privilege('authenticated','public.configure_worker_schedules()','execute');
  assert has_function_privilege('service_role','public.invoke_queue_worker(text)','execute');
  begin
    perform public.invoke_queue_worker('arbitrary-url');
    raise exception 'Unknown worker was accepted';
  exception when invalid_parameter_value then null;
  end;
  -- Configuration is safe to run repeatedly, but never invoke real workers here.
  if not exists(select 1 from vault.decrypted_secrets where name in
    ('SUPABASE_PROJECT_URL','MODERATION_WORKER_SECRET','WORKER_CRON_SECRET')) then
    assert not public.configure_worker_schedules();
    assert not public.configure_worker_schedules();
    assert not exists(select 1 from cron.job where jobname in
      ('process-moderation-queue','process-publication-queue'));
  end if;
  raise notice 'PASS: scheduler privilege boundaries, allowlist, missing-secret fail closed';
end;
$$;
rollback;
