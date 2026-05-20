create schema if not exists private;

grant usage on schema private to authenticated, service_role;

create or replace function private.can_comment_on_task_target(
  p_household_id uuid,
  p_target_type text,
  p_task_id uuid,
  p_task_time_entry_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when p_target_type = 'task'
      and p_task_id is not null
      and p_task_time_entry_id is null
    then exists (
      select 1
      from tasks t
      where t.id = p_task_id
        and t.household_id = p_household_id
    )
    when p_target_type = 'task_time_entry'
      and p_task_time_entry_id is not null
      and p_task_id is null
    then exists (
      select 1
      from task_time_entries tte
      where tte.id = p_task_time_entry_id
        and tte.household_id = p_household_id
    )
    else false
  end;
$$;

revoke all on function private.can_comment_on_task_target(uuid, text, uuid, uuid) from public, anon;
grant execute on function private.can_comment_on_task_target(uuid, text, uuid, uuid) to authenticated, service_role;

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and private.can_comment_on_task_target(household_id, target_type, task_id, task_time_entry_id)
);
