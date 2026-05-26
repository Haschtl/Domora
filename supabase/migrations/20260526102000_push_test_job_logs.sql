create or replace function get_push_test_job_logs(
  p_household_id uuid,
  p_job_id uuid
)
returns table (
  id uuid,
  job_id uuid,
  token_id uuid,
  status text,
  provider_response jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pl.id,
    pl.job_id,
    pl.token_id,
    pl.status,
    pl.provider_response,
    pl.created_at
  from push_log pl
  join push_jobs pj on pj.id = pl.job_id
  where pj.id = p_job_id
    and pj.household_id = p_household_id
    and is_household_owner(p_household_id)
    and pj.payload->>'push_test' = 'true'
  order by pl.created_at desc, pl.id desc;
$$;

revoke all on function get_push_test_job_logs(uuid, uuid) from public, anon;
grant execute on function get_push_test_job_logs(uuid, uuid) to authenticated, service_role;
