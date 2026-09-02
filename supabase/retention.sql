-- Optional maintenance function. Keep raw 1-minute candles for 120 days and run
-- logs for 30 days to stay comfortably inside a small database quota.

create or replace function public.cleanup_quant_pipeline()
returns table (candles_deleted bigint, runs_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_candles bigint;
  deleted_runs bigint;
begin
  delete from public.candles_1m
    where bar_time < now() - interval '120 days';
  get diagnostics deleted_candles = row_count;

  delete from public.pipeline_runs
    where started_at < now() - interval '30 days';
  get diagnostics deleted_runs = row_count;

  return query select deleted_candles, deleted_runs;
end;
$$;

revoke all on function public.cleanup_quant_pipeline() from public, anon, authenticated;
grant execute on function public.cleanup_quant_pipeline() to service_role;

-- Test manually from the SQL editor:
-- select * from public.cleanup_quant_pipeline();
-- Then schedule it weekly using Supabase Cron only if that feature is enabled.

