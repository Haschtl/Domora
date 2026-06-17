-- Restrict one_off_task_claims UPDATE to the claim's own creator.
-- Previously any household member could UPDATE any claim, allowing direct
-- status/pimper manipulation without going through the security-definer resolver.
-- The resolver (resolve_one_off_task_claim) is SECURITY DEFINER and bypasses RLS,
-- so restricting this policy does not affect server-side approval logic.
drop policy if exists one_off_task_claims_update on one_off_task_claims;
create policy one_off_task_claims_update on one_off_task_claims
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = created_by)
with check (is_household_member(household_id) and (select auth.uid()) = created_by);

-- Harden SECURITY DEFINER function: set search_path to '' so that all identifiers
-- must be fully qualified, preventing search_path hijacking via objects in public.
create or replace function get_my_active_session_count()
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select count(*)::integer
  from auth.sessions
  where user_id = auth.uid();
$$;

revoke all on function get_my_active_session_count() from public, anon;
grant execute on function get_my_active_session_count() to authenticated, service_role;
