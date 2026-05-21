create or replace function queue_push_test_job(
  p_household_id uuid,
  p_type text,
  p_payload jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_type text;
begin
  if not is_household_owner(p_household_id) then
    raise exception 'Only household owners can queue push test jobs';
  end if;

  v_type := trim(p_type);
  if v_type not in (
    'task_due',
    'task_reminder',
    'task_completed',
    'task_skipped',
    'task_taken_over',
    'task_rated',
    'vacation_mode_enabled',
    'vacation_mode_disabled',
    'member_joined',
    'member_left',
    'rent_updated',
    'contract_created',
    'contract_updated',
    'contract_deleted',
    'member_of_month',
    'finance_created',
    'shopping_added',
    'shopping_completed',
    'bucket_added',
    'cash_audit_requested',
    'live_location_started',
    'one_off_claim_created'
  ) then
    raise exception 'Unsupported push test type: %', v_type;
  end if;

  insert into push_jobs (
    type,
    household_id,
    user_id,
    payload,
    scheduled_for,
    dedupe_key
  )
  values (
    v_type,
    p_household_id,
    auth.uid(),
    p_payload || jsonb_build_object(
      'push_test', true,
      'actor_user_id', coalesce(p_payload->>'actor_user_id', auth.uid()::text)
    ),
    coalesce(p_scheduled_for, now()),
    concat('push_test:', gen_random_uuid())
  )
  returning id into v_job_id;

  return v_job_id;
end;
$$;

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
  failed_count bigint
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
    count(pl.id) filter (where pl.status = 'failed') as failed_count
  from push_jobs pj
  left join push_log pl on pl.job_id = pj.id
  where pj.household_id = p_household_id
    and is_household_owner(p_household_id)
    and pj.payload->>'push_test' = 'true'
  group by pj.id
  order by pj.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100);
$$;

revoke all on function queue_push_test_job(uuid, text, jsonb, timestamptz) from public, anon;
grant execute on function queue_push_test_job(uuid, text, jsonb, timestamptz) to authenticated, service_role;

revoke all on function get_push_test_jobs(uuid, integer) from public, anon;
grant execute on function get_push_test_jobs(uuid, integer) to authenticated, service_role;
