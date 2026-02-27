create table if not exists member_vacations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

alter table member_vacations enable row level security;

drop policy if exists member_vacations_select on member_vacations;
create policy member_vacations_select on member_vacations
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists member_vacations_insert on member_vacations;
create policy member_vacations_insert on member_vacations
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists member_vacations_update on member_vacations;
create policy member_vacations_update on member_vacations
for update
to authenticated
using (
  is_household_member(household_id)
  and ((select auth.uid()) = user_id or is_household_owner(household_id))
)
with check (
  is_household_member(household_id)
  and ((select auth.uid()) = user_id or is_household_owner(household_id))
);

drop policy if exists member_vacations_delete on member_vacations;
create policy member_vacations_delete on member_vacations
for delete
to authenticated
using (
  is_household_member(household_id)
  and ((select auth.uid()) = user_id or is_household_owner(household_id))
);
