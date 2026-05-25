create or replace function get_my_active_session_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from auth.sessions
  where auth.uid() is not null
    and user_id = auth.uid();
$$;

revoke all on function get_my_active_session_count() from public, anon;
grant execute on function get_my_active_session_count() to authenticated, service_role;
