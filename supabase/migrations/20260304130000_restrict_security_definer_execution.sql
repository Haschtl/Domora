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

drop function if exists public.can_comment_on_task_target(uuid, text, uuid, uuid);

revoke all on function public.is_household_member(uuid) from public, anon;
grant execute on function public.is_household_member(uuid) to authenticated, service_role;

revoke all on function public.is_household_owner(uuid) from public, anon;
grant execute on function public.is_household_owner(uuid) to authenticated, service_role;

revoke all on function public.create_household(text) from public, anon;
grant execute on function public.create_household(text) to authenticated, service_role;

revoke all on function public.join_household_by_invite(text) from public, anon;
grant execute on function public.join_household_by_invite(text) to authenticated, service_role;

revoke all on function public.rate_task_completion(uuid, integer) from public, anon;
grant execute on function public.rate_task_completion(uuid, integer) to authenticated, service_role;

revoke all on function public.reset_household_pimpers(uuid) from public, anon;
grant execute on function public.reset_household_pimpers(uuid) to authenticated, service_role;

revoke all on function public.resolve_one_off_task_claim(uuid, text, numeric) from public, anon;
grant execute on function public.resolve_one_off_task_claim(uuid, text, numeric) to authenticated, service_role;

revoke all on function public.resolve_task_time_correction_proposals(uuid) from public, anon;
grant execute on function public.resolve_task_time_correction_proposals(uuid) to authenticated, service_role;

revoke all on function public.settle_task_time_vacation_credits(uuid) from public, anon;
grant execute on function public.settle_task_time_vacation_credits(uuid) to authenticated, service_role;

revoke all on function public.run_household_data_maintenance(uuid, boolean, boolean) from public, anon, authenticated;
grant execute on function public.run_household_data_maintenance(uuid, boolean, boolean) to service_role;

revoke all on function public.run_all_households_data_maintenance(boolean) from public, anon, authenticated;
grant execute on function public.run_all_households_data_maintenance(boolean) to service_role;

revoke execute on function public.queue_push_from_household_event() from public, anon, authenticated;
revoke execute on function public.queue_push_on_bucket_add() from public, anon, authenticated;
revoke execute on function public.queue_push_on_shopping_add() from public, anon, authenticated;
revoke execute on function public.queue_push_on_task_takeover() from public, anon, authenticated;
