create or replace function get_my_active_session_count()
returns integer
language sql
volatile
security definer
set search_path = extensions, public, auth
as $$
  select count(*)::integer
  from auth.sessions
  where user_id = auth.uid();
$$;

revoke all on function get_my_active_session_count() from public, anon;
grant execute on function get_my_active_session_count() to authenticated, service_role;
