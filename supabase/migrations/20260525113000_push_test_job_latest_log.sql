create or replace function get_push_test_jobs(
  p_household_id uuid,
  p_limit integer default 25
)
returns table (
  id uuid,
  type text,
  payload jsonb,
  scheduled_for timestamptz,
  status text,
  attempts integer,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz,
  log_count bigint,
  sent_count bigint,
  failed_count bigint,
  latest_log_status text,
  latest_log_provider_response jsonb,
  latest_log_created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pj.id,
    pj.type,
    pj.payload,
    pj.scheduled_for,
    pj.status,
    pj.attempts,
    pj.last_error,
    pj.created_at,
    pj.updated_at,
    count(pl.id) as log_count,
    count(pl.id) filter (where pl.status = 'sent') as sent_count,
    count(pl.id) filter (where pl.status = 'failed') as failed_count,
    latest.status as latest_log_status,
    latest.provider_response as latest_log_provider_response,
    latest.created_at as latest_log_created_at
  from push_jobs pj
  left join push_log pl on pl.job_id = pj.id
  left join lateral (
    select
      push_log.status,
      push_log.provider_response,
      push_log.created_at
    from push_log
    where push_log.job_id = pj.id
    order by push_log.created_at desc, push_log.id desc
    limit 1
  ) latest on true
  where pj.household_id = p_household_id
    and is_household_owner(p_household_id)
    and pj.payload->>'push_test' = 'true'
  group by pj.id, latest.status, latest.provider_response, latest.created_at
  order by pj.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function get_push_test_jobs(uuid, integer) from public, anon;
grant execute on function get_push_test_jobs(uuid, integer) to authenticated, service_role;
