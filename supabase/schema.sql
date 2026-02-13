-- Domora schema
create extension if not exists "pgcrypto";

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  address text not null default '',
  currency text not null default 'EUR' check (char_length(currency) = 3 and currency = upper(currency)),
  apartment_size_sqm numeric(8, 2) check (apartment_size_sqm is null or apartment_size_sqm > 0),
  warm_rent_monthly numeric(12, 2) check (warm_rent_monthly is null or warm_rent_monthly >= 0),
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  room_size_sqm numeric(8, 2) check (room_size_sqm is null or room_size_sqm > 0),
  common_area_factor numeric(8, 3) not null default 1 check (common_area_factor > 0),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  recurrence_interval_minutes integer check (recurrence_interval_minutes is null or recurrence_interval_minutes > 0),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists shopping_item_completions (
  id uuid primary key default gen_random_uuid(),
  shopping_item_id uuid not null references shopping_items(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  title_snapshot text not null,
  tags_snapshot text[] not null default '{}',
  completed_by uuid not null references auth.users(id) on delete cascade,
  completed_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  description text not null default '',
  start_date date not null default current_date,
  due_at timestamptz not null,
  frequency_days integer not null default 7,
  effort_pimpers integer not null default 1,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (frequency_days > 0),
  check (effort_pimpers > 0)
);

create table if not exists task_rotation_members (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0),
  created_at timestamptz not null default now(),
  primary key (task_id, user_id),
  unique (task_id, position)
);

create table if not exists household_member_pimpers (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  total_pimpers integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id),
  check (total_pimpers >= 0)
);

create table if not exists task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  task_title_snapshot text not null default '',
  user_id uuid not null references auth.users(id) on delete cascade,
  pimpers_earned integer not null,
  completed_at timestamptz not null default now(),
  check (pimpers_earned > 0)
);

create table if not exists finance_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  category text not null default 'general',
  amount numeric(12, 2) not null check (amount >= 0),
  paid_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists cash_audit_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

-- backward compatible upgrades if tables already existed
alter table households add column if not exists image_url text;
alter table households add column if not exists address text not null default '';
alter table households add column if not exists currency text not null default 'EUR';
alter table households add column if not exists apartment_size_sqm numeric(8, 2);
alter table households add column if not exists warm_rent_monthly numeric(12, 2);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_apartment_size_sqm_positive_check'
  ) then
    alter table households
      add constraint households_apartment_size_sqm_positive_check
      check (apartment_size_sqm is null or apartment_size_sqm > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_warm_rent_monthly_non_negative_check'
  ) then
    alter table households
      add constraint households_warm_rent_monthly_non_negative_check
      check (warm_rent_monthly is null or warm_rent_monthly >= 0);
  end if;
end;
$$;

alter table household_members add column if not exists room_size_sqm numeric(8, 2);
alter table household_members add column if not exists common_area_factor numeric(8, 3) not null default 1;

update household_members
set common_area_factor = 1
where common_area_factor is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_members_room_size_sqm_positive_check'
  ) then
    alter table household_members
      add constraint household_members_room_size_sqm_positive_check
      check (room_size_sqm is null or room_size_sqm > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_members_common_area_factor_positive_check'
  ) then
    alter table household_members
      add constraint household_members_common_area_factor_positive_check
      check (common_area_factor > 0);
  end if;
end;
$$;

update households
set currency = upper(left(coalesce(currency, 'EUR'), 3));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_currency_format_check'
  ) then
    alter table households
      add constraint households_currency_format_check
      check (char_length(currency) = 3 and currency = upper(currency));
  end if;
end;
$$;

alter table shopping_items add column if not exists tags text[] not null default '{}';
alter table shopping_items add column if not exists recurrence_interval_minutes integer;
alter table shopping_items add column if not exists done_at timestamptz;
alter table shopping_items add column if not exists done_by uuid references auth.users(id) on delete set null;
alter table task_completions add column if not exists task_title_snapshot text not null default '';
alter table finance_entries add column if not exists category text not null default 'general';

alter table tasks add column if not exists description text not null default '';
alter table tasks add column if not exists start_date date not null default current_date;
alter table tasks add column if not exists frequency_days integer not null default 7;
alter table tasks add column if not exists effort_pimpers integer not null default 1;
alter table tasks add column if not exists done_at timestamptz;
alter table tasks add column if not exists done_by uuid references auth.users(id) on delete set null;

create index if not exists idx_shopping_items_household_created_at on shopping_items (household_id, created_at desc);
create index if not exists idx_shopping_item_completions_household_completed_at on shopping_item_completions (household_id, completed_at desc);
create index if not exists idx_tasks_household_due_at on tasks (household_id, due_at asc);
create index if not exists idx_task_completions_household_completed_at on task_completions (household_id, completed_at desc);

create or replace function is_household_member(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
  );
$$;

create or replace function is_household_owner(hid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  );
$$;

