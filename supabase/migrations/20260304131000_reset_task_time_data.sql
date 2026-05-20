create or replace function reset_task_time_data(p_household_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not is_household_owner(p_household_id) then
    raise exception 'Only household owners can reset task time data';
  end if;

  delete from task_time_entries
  where household_id = p_household_id;

  get diagnostics affected = row_count;

  if affected > 0 then
    insert into household_events (
      household_id,
      event_type,
      actor_user_id,
      subject_user_id,
      payload,
      created_at
    )
    values (
      p_household_id,
      'task_time_reset',
      auth.uid(),
      null,
      jsonb_build_object('total_reset', affected),
      now()
    );
  end if;

  return affected;
end;
$$;

revoke all on function reset_task_time_data(uuid) from public, anon;
grant execute on function reset_task_time_data(uuid) to authenticated, service_role;
