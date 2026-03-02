create table if not exists household_live_locations (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  lat numeric(9, 6) not null check (lat >= -90 and lat <= 90),
  lon numeric(9, 6) not null check (lon >= -180 and lon <= 180),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  check (expires_at > started_at)
);

create index if not exists idx_household_live_locations_expires_at
  on household_live_locations (expires_at);

drop trigger if exists trg_household_live_locations_updated_at on household_live_locations;
create trigger trg_household_live_locations_updated_at
before update on household_live_locations
for each row execute function set_updated_at();

alter table household_live_locations enable row level security;

drop policy if exists household_live_locations_select on household_live_locations;
create policy household_live_locations_select on household_live_locations
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists household_live_locations_insert on household_live_locations;
create policy household_live_locations_insert on household_live_locations
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists household_live_locations_update on household_live_locations;
create policy household_live_locations_update on household_live_locations
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id)
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists household_live_locations_delete on household_live_locations;
create policy household_live_locations_delete on household_live_locations
for delete
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id);

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'household_events_event_type_allowed_check'
  ) then
    alter table household_events
      drop constraint household_events_event_type_allowed_check;
  end if;

  alter table household_events
    add constraint household_events_event_type_allowed_check
    check (
      event_type in (
        'task_completed',
        'task_skipped',
        'task_rated',
        'shopping_completed',
        'finance_created',
        'role_changed',
        'member_joined',
        'member_left',
        'rent_updated',
        'contract_created',
        'contract_updated',
        'contract_deleted',
        'cash_audit_requested',
        'admin_hint',
        'pimpers_reset',
        'vacation_mode_enabled',
        'vacation_mode_disabled',
        'live_location_started'
      )
    );
end;
$$;