create or replace function reset_due_recurring_shopping_items(p_household_id uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  update shopping_items
  set
    done = false,
    done_at = null,
    done_by = null
  where household_id = p_household_id
    and done = true
    and recurrence_interval_minutes is not null
    and done_at is not null
    and done_at + make_interval(mins => recurrence_interval_minutes) <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function choose_next_task_assignee(p_task_id uuid)
returns uuid
language sql
stable
as $$
  with task_info as (
    select household_id
    from tasks
    where id = p_task_id
  ),
  candidates as (
    select
      trm.user_id,
      trm.position,
      coalesce(hmp.total_pimpers, 0) as total_pimpers
    from task_rotation_members trm
    join task_info ti on true
    left join household_member_pimpers hmp
      on hmp.household_id = ti.household_id
     and hmp.user_id = trm.user_id
    where trm.task_id = p_task_id
  )
  select user_id
  from candidates
  order by total_pimpers asc, position asc
  limit 1;
$$;

create or replace function complete_task(p_task_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_task tasks%rowtype;
  v_next_due timestamptz;
  v_next_assignee uuid;
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'Authenticated user does not match p_user_id';
  end if;

  select *
  into v_task
  from tasks
  where id = p_task_id;

  if not found then
    raise exception 'Unknown task id: %', p_task_id;
  end if;

  if not is_household_member(v_task.household_id) then
    raise exception 'Not allowed to complete task in this household';
  end if;

  if v_task.done then
    raise exception 'Task is already completed for this round';
  end if;

  if v_task.assignee_id is not null and v_task.assignee_id is distinct from p_user_id then
    raise exception 'Only the assigned person can complete this task';
  end if;

  if v_task.due_at > now() then
    raise exception 'Task is not due yet';
  end if;

  v_next_due := greatest(v_task.due_at, now()) + make_interval(days => greatest(v_task.frequency_days, 1));

  insert into task_completions (
    task_id,
    household_id,
    task_title_snapshot,
    user_id,
    pimpers_earned,
    completed_at
  )
  values (
    v_task.id,
    v_task.household_id,
    v_task.title,
    p_user_id,
    greatest(v_task.effort_pimpers, 1),
    now()
  );

  insert into household_member_pimpers (
    household_id,
    user_id,
    total_pimpers,
    updated_at
  )
  values (
    v_task.household_id,
    p_user_id,
    greatest(v_task.effort_pimpers, 1),
    now()
  )
  on conflict (household_id, user_id)
  do update
  set
    total_pimpers = household_member_pimpers.total_pimpers + excluded.total_pimpers,
    updated_at = now();

  v_next_assignee := choose_next_task_assignee(v_task.id);

  update tasks
  set
    done = true,
    done_at = now(),
    done_by = p_user_id,
    due_at = v_next_due,
    assignee_id = coalesce(v_next_assignee, assignee_id)
  where id = v_task.id;
end;
$$;

create or replace function reopen_due_tasks(p_household_id uuid)
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  update tasks
  set
    done = false,
    done_at = null,
    done_by = null
  where household_id = p_household_id
    and done = true
    and due_at <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table shopping_items enable row level security;
alter table shopping_item_completions enable row level security;
alter table tasks enable row level security;
alter table task_rotation_members enable row level security;
alter table household_member_pimpers enable row level security;
alter table task_completions enable row level security;
alter table finance_entries enable row level security;
alter table cash_audit_requests enable row level security;

-- Prototype-friendly policy: authenticated users can read households.
drop policy if exists households_select on households;
create policy households_select on households
for select
to authenticated
using (true);

drop policy if exists households_insert on households;
create policy households_insert on households
for insert
to authenticated
with check (auth.uid() = created_by);

drop policy if exists households_update on households;
create policy households_update on households
for update
to authenticated
using (is_household_owner(id))
with check (is_household_owner(id));

drop policy if exists household_members_select on household_members;
create policy household_members_select on household_members
for select
to authenticated
using (is_household_member(household_id) or user_id = auth.uid());

drop policy if exists household_members_insert on household_members;
create policy household_members_insert on household_members
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists household_members_delete on household_members;
create policy household_members_delete on household_members
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists household_members_update on household_members;
create policy household_members_update on household_members
for update
to authenticated
using (auth.uid() = user_id or is_household_owner(household_id))
with check (auth.uid() = user_id or is_household_owner(household_id));

drop policy if exists shopping_items_all on shopping_items;
create policy shopping_items_all on shopping_items
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists shopping_item_completions_select on shopping_item_completions;
create policy shopping_item_completions_select on shopping_item_completions
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists shopping_item_completions_insert on shopping_item_completions;
create policy shopping_item_completions_insert on shopping_item_completions
for insert
to authenticated
with check (is_household_member(household_id) and auth.uid() = completed_by);

drop policy if exists tasks_all on tasks;
create policy tasks_all on tasks
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists task_rotation_members_all on task_rotation_members;
create policy task_rotation_members_all on task_rotation_members
for all
to authenticated
using (
  exists (
    select 1
    from tasks t
    where t.id = task_id
      and is_household_member(t.household_id)
  )
)
with check (
  exists (
    select 1
    from tasks t
    where t.id = task_id
      and is_household_member(t.household_id)
  )
);

drop policy if exists household_member_pimpers_all on household_member_pimpers;
create policy household_member_pimpers_all on household_member_pimpers
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists task_completions_select on task_completions;
create policy task_completions_select on task_completions
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_completions_insert on task_completions;
create policy task_completions_insert on task_completions
for insert
to authenticated
with check (is_household_member(household_id) and auth.uid() = user_id);

drop policy if exists finance_entries_all on finance_entries;
create policy finance_entries_all on finance_entries
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists cash_audit_requests_all on cash_audit_requests;
create policy cash_audit_requests_all on cash_audit_requests
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));
