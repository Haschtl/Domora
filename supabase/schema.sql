-- Domora schema
create extension if not exists "pgcrypto";

create table if not exists households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  address text not null default '',
  currency text not null default 'EUR' check (char_length(currency) = 3 and currency = upper(currency)),
  apartment_size_sqm numeric(8, 2) check (apartment_size_sqm is null or apartment_size_sqm > 0),
  cold_rent_monthly numeric(12, 2) check (cold_rent_monthly is null or cold_rent_monthly >= 0),
  utilities_monthly numeric(12, 2) check (utilities_monthly is null or utilities_monthly >= 0),
  utilities_on_room_sqm_percent numeric(5, 2) not null default 0
    check (utilities_on_room_sqm_percent >= 0 and utilities_on_room_sqm_percent <= 100),
  task_laziness_enabled boolean not null default false,
  theme_primary_color text not null default '#1f8a7f',
  theme_accent_color text not null default '#14b8a6',
  theme_font_family text not null default '"Space Grotesk", "Segoe UI", sans-serif',
  theme_radius_scale numeric(4, 2) not null default 1,
  landing_page_markdown text not null default '',
  invite_code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  room_size_sqm numeric(8, 2) check (room_size_sqm is null or room_size_sqm > 0),
  common_area_factor numeric(8, 3) not null default 1 check (common_area_factor >= 0 and common_area_factor <= 2),
  task_laziness_factor numeric(8, 3) not null default 1 check (task_laziness_factor >= 0 and task_laziness_factor <= 2),
  vacation_mode boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  user_color text check (user_color is null or user_color ~ '^#[0-9A-Fa-f]{6}$'),
  paypal_name text,
  revolut_name text,
  wero_name text,
  updated_at timestamptz not null default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  tags text[] not null default '{}',
  recurrence_interval_value integer check (recurrence_interval_value is null or recurrence_interval_value > 0),
  recurrence_interval_unit text check (recurrence_interval_unit is null or recurrence_interval_unit in ('days', 'weeks', 'months')),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (recurrence_interval_value is null and recurrence_interval_unit is null)
    or (recurrence_interval_value is not null and recurrence_interval_unit is not null)
  )
);

create table if not exists bucket_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  description_markdown text not null default '',
  suggested_dates date[] not null default '{}',
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists bucket_item_date_votes (
  bucket_item_id uuid not null references bucket_items(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  suggested_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (bucket_item_id, suggested_date, user_id)
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
  current_state_image_url text,
  target_state_image_url text,
  start_date date not null default current_date,
  due_at timestamptz not null,
  cron_pattern text not null default '0 9 */7 * *',
  frequency_days integer not null default 7,
  effort_pimpers integer not null default 1,
  grace_minutes integer not null default 1440,
  delay_penalty_per_day numeric(6, 3) not null default 0.25 check (delay_penalty_per_day >= 0),
  prioritize_low_pimpers boolean not null default true,
  assignee_fairness_mode text not null default 'expected' check (assignee_fairness_mode in ('actual', 'projection', 'expected')),
  is_active boolean not null default true,
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references auth.users(id) on delete set null,
  assignee_id uuid references auth.users(id) on delete set null,
  ignore_delay_penalty_once boolean not null default false,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (frequency_days > 0),
  check (effort_pimpers > 0),
  check (grace_minutes >= 0)
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
  total_pimpers numeric(12, 2) not null default 0,
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
  pimpers_earned numeric(12, 2) not null,
  due_at_snapshot timestamptz,
  delay_minutes integer not null default 0,
  completed_at timestamptz not null default now(),
  check (pimpers_earned >= 0),
  check (delay_minutes >= 0)
);

create table if not exists task_completion_ratings (
  task_completion_id uuid not null references task_completions(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_completion_id, user_id)
);

create table if not exists household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  event_type text not null check (event_type in ('task_completed', 'task_skipped', 'task_rated', 'shopping_completed', 'finance_created', 'role_changed', 'cash_audit_requested', 'admin_hint', 'pimpers_reset', 'vacation_mode_enabled', 'vacation_mode_disabled')),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists household_whiteboards (
  household_id uuid primary key references households(id) on delete cascade,
  scene_json text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(scene_json) <= 10485760)
);

create table if not exists finance_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  description text not null,
  category text not null default 'general',
  amount numeric(12, 2) not null check (amount >= 0),
  receipt_image_url text,
  paid_by uuid not null references auth.users(id) on delete cascade,
  paid_by_user_ids uuid[] not null default '{}',
  beneficiary_user_ids uuid[] not null default '{}',
  entry_date date not null default current_date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists cash_audit_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists finance_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category text not null default 'general',
  amount numeric(12, 2) not null check (amount >= 0),
  paid_by_user_ids uuid[] not null default '{}',
  beneficiary_user_ids uuid[] not null default '{}',
  cron_pattern text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(paid_by_user_ids) > 0),
  check (cardinality(beneficiary_user_ids) > 0)
);

create table if not exists push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  platform text not null check (platform in ('web', 'android', 'ios')),
  provider text not null check (provider in ('fcm', 'webpush', 'apns')),
  token text not null,
  device_id text not null,
  app_version text,
  locale text,
  timezone text,
  status text not null default 'active' check (status in ('active', 'invalid')),
  last_seen_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id, provider)
);

create table if not exists push_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  enabled boolean not null default true,
  quiet_hours jsonb not null default '{}'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, household_id)
);

create table if not exists push_jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  dedupe_key text,
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists push_jobs_dedupe_key_uq
  on push_jobs (dedupe_key)
  where dedupe_key is not null;

create table if not exists push_log (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references push_jobs(id) on delete cascade,
  token_id uuid references push_tokens(id) on delete cascade,
  status text not null,
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- backward compatible upgrades if tables already existed
alter table households add column if not exists image_url text;
alter table households add column if not exists address text not null default '';
alter table households add column if not exists currency text not null default 'EUR';
alter table households add column if not exists apartment_size_sqm numeric(8, 2);
alter table households add column if not exists cold_rent_monthly numeric(12, 2);
alter table households add column if not exists utilities_monthly numeric(12, 2);
alter table households add column if not exists utilities_on_room_sqm_percent numeric(5, 2) not null default 0;
alter table households add column if not exists task_laziness_enabled boolean not null default false;
alter table households add column if not exists theme_primary_color text not null default '#1f8a7f';
alter table households add column if not exists theme_accent_color text not null default '#14b8a6';
alter table households add column if not exists theme_font_family text not null default '"Space Grotesk", "Segoe UI", sans-serif';
alter table households add column if not exists theme_radius_scale numeric(4, 2) not null default 1;
alter table households add column if not exists landing_page_markdown text not null default '';

update households
set landing_page_markdown = ''
where landing_page_markdown is null;

update households
set utilities_on_room_sqm_percent = 0
where utilities_on_room_sqm_percent is null;

update households
set task_laziness_enabled = false
where task_laziness_enabled is null;

update households
set theme_primary_color = '#1f8a7f'
where theme_primary_color is null
   or theme_primary_color !~ '^#[0-9A-Fa-f]{6}$';

update households
set theme_accent_color = '#14b8a6'
where theme_accent_color is null
   or theme_accent_color !~ '^#[0-9A-Fa-f]{6}$';

update households
set theme_font_family = '"Space Grotesk", "Segoe UI", sans-serif'
where theme_font_family is null
   or char_length(trim(theme_font_family)) = 0;

update households
set theme_radius_scale = 1
where theme_radius_scale is null
   or theme_radius_scale <= 0;

alter table households
alter column utilities_on_room_sqm_percent set not null;

alter table households
alter column task_laziness_enabled set not null;

alter table households
alter column theme_primary_color set not null;

alter table households
alter column theme_accent_color set not null;

alter table households
alter column theme_font_family set not null;

alter table households
alter column theme_radius_scale set not null;

alter table tasks add column if not exists last_due_notification_at timestamptz;

alter table household_whiteboards add column if not exists scene_json text not null default '';
alter table household_whiteboards add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table household_whiteboards add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_push_tokens_updated_at on push_tokens;
create trigger trg_push_tokens_updated_at
before update on push_tokens
for each row execute function set_updated_at();

drop trigger if exists trg_push_jobs_updated_at on push_jobs;
create trigger trg_push_jobs_updated_at
before update on push_jobs
for each row execute function set_updated_at();

drop trigger if exists trg_push_preferences_updated_at on push_preferences;
create trigger trg_push_preferences_updated_at
before update on push_preferences
for each row execute function set_updated_at();

drop trigger if exists trg_household_whiteboards_updated_at on household_whiteboards;
create trigger trg_household_whiteboards_updated_at
before update on household_whiteboards
for each row execute function set_updated_at();

alter table push_tokens enable row level security;
alter table push_preferences enable row level security;
alter table push_jobs enable row level security;
alter table push_log enable row level security;

drop policy if exists "push_tokens_select_own" on push_tokens;
create policy "push_tokens_select_own"
  on push_tokens for select
  using ((select auth.uid()) = user_id);

drop policy if exists "push_tokens_insert_own" on push_tokens;
create policy "push_tokens_insert_own"
  on push_tokens for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from household_members
      where household_members.household_id = push_tokens.household_id
        and household_members.user_id = auth.uid()
    )
  );

drop policy if exists "push_tokens_update_own" on push_tokens;
create policy "push_tokens_update_own"
  on push_tokens for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_preferences_select_own" on push_preferences;
create policy "push_preferences_select_own"
  on push_preferences for select
  using ((select auth.uid()) = user_id);

drop policy if exists "push_preferences_upsert_own" on push_preferences;
create policy "push_preferences_upsert_own"
  on push_preferences for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from household_members
      where household_members.household_id = push_preferences.household_id
        and household_members.user_id = auth.uid()
    )
  );

drop policy if exists "push_preferences_update_own" on push_preferences;
create policy "push_preferences_update_own"
  on push_preferences for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "push_jobs_service_role" on push_jobs;
create policy "push_jobs_service_role"
  on push_jobs for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "push_log_service_role" on push_log;
create policy "push_log_service_role"
  on push_log for all
  to service_role
  using (true)
  with check (true);

create or replace function queue_push_from_household_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dedupe text;
begin
  dedupe := concat('event:', new.event_type, ':', new.id);
  insert into push_jobs (type, household_id, user_id, payload, scheduled_for, dedupe_key)
  values (
    new.event_type,
    new.household_id,
    new.actor_user_id,
    jsonb_build_object(
      'event',
      new.event_type,
      'payload',
      new.payload,
      'actor_user_id',
      new.actor_user_id,
      'target_user_id',
      new.payload->>'target_user_id'
    ),
    now(),
    dedupe
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_household_events_queue_push on household_events;
create trigger trg_household_events_queue_push
after insert on household_events
for each row execute function queue_push_from_household_event();

create or replace function queue_push_on_shopping_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dedupe text;
begin
  dedupe := concat('shopping_added:', new.id);
  insert into push_jobs (type, household_id, user_id, payload, scheduled_for, dedupe_key)
  values (
    'shopping_added',
    new.household_id,
    new.created_by,
    jsonb_build_object('title', new.title, 'shoppingItemId', new.id, 'actor_user_id', new.created_by),
    now(),
    dedupe
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_shopping_items_queue_push on shopping_items;
create trigger trg_shopping_items_queue_push
after insert on shopping_items
for each row execute function queue_push_on_shopping_add();

create or replace function queue_push_on_bucket_add()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dedupe text;
begin
  dedupe := concat('bucket_added:', new.id);
  insert into push_jobs (type, household_id, user_id, payload, scheduled_for, dedupe_key)
  values (
    'bucket_added',
    new.household_id,
    new.created_by,
    jsonb_build_object('title', new.title, 'bucketItemId', new.id, 'actor_user_id', new.created_by),
    now(),
    dedupe
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_bucket_items_queue_push on bucket_items;
create trigger trg_bucket_items_queue_push
after insert on bucket_items
for each row execute function queue_push_on_bucket_add();

create or replace function queue_push_on_task_takeover()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dedupe text;
begin
  if new.assignee_id is distinct from old.assignee_id and new.done = false then
    dedupe := concat('task_takeover:', new.id, ':', new.assignee_id);
    insert into push_jobs (type, household_id, user_id, payload, scheduled_for, dedupe_key)
    values (
      'task_taken_over',
      new.household_id,
      new.assignee_id,
      jsonb_build_object('title', new.title, 'taskId', new.id, 'actor_user_id', new.assignee_id),
      now(),
      dedupe
    )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_queue_takeover_push on tasks;
create trigger trg_tasks_queue_takeover_push
after update of assignee_id on tasks
for each row execute function queue_push_on_task_takeover();

do $$
declare
  cron_secret text;
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) and to_regnamespace('cron') is not null then
    if to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null then
      -- pg_net does not forward Authorization headers; use a custom cron secret header instead.
      -- Prefer Vault secret `domora_cron_secret`, fallback to app setting.
      if to_regclass('vault.decrypted_secrets') is not null then
        select ds.decrypted_secret
        into cron_secret
        from vault.decrypted_secrets ds
        where ds.name = 'domora_cron_secret'
        order by ds.updated_at desc
        limit 1;
      else
        cron_secret := current_setting('app.supabase_cron_secret', true);
      end if;
      if coalesce(cron_secret, '') = '' then
        raise notice 'Missing cron secret (vault domora_cron_secret or app.supabase_cron_secret); cron jobs not scheduled';
        return;
      end if;
      perform cron.schedule(
        'dispatch-push-jobs',
        '*/2 * * * *',
        format(
          $cron$
          select
            net.http_post(
              'https://yaupeuhvmrucyvlyzvun.functions.supabase.co/dispatch-push-jobs',
              '{}'::jsonb,
              null,
              jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', %s
              ),
              10000
            );
          $cron$,
          quote_literal(cron_secret)
        )
      );
      perform cron.schedule(
        'schedule-task-due',
        '0 9 * * *',
        format(
          $cron$
          select
            net.http_post(
              'https://yaupeuhvmrucyvlyzvun.functions.supabase.co/schedule-task-due',
              '{}'::jsonb,
              null,
              jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', %s
              ),
              10000
            );
          $cron$,
          quote_literal(cron_secret)
        )
      );
      perform cron.schedule(
        'schedule-member-of-month',
        '5 8 1 * *',
        format(
          $cron$
          select
            net.http_post(
              'https://yaupeuhvmrucyvlyzvun.functions.supabase.co/schedule-member-of-month',
              '{}'::jsonb,
              null,
              jsonb_build_object(
                'Content-Type', 'application/json',
                'x-cron-secret', %s
              ),
              10000
            );
          $cron$,
          quote_literal(cron_secret)
        )
      );
    else
      raise notice 'net.http_post not available';
    end if;
  else
    raise notice 'cron.schedule not available';
  end if;
exception
  when undefined_function then
    raise notice 'cron.schedule not available';
  when undefined_table then
    raise notice 'net.http_post not available';
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'households'
      and column_name = 'warm_rent_monthly'
  ) then
    update households
    set
      cold_rent_monthly = coalesce(cold_rent_monthly, warm_rent_monthly),
      utilities_monthly = coalesce(utilities_monthly, 0)
    where warm_rent_monthly is not null
      and cold_rent_monthly is null
      and utilities_monthly is null;
  end if;
end;
$$;

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
    where conname = 'households_cold_rent_monthly_non_negative_check'
  ) then
    alter table households
      add constraint households_cold_rent_monthly_non_negative_check
      check (cold_rent_monthly is null or cold_rent_monthly >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_utilities_monthly_non_negative_check'
  ) then
    alter table households
      add constraint households_utilities_monthly_non_negative_check
      check (utilities_monthly is null or utilities_monthly >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_utilities_on_room_sqm_percent_range_check'
  ) then
    alter table households
      add constraint households_utilities_on_room_sqm_percent_range_check
      check (utilities_on_room_sqm_percent >= 0 and utilities_on_room_sqm_percent <= 100);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_theme_primary_color_format_check'
  ) then
    alter table households
      add constraint households_theme_primary_color_format_check
      check (theme_primary_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_theme_accent_color_format_check'
  ) then
    alter table households
      add constraint households_theme_accent_color_format_check
      check (theme_accent_color ~ '^#[0-9A-Fa-f]{6}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_theme_radius_scale_range_check'
  ) then
    alter table households
      add constraint households_theme_radius_scale_range_check
      check (theme_radius_scale >= 0.5 and theme_radius_scale <= 1.5);
  end if;
end;
$$;

alter table household_members add column if not exists room_size_sqm numeric(8, 2);
alter table household_members add column if not exists common_area_factor numeric(8, 3) not null default 1;
alter table household_members add column if not exists task_laziness_factor numeric(8, 3) not null default 1;
alter table household_members add column if not exists vacation_mode boolean not null default false;

update household_members
set common_area_factor = 1
where common_area_factor is null;

update household_members
set task_laziness_factor = 1
where task_laziness_factor is null;

update household_members
set vacation_mode = false
where vacation_mode is null;

alter table household_members
alter column vacation_mode set not null;

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

  if exists (
    select 1
    from pg_constraint
    where conname = 'household_members_common_area_factor_positive_check'
  ) then
    alter table household_members
      drop constraint household_members_common_area_factor_positive_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'household_members_common_area_factor_check'
  ) then
    alter table household_members
      drop constraint household_members_common_area_factor_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_members_common_area_factor_range_check'
  ) then
    alter table household_members
      add constraint household_members_common_area_factor_range_check
      check (common_area_factor >= 0 and common_area_factor <= 2);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_members_task_laziness_factor_range_check'
  ) then
    alter table household_members
      add constraint household_members_task_laziness_factor_range_check
      check (task_laziness_factor >= 0 and task_laziness_factor <= 2);
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
alter table shopping_items add column if not exists recurrence_interval_value integer;
alter table shopping_items add column if not exists recurrence_interval_unit text;
alter table bucket_items add column if not exists title text;
alter table bucket_items add column if not exists description_markdown text not null default '';
alter table bucket_items add column if not exists suggested_dates date[] not null default '{}';
alter table bucket_items add column if not exists done boolean not null default false;
alter table shopping_items add column if not exists done_at timestamptz;
alter table shopping_items add column if not exists done_by uuid references auth.users(id) on delete set null;
alter table bucket_items add column if not exists created_by uuid references auth.users(id) on delete cascade;
alter table bucket_items add column if not exists created_at timestamptz not null default now();
alter table bucket_items add column if not exists done_at timestamptz;
alter table bucket_items add column if not exists done_by uuid references auth.users(id) on delete set null;
alter table bucket_item_date_votes add column if not exists household_id uuid references households(id) on delete cascade;
alter table bucket_item_date_votes add column if not exists created_at timestamptz not null default now();
alter table task_completions add column if not exists task_title_snapshot text not null default '';
alter table task_completions add column if not exists due_at_snapshot timestamptz;
alter table task_completions add column if not exists delay_minutes integer not null default 0;
alter table task_completion_ratings add column if not exists household_id uuid references households(id) on delete cascade;
alter table task_completion_ratings add column if not exists rating smallint;
alter table task_completion_ratings add column if not exists created_at timestamptz not null default now();
alter table task_completion_ratings add column if not exists updated_at timestamptz not null default now();
alter table finance_entries add column if not exists category text not null default 'general';
alter table finance_entries add column if not exists receipt_image_url text;
alter table finance_entries add column if not exists paid_by_user_ids uuid[] not null default '{}';
alter table finance_entries add column if not exists beneficiary_user_ids uuid[] not null default '{}';
alter table finance_entries add column if not exists entry_date date not null default current_date;
alter table finance_entries add column if not exists created_by uuid references auth.users(id) on delete cascade;
alter table finance_subscriptions add column if not exists category text not null default 'general';
alter table finance_subscriptions add column if not exists paid_by_user_ids uuid[] not null default '{}';
alter table finance_subscriptions add column if not exists beneficiary_user_ids uuid[] not null default '{}';
alter table finance_subscriptions add column if not exists cron_pattern text not null default '0 9 1 * *';
alter table finance_subscriptions add column if not exists updated_at timestamptz not null default now();
alter table user_profiles add column if not exists paypal_name text;
alter table user_profiles add column if not exists revolut_name text;
alter table user_profiles add column if not exists wero_name text;
alter table user_profiles add column if not exists user_color text;

update user_profiles
set user_color = lower(user_color)
where user_color is not null;

update user_profiles
set user_color = null
where user_color is not null
  and user_color !~ '^#[0-9a-f]{6}$';

update finance_entries
set paid_by_user_ids = array[paid_by]
where paid_by_user_ids is null
   or cardinality(paid_by_user_ids) = 0;

update finance_entries fe
set beneficiary_user_ids = coalesce(
  (
    select array_agg(hm.user_id order by hm.created_at)
    from household_members hm
    where hm.household_id = fe.household_id
  ),
  array[fe.paid_by]
)
where beneficiary_user_ids is null
   or cardinality(beneficiary_user_ids) = 0;

update finance_entries
set entry_date = created_at::date
where entry_date is null;

update finance_entries
set created_by = paid_by
where created_by is null;

alter table finance_entries
alter column created_by set not null;

update task_completions
set
  due_at_snapshot = completed_at,
  delay_minutes = 0
where due_at_snapshot is null
   or delay_minutes is null
   or delay_minutes < 0;

update task_completion_ratings tcr
set household_id = tc.household_id
from task_completions tc
where tcr.task_completion_id = tc.id
  and tcr.household_id is null;

update task_completion_ratings
set rating = 3
where rating is null;

update task_completion_ratings
set updated_at = created_at
where updated_at is null;

alter table task_completion_ratings
alter column household_id set not null;

alter table task_completion_ratings
alter column rating set not null;

update shopping_items
set recurrence_interval_unit = lower(recurrence_interval_unit)
where recurrence_interval_unit is not null;

update shopping_items
set recurrence_interval_unit = null
where recurrence_interval_unit is not null
  and recurrence_interval_unit not in ('days', 'weeks', 'months');

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shopping_items'
      and column_name = 'recurrence_interval_minutes'
  ) then
    update shopping_items
    set recurrence_interval_value = case
      when recurrence_interval_minutes is null then recurrence_interval_value
      when recurrence_interval_minutes % (60 * 24 * 30) = 0 then recurrence_interval_minutes / (60 * 24 * 30)
      when recurrence_interval_minutes % (60 * 24 * 7) = 0 then recurrence_interval_minutes / (60 * 24 * 7)
      else greatest(1, ceil(recurrence_interval_minutes::numeric / (60 * 24))::integer)
    end
    where recurrence_interval_value is null
      and recurrence_interval_minutes is not null;

    update shopping_items
    set recurrence_interval_unit = case
      when recurrence_interval_minutes is null then recurrence_interval_unit
      when recurrence_interval_minutes % (60 * 24 * 30) = 0 then 'months'
      when recurrence_interval_minutes % (60 * 24 * 7) = 0 then 'weeks'
      else 'days'
    end
    where recurrence_interval_unit is null
      and recurrence_interval_minutes is not null;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_subscriptions_paid_by_user_ids_not_empty_check'
  ) then
    alter table finance_subscriptions
      add constraint finance_subscriptions_paid_by_user_ids_not_empty_check
      check (cardinality(paid_by_user_ids) > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_subscriptions_beneficiary_user_ids_not_empty_check'
  ) then
    alter table finance_subscriptions
      add constraint finance_subscriptions_beneficiary_user_ids_not_empty_check
      check (cardinality(beneficiary_user_ids) > 0);
  end if;
end;
$$;

update shopping_items
set
  recurrence_interval_value = null,
  recurrence_interval_unit = null
where (recurrence_interval_value is null) is distinct from (recurrence_interval_unit is null);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_completions'
      and column_name = 'pimpers_earned'
      and data_type = 'integer'
  ) then
    alter table task_completions
      alter column pimpers_earned type numeric(12, 2)
      using pimpers_earned::numeric;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'household_member_pimpers'
      and column_name = 'total_pimpers'
      and data_type = 'integer'
  ) then
    alter table household_member_pimpers
      alter column total_pimpers type numeric(12, 2)
      using total_pimpers::numeric;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'finance_entries_paid_by_user_ids_non_empty_check'
  ) then
    alter table finance_entries
      drop constraint finance_entries_paid_by_user_ids_non_empty_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_entries_paid_by_user_ids_not_empty_check'
  ) then
    alter table finance_entries
      add constraint finance_entries_paid_by_user_ids_not_empty_check
      check (cardinality(paid_by_user_ids) > 0);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'finance_entries_beneficiary_user_ids_non_empty_check'
  ) then
    alter table finance_entries
      drop constraint finance_entries_beneficiary_user_ids_non_empty_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'finance_entries_beneficiary_user_ids_not_empty_check'
  ) then
    alter table finance_entries
      add constraint finance_entries_beneficiary_user_ids_not_empty_check
      check (cardinality(beneficiary_user_ids) > 0);
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'household_events_event_type_check'
  ) then
    alter table household_events
      drop constraint household_events_event_type_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_events_event_type_allowed_check'
  ) then
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
          'cash_audit_requested',
          'admin_hint',
          'pimpers_reset',
          'vacation_mode_enabled',
          'vacation_mode_disabled'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_completions_delay_minutes_non_negative_check'
  ) then
    alter table task_completions
      add constraint task_completions_delay_minutes_non_negative_check
      check (delay_minutes >= 0);
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'task_completions_pimpers_earned_check'
  ) then
    alter table task_completions
      drop constraint task_completions_pimpers_earned_check;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_completions_pimpers_earned_non_negative_check'
  ) then
    alter table task_completions
      add constraint task_completions_pimpers_earned_non_negative_check
      check (pimpers_earned >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_completion_ratings_rating_range_check'
  ) then
    alter table task_completion_ratings
      add constraint task_completion_ratings_rating_range_check
      check (rating >= 1 and rating <= 5);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_recurrence_interval_value_positive_check'
  ) then
    alter table shopping_items
      add constraint shopping_items_recurrence_interval_value_positive_check
      check (recurrence_interval_value is null or recurrence_interval_value > 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_recurrence_interval_unit_allowed_check'
  ) then
    alter table shopping_items
      add constraint shopping_items_recurrence_interval_unit_allowed_check
      check (recurrence_interval_unit is null or recurrence_interval_unit in ('days', 'weeks', 'months'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopping_items_recurrence_interval_pair_check'
  ) then
    alter table shopping_items
      add constraint shopping_items_recurrence_interval_pair_check
      check (
        (recurrence_interval_value is null and recurrence_interval_unit is null)
        or (recurrence_interval_value is not null and recurrence_interval_unit is not null)
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_profiles_user_color_format_check'
  ) then
    alter table user_profiles
      add constraint user_profiles_user_color_format_check
      check (user_color is null or user_color ~ '^#[0-9a-f]{6}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'household_whiteboards_scene_json_size_check'
  ) then
    alter table household_whiteboards
      add constraint household_whiteboards_scene_json_size_check
      check (char_length(scene_json) <= 10485760);
  end if;
end;
$$;

alter table tasks add column if not exists description text not null default '';
alter table tasks add column if not exists current_state_image_url text;
alter table tasks add column if not exists target_state_image_url text;
alter table tasks add column if not exists start_date date not null default current_date;
alter table tasks add column if not exists cron_pattern text not null default '0 9 */7 * *';
alter table tasks add column if not exists frequency_days integer not null default 7;
alter table tasks add column if not exists effort_pimpers integer not null default 1;
alter table tasks add column if not exists grace_minutes integer not null default 1440;
alter table tasks add column if not exists delay_penalty_per_day numeric(6, 3) not null default 0.25;
alter table tasks add column if not exists prioritize_low_pimpers boolean not null default true;
alter table tasks add column if not exists assignee_fairness_mode text not null default 'expected';
alter table tasks add column if not exists is_active boolean not null default true;
alter table tasks add column if not exists done_at timestamptz;
alter table tasks add column if not exists done_by uuid references auth.users(id) on delete set null;
alter table tasks add column if not exists ignore_delay_penalty_once boolean not null default false;

update tasks
set assignee_fairness_mode = 'expected'
where assignee_fairness_mode is null
   or assignee_fairness_mode not in ('actual', 'projection', 'expected');

update tasks
set grace_minutes = 1440
where grace_minutes is null
   or grace_minutes < 0;

update tasks
set delay_penalty_per_day = 0.25
where delay_penalty_per_day is null
   or delay_penalty_per_day < 0;

alter table tasks
alter column assignee_fairness_mode set not null;

alter table tasks
alter column assignee_fairness_mode set default 'expected';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_assignee_fairness_mode_allowed_check'
  ) then
    alter table tasks
      add constraint tasks_assignee_fairness_mode_allowed_check
      check (assignee_fairness_mode in ('actual', 'projection', 'expected'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_grace_minutes_non_negative_check'
  ) then
    alter table tasks
      add constraint tasks_grace_minutes_non_negative_check
      check (grace_minutes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_delay_penalty_per_day_non_negative_check'
  ) then
    alter table tasks
      add constraint tasks_delay_penalty_per_day_non_negative_check
      check (delay_penalty_per_day >= 0);
  end if;
end;
$$;

update tasks
set cron_pattern = format('0 9 */%s * *', greatest(frequency_days, 1))
where cron_pattern is null
   or char_length(trim(cron_pattern)) = 0;

create or replace function task_cron_interval_days(p_cron_pattern text, p_fallback_days integer default 7)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    case
      when split_part(trim(coalesce(p_cron_pattern, '')), ' ', 3) ~ '^\\*/[0-9]+$' then
        greatest(
          replace(split_part(trim(coalesce(p_cron_pattern, '')), ' ', 3), '*/', '')::integer,
          1
        )
      else null
    end,
    greatest(coalesce(p_fallback_days, 7), 1)
  );
$$;

create index if not exists idx_shopping_items_household_created_at on shopping_items (household_id, created_at desc);
create index if not exists idx_bucket_items_household_created_at on bucket_items (household_id, created_at desc);
create index if not exists idx_bucket_item_date_votes_household_date on bucket_item_date_votes (household_id, suggested_date asc);
create index if not exists idx_shopping_item_completions_household_completed_at on shopping_item_completions (household_id, completed_at desc);
create index if not exists idx_tasks_household_due_at on tasks (household_id, due_at asc);
create index if not exists idx_tasks_household_active on tasks (household_id, is_active, id);
create index if not exists idx_task_completions_household_completed_at on task_completions (household_id, completed_at desc);
create index if not exists idx_task_completion_ratings_household_completion on task_completion_ratings (household_id, task_completion_id);
create index if not exists idx_household_events_household_created_at on household_events (household_id, created_at desc);
create index if not exists idx_finance_entries_household_entry_date on finance_entries (household_id, entry_date desc);
create index if not exists idx_finance_subscriptions_household_created_at on finance_subscriptions (household_id, created_at desc);
create index if not exists idx_household_members_user_household on household_members (user_id, household_id);
create index if not exists idx_task_rotation_members_user_task on task_rotation_members (user_id, task_id);

create index if not exists idx_bucket_item_date_votes_user_id on bucket_item_date_votes (user_id);
create index if not exists idx_bucket_items_created_by on bucket_items (created_by);
create index if not exists idx_bucket_items_done_by on bucket_items (done_by);
create index if not exists idx_cash_audit_requests_household_id on cash_audit_requests (household_id);
create index if not exists idx_cash_audit_requests_requested_by on cash_audit_requests (requested_by);
create index if not exists idx_finance_entries_created_by on finance_entries (created_by);
create index if not exists idx_finance_entries_paid_by on finance_entries (paid_by);
create index if not exists idx_finance_subscriptions_created_by on finance_subscriptions (created_by);
create index if not exists idx_household_events_actor_user_id on household_events (actor_user_id);
create index if not exists idx_household_events_subject_user_id on household_events (subject_user_id);
create index if not exists idx_household_member_pimpers_user_id on household_member_pimpers (user_id);
create index if not exists idx_household_whiteboards_updated_by on household_whiteboards (updated_by);
create index if not exists idx_households_created_by on households (created_by);
create index if not exists idx_push_jobs_household_id on push_jobs (household_id);
create index if not exists idx_push_jobs_user_id on push_jobs (user_id);
create index if not exists idx_push_log_job_id on push_log (job_id);
create index if not exists idx_push_log_token_id on push_log (token_id);
create index if not exists idx_push_preferences_household_id on push_preferences (household_id);
create index if not exists idx_push_tokens_household_id on push_tokens (household_id);
create index if not exists idx_shopping_item_completions_completed_by on shopping_item_completions (completed_by);
create index if not exists idx_shopping_item_completions_item_id on shopping_item_completions (shopping_item_id);
create index if not exists idx_shopping_items_created_by on shopping_items (created_by);
create index if not exists idx_shopping_items_done_by on shopping_items (done_by);
create index if not exists idx_task_completion_ratings_user_id on task_completion_ratings (user_id);
create index if not exists idx_task_completions_user_id on task_completions (user_id);
create index if not exists idx_tasks_assignee_id on tasks (assignee_id);
create index if not exists idx_tasks_created_by on tasks (created_by);
create index if not exists idx_tasks_done_by on tasks (done_by);

create or replace function is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
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
security definer
set search_path = public
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = hid
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  );
$$;

create or replace function join_household_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_invite_code text;
  requester_user_id uuid;
  target_household_id uuid;
begin
  requester_user_id := auth.uid();
  if requester_user_id is null then
    raise exception 'Not authenticated';
  end if;

  normalized_invite_code := upper(trim(coalesce(p_invite_code, '')));
  if char_length(normalized_invite_code) = 0 then
    raise exception 'Invite code is required';
  end if;

  select h.id
  into target_household_id
  from households h
  where h.invite_code = normalized_invite_code
  limit 1;

  if target_household_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into household_members (
    household_id,
    user_id,
    role
  )
  values (
    target_household_id,
    requester_user_id,
    'member'
  )
  on conflict (household_id, user_id)
  do update
  set role = household_members.role;

  return target_household_id;
end;
$$;

create or replace function guard_household_member_role_change()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if coalesce(auth.role(), 'authenticated') <> 'service_role'
      and not is_household_owner(new.household_id) then
      raise exception 'Only household owners can change member roles';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_household_member_role_change on household_members;
create trigger trg_guard_household_member_role_change
before update on household_members
for each row
execute function guard_household_member_role_change();

create or replace function apply_vacation_return_pimpers()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  winsorized_mean numeric;
begin
  if old.vacation_mode = true and new.vacation_mode = false then
    with active_members as (
      select hm.user_id
      from household_members hm
      where hm.household_id = new.household_id
        and hm.vacation_mode = false
        and hm.user_id <> new.user_id
    ),
    active_pimpers as (
      select coalesce(hmp.total_pimpers, 0)::numeric as total_pimpers
      from active_members am
      left join household_member_pimpers hmp
        on hmp.household_id = new.household_id
       and hmp.user_id = am.user_id
    ),
    bounds as (
      select
        percentile_cont(0.1) within group (order by total_pimpers) as p10,
        percentile_cont(0.9) within group (order by total_pimpers) as p90
      from active_pimpers
    ),
    capped as (
      select
        greatest(b.p10, least(ap.total_pimpers, b.p90)) as capped_value
      from active_pimpers ap
      cross join bounds b
    )
    select avg(capped_value)
    into winsorized_mean
    from capped;

    if winsorized_mean is not null then
      insert into household_member_pimpers (
        household_id,
        user_id,
        total_pimpers,
        updated_at
      )
      values (
        new.household_id,
        new.user_id,
        round(
          greatest(
            coalesce(
              (select total_pimpers from household_member_pimpers where household_id = new.household_id and user_id = new.user_id),
              0
            ),
            winsorized_mean
          ),
          2
        ),
        now()
      )
      on conflict (household_id, user_id)
      do update
      set
        total_pimpers = greatest(household_member_pimpers.total_pimpers, excluded.total_pimpers),
        updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_household_members_vacation_return_pimpers on household_members;
create trigger trg_household_members_vacation_return_pimpers
after update of vacation_mode on household_members
for each row
execute function apply_vacation_return_pimpers();

create or replace function reset_due_recurring_shopping_items(p_household_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
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
    and recurrence_interval_value is not null
    and recurrence_interval_unit is not null
    and done_at
      + case recurrence_interval_unit
          when 'days' then make_interval(days => recurrence_interval_value)
          when 'weeks' then make_interval(days => recurrence_interval_value * 7)
          when 'months' then make_interval(months => recurrence_interval_value)
        end <= now()
    and done_at is not null
    ;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'shopping_items'
      and column_name = 'recurrence_interval_minutes'
  ) then
    alter table shopping_items
      drop column recurrence_interval_minutes;
  end if;
end;
$$;

create or replace function choose_next_task_assignee(
  p_task_id uuid,
  p_prioritize_low_pimpers boolean default true,
  p_assignee_fairness_mode text default 'expected'
)
returns uuid
language sql
stable
set search_path = public
as $$
  with task_info as (
    select
      t.id as task_id,
      t.household_id,
      t.assignee_id,
      h.task_laziness_enabled as task_laziness_enabled,
      greatest(task_cron_interval_days(t.cron_pattern, t.frequency_days), 1)::integer as interval_days
    from tasks t
    join households h on h.id = t.household_id
    where t.id = p_task_id
  ),
  rotation_base as (
    select
      trm.user_id,
      trm.position,
      coalesce(hm.vacation_mode, false) as vacation_mode,
      row_number() over (order by trm.position asc, trm.user_id asc) - 1 as rotation_index
    from task_rotation_members trm
    join task_info ti on true
    left join household_members hm
      on hm.household_id = ti.household_id
     and hm.user_id = trm.user_id
    where trm.task_id = p_task_id
  ),
  rotation_active as (
    select *
    from rotation_base
    where vacation_mode = false
  ),
  rotation_candidates as (
    select * from rotation_active
    union all
    select * from rotation_base
    where not exists (select 1 from rotation_active)
  ),
  rotation_meta as (
    select
      count(*)::integer as rotation_count,
      coalesce(
        (
          select r.rotation_index
          from rotation_candidates r
          join task_info ti on true
          where r.user_id = ti.assignee_id
          limit 1
        ),
        0
      ) as current_rotation_index
    from rotation_candidates
  ),
  candidates as (
    select
      r.user_id,
      r.position,
      r.rotation_index,
      coalesce(hmp.total_pimpers, 0)::numeric as total_pimpers,
      case
        when ti.task_laziness_enabled then coalesce(hm.task_laziness_factor, 1)::numeric
        else 1::numeric
      end as task_laziness_factor,
      coalesce(hm.vacation_mode, false) as vacation_mode,
      coalesce(td.avg_delay_minutes, 0)::numeric as avg_delay_minutes,
      rm.rotation_count,
      case
        when rm.rotation_count <= 0 then 0
        when r.rotation_index >= rm.current_rotation_index then r.rotation_index - rm.current_rotation_index
        else rm.rotation_count - rm.current_rotation_index + r.rotation_index
      end as turns_until_turn
    from rotation_candidates r
    join rotation_meta rm on true
    join task_info ti on true
    left join household_member_pimpers hmp
      on hmp.household_id = ti.household_id
     and hmp.user_id = r.user_id
    left join (
      select
        tc.user_id,
        avg(tc.delay_minutes)::numeric as avg_delay_minutes
      from task_completions tc
      join task_info ti_inner on ti_inner.household_id = tc.household_id
      group by tc.user_id
    ) td on td.user_id = r.user_id
    left join household_members hm
      on hm.household_id = ti.household_id
     and hm.user_id = r.user_id
  ),
  active_tasks as (
    select
      t2.id as task_id,
      greatest(task_cron_interval_days(t2.cron_pattern, t2.frequency_days), 1)::numeric as interval_days,
      greatest(t2.effort_pimpers, 1)::numeric as effort_pimpers
    from tasks t2
    join task_info ti on t2.household_id = ti.household_id
    where t2.id <> ti.task_id
      and t2.is_active = true
  ),
  task_rotation_base as (
    select
      trm.task_id,
      trm.user_id,
      coalesce(hm.vacation_mode, false) as vacation_mode
    from task_rotation_members trm
    join active_tasks at on at.task_id = trm.task_id
    join task_info ti on true
    left join household_members hm
      on hm.household_id = ti.household_id
     and hm.user_id = trm.user_id
  ),
  task_rotation_active as (
    select *
    from task_rotation_base
    where vacation_mode = false
  ),
  task_rotation_candidates as (
    select * from task_rotation_active
    union all
    select *
    from task_rotation_base trb
    where not exists (
      select 1
      from task_rotation_active tra
      where tra.task_id = trb.task_id
    )
  ),
  task_rotation_counts as (
    select
      trm.task_id,
      count(*)::numeric as rotation_count
    from task_rotation_candidates trm
    group by trm.task_id
  ),
  member_active_tasks as (
    select distinct
      trm.user_id,
      trm.task_id
    from task_rotation_candidates trm
  ),
  projected as (
    select
      c.*,
      coalesce(
        (
          select sum(
            greatest(
              floor(
                (
                  case
                    when lower(coalesce(p_assignee_fairness_mode, 'actual')) = 'expected' then
                      greatest(
                        (c.turns_until_turn * ti.interval_days)
                        - (c.avg_delay_minutes / 1440.0),
                        0
                      )
                    else (c.turns_until_turn * ti.interval_days)
                  end
                )::numeric / at.interval_days
              ),
              0
            )
            * at.effort_pimpers
            / trc.rotation_count
          )
          from task_info ti
          join member_active_tasks mat on mat.user_id = c.user_id
          join active_tasks at on at.task_id = mat.task_id
          join task_rotation_counts trc on trc.task_id = at.task_id
          where trc.rotation_count > 0
        ),
        0
      ) as projected_pimpers_until_turn
    from candidates c
  )
  select p.user_id
  from projected p
  join task_info ti on true
  join (
    select
      count(*)::integer as total_candidates,
      count(*) filter (where vacation_mode = false)::integer as active_candidates
    from candidates
  ) as availability on true
  where (
    ti.assignee_id is null
    or p.user_id is distinct from ti.assignee_id
    or availability.total_candidates <= 1
    or availability.active_candidates <= 1
  )
  order by
    case when p.vacation_mode then 1 else 0 end asc,
    case
      when p_prioritize_low_pimpers and p.task_laziness_factor <= 0 then 999999999::numeric
      when p_prioritize_low_pimpers and lower(coalesce(p_assignee_fairness_mode, 'actual')) in ('projection', 'expected') then
        (p.total_pimpers + p.projected_pimpers_until_turn) / greatest(p.task_laziness_factor, 0.0001)
      when p_prioritize_low_pimpers then p.total_pimpers / greatest(p.task_laziness_factor, 0.0001)
      else 0
    end asc,
    p.position asc,
    p.user_id asc
  limit 1;
$$;

create or replace function complete_task(p_task_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_next_due timestamptz;
  v_next_assignee uuid;
  v_interval_days integer;
  v_grace_minutes integer;
  v_delay_minutes integer;
  v_penalty numeric;
  v_pimpers_earned numeric(12, 2);
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

  if not v_task.is_active then
    raise exception 'Task is inactive';
  end if;

  if v_task.assignee_id is not null and v_task.assignee_id is distinct from p_user_id then
    raise exception 'Only the assigned person can complete this task';
  end if;

  if v_task.due_at > now() + interval '24 hours' then
    raise exception 'Task is not due yet';
  end if;

  v_interval_days := task_cron_interval_days(v_task.cron_pattern, v_task.frequency_days);
  v_grace_minutes := greatest(coalesce(v_task.grace_minutes, 0), 0);
  v_next_due := greatest(v_task.due_at, now()) + make_interval(days => greatest(v_interval_days, 1));
  v_delay_minutes := greatest(
    0,
    floor(
      extract(
        epoch from (
          now() - (v_task.due_at + make_interval(mins => v_grace_minutes))
        )
      ) / 60
    )::integer
  );
  v_penalty :=
    case
      when coalesce(v_task.ignore_delay_penalty_once, false) then 0
      else coalesce(v_task.delay_penalty_per_day, 0) * (v_delay_minutes::numeric / 1440.0)
    end;
  v_pimpers_earned := round(greatest(v_task.effort_pimpers - v_penalty, 0), 2);

  insert into task_completions (
    task_id,
    household_id,
    task_title_snapshot,
    user_id,
    pimpers_earned,
    due_at_snapshot,
    delay_minutes,
    completed_at
  )
  values (
    v_task.id,
    v_task.household_id,
    v_task.title,
    p_user_id,
    v_pimpers_earned,
    v_task.due_at,
    v_delay_minutes,
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
    v_pimpers_earned,
    now()
  )
  on conflict (household_id, user_id)
  do update
  set
    total_pimpers = household_member_pimpers.total_pimpers + excluded.total_pimpers,
    updated_at = now();

  v_next_assignee := choose_next_task_assignee(
    v_task.id,
    v_task.prioritize_low_pimpers,
    v_task.assignee_fairness_mode
  );

  update tasks
  set
    done = true,
    done_at = now(),
    done_by = p_user_id,
    due_at = v_next_due,
    assignee_id = coalesce(v_next_assignee, assignee_id),
    ignore_delay_penalty_once = false
  where id = v_task.id;
end;
$$;

create or replace function reopen_due_tasks(p_household_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
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
    and is_active = true
    and due_at <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function skip_task(p_task_id uuid, p_user_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task tasks%rowtype;
  v_next_due timestamptz;
  v_next_assignee uuid;
  v_interval_days integer;
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
    raise exception 'Not allowed to skip task in this household';
  end if;

  if not v_task.is_active then
    raise exception 'Task is inactive';
  end if;

  if v_task.assignee_id is not null and v_task.assignee_id is distinct from p_user_id then
    raise exception 'Only the assigned person can skip this task';
  end if;

  if v_task.due_at > now() then
    raise exception 'Task is not due yet';
  end if;

  v_interval_days := task_cron_interval_days(v_task.cron_pattern, v_task.frequency_days);
  v_next_due := greatest(v_task.due_at, now()) + make_interval(days => greatest(v_interval_days, 1));
  v_next_assignee := choose_next_task_assignee(
    v_task.id,
    v_task.prioritize_low_pimpers,
    v_task.assignee_fairness_mode
  );

  update tasks
  set
    done = false,
    done_at = null,
    done_by = null,
    due_at = v_next_due,
    assignee_id = coalesce(v_next_assignee, assignee_id),
    ignore_delay_penalty_once = false
  where id = v_task.id;
end;
$$;

create or replace function reset_household_pimpers(p_household_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if not is_household_owner(p_household_id) then
    raise exception 'Only household owners can reset pimpers';
  end if;

  update household_member_pimpers
  set
    total_pimpers = 0,
    updated_at = now()
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
      'pimpers_reset',
      auth.uid(),
      null,
      jsonb_build_object('total_reset', affected),
      now()
    );
  end if;

  return affected;
end;
$$;

create or replace function run_household_data_maintenance(
  p_household_id uuid,
  p_emit_admin_hint boolean default true,
  p_enforce_owner boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_orphan_rotation integer := 0;
  reset_invalid_assignee integer := 0;
  assigned_missing_assignee integer := 0;
  healed_done_missing_done_at integer := 0;
  healed_done_missing_done_by integer := 0;
  healed_open_with_done_fields integer := 0;
  total_fixes integer := 0;
  summary_message text;
begin
  -- Only service_role may bypass owner checks (used by scheduled maintenance).
  -- For authenticated users, owner enforcement is always required, even if
  -- p_enforce_owner=false is passed by the caller.
  if (
    (auth.role() is not null and auth.role() <> 'service_role')
    or p_enforce_owner
  ) and not is_household_owner(p_household_id) then
    raise exception 'Only household owners can run maintenance';
  end if;

  delete from task_rotation_members trm
  using tasks t
  where trm.task_id = t.id
    and t.household_id = p_household_id
    and not exists (
      select 1
      from household_members hm
      where hm.household_id = p_household_id
        and hm.user_id = trm.user_id
    );
  get diagnostics removed_orphan_rotation = row_count;

  update tasks t
  set assignee_id = null
  where t.household_id = p_household_id
    and t.assignee_id is not null
    and not exists (
      select 1
      from task_rotation_members trm
      where trm.task_id = t.id
        and trm.user_id = t.assignee_id
    );
  get diagnostics reset_invalid_assignee = row_count;

  update tasks t
  set assignee_id = next_rotation.user_id
  from (
    select distinct on (trm.task_id)
      trm.task_id,
      trm.user_id
    from task_rotation_members trm
    join tasks task_row on task_row.id = trm.task_id
    where task_row.household_id = p_household_id
    order by trm.task_id, trm.position asc
  ) as next_rotation
  where t.id = next_rotation.task_id
    and t.household_id = p_household_id
    and t.assignee_id is null;
  get diagnostics assigned_missing_assignee = row_count;

  update tasks
  set done_at = now()
  where household_id = p_household_id
    and done = true
    and done_at is null;
  get diagnostics healed_done_missing_done_at = row_count;

  update tasks
  set done_by = coalesce(assignee_id, created_by)
  where household_id = p_household_id
    and done = true
    and done_by is null;
  get diagnostics healed_done_missing_done_by = row_count;

  update tasks
  set
    done_at = null,
    done_by = null
  where household_id = p_household_id
    and done = false
    and (done_at is not null or done_by is not null);
  get diagnostics healed_open_with_done_fields = row_count;

  total_fixes :=
    removed_orphan_rotation
    + reset_invalid_assignee
    + assigned_missing_assignee
    + healed_done_missing_done_at
    + healed_done_missing_done_by
    + healed_open_with_done_fields;

  if p_emit_admin_hint and total_fixes > 0 then
    summary_message := format(
      'Auto-heal fixed %s issue(s): rotation=%s, assignee_reset=%s, assignee_assigned=%s, done_at=%s, done_by=%s, open_cleanup=%s',
      total_fixes,
      removed_orphan_rotation,
      reset_invalid_assignee,
      assigned_missing_assignee,
      healed_done_missing_done_at,
      healed_done_missing_done_by,
      healed_open_with_done_fields
    );

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
      'admin_hint',
      null,
      null,
      jsonb_build_object(
        'message', summary_message,
        'total_fixes', total_fixes,
        'removed_orphan_rotation', removed_orphan_rotation,
        'reset_invalid_assignee', reset_invalid_assignee,
        'assigned_missing_assignee', assigned_missing_assignee,
        'healed_done_missing_done_at', healed_done_missing_done_at,
        'healed_done_missing_done_by', healed_done_missing_done_by,
        'healed_open_with_done_fields', healed_open_with_done_fields
      ),
      now()
    );
  end if;

  return jsonb_build_object(
    'household_id', p_household_id,
    'total_fixes', total_fixes,
    'removed_orphan_rotation', removed_orphan_rotation,
    'reset_invalid_assignee', reset_invalid_assignee,
    'assigned_missing_assignee', assigned_missing_assignee,
    'healed_done_missing_done_at', healed_done_missing_done_at,
    'healed_done_missing_done_by', healed_done_missing_done_by,
    'healed_open_with_done_fields', healed_open_with_done_fields
  );
end;
$$;

create or replace function run_all_households_data_maintenance(p_emit_admin_hint boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
  report jsonb;
  reports jsonb[] := '{}';
  total_households integer := 0;
begin
  for hid in
    select id
    from households
  loop
    report := run_household_data_maintenance(hid, p_emit_admin_hint, false);
    reports := array_append(reports, report);
    total_households := total_households + 1;
  end loop;

  return jsonb_build_object(
    'households_checked', total_households,
    'reports', reports
  );
end;
$$;

create or replace function rate_task_completion(
  p_task_completion_id uuid,
  p_rating integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completion task_completions%rowtype;
  v_latest_completion_id uuid;
  v_user_id uuid;
  v_rater_name text;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5';
  end if;

  select *
  into v_completion
  from task_completions
  where id = p_task_completion_id;

  if not found then
    raise exception 'Unknown task completion id: %', p_task_completion_id;
  end if;

  if not is_household_member(v_completion.household_id) then
    raise exception 'Not allowed to rate this completion';
  end if;

  if v_completion.user_id = v_user_id then
    raise exception 'You cannot rate your own completion';
  end if;

  select tc.id
  into v_latest_completion_id
  from task_completions tc
  where tc.task_id = v_completion.task_id
  order by tc.completed_at desc, tc.id desc
  limit 1;

  if v_latest_completion_id is distinct from v_completion.id then
    raise exception 'Only the latest completion of a task can be rated';
  end if;

  select nullif(trim(coalesce(up.display_name, '')), '')
  into v_rater_name
  from user_profiles up
  where up.user_id = v_user_id;

  insert into task_completion_ratings (
    task_completion_id,
    household_id,
    user_id,
    rating,
    created_at,
    updated_at
  )
  values (
    v_completion.id,
    v_completion.household_id,
    v_user_id,
    p_rating::smallint,
    now(),
    now()
  )
  on conflict (task_completion_id, user_id)
  do update
  set
    rating = excluded.rating,
    updated_at = now();

  insert into household_events (
    household_id,
    event_type,
    actor_user_id,
    subject_user_id,
    payload,
    created_at
  )
  values (
    v_completion.household_id,
    'task_rated',
    v_user_id,
    v_completion.user_id,
    jsonb_build_object(
      'taskId', v_completion.task_id,
      'taskCompletionId', v_completion.id,
      'title', v_completion.task_title_snapshot,
      'rating', p_rating,
      'target_user_id', v_completion.user_id,
      'rater_name', v_rater_name
    ),
    now()
  );
end;
$$;

revoke all on function run_all_households_data_maintenance(boolean) from public;
grant execute on function run_all_households_data_maintenance(boolean) to service_role;

revoke all on function is_household_member(uuid) from public;
grant execute on function is_household_member(uuid) to authenticated, service_role;

revoke all on function is_household_owner(uuid) from public;
grant execute on function is_household_owner(uuid) to authenticated, service_role;

revoke all on function join_household_by_invite(text) from public;
grant execute on function join_household_by_invite(text) to authenticated, service_role;

revoke all on function rate_task_completion(uuid, integer) from public;
grant execute on function rate_task_completion(uuid, integer) to authenticated, service_role;

revoke all on function task_cron_interval_days(text, integer) from public;
grant execute on function task_cron_interval_days(text, integer) to authenticated, service_role;

revoke all on function reset_due_recurring_shopping_items(uuid) from public;
grant execute on function reset_due_recurring_shopping_items(uuid) to authenticated, service_role;

revoke all on function choose_next_task_assignee(uuid, boolean, text) from public;
grant execute on function choose_next_task_assignee(uuid, boolean, text) to authenticated, service_role;

revoke all on function complete_task(uuid, uuid) from public;
grant execute on function complete_task(uuid, uuid) to authenticated, service_role;

revoke all on function reopen_due_tasks(uuid) from public;
grant execute on function reopen_due_tasks(uuid) to authenticated, service_role;

revoke all on function skip_task(uuid, uuid) from public;
grant execute on function skip_task(uuid, uuid) to authenticated, service_role;

revoke all on function reset_household_pimpers(uuid) from public;
grant execute on function reset_household_pimpers(uuid) to authenticated, service_role;

revoke all on function run_household_data_maintenance(uuid, boolean, boolean) from public;
grant execute on function run_household_data_maintenance(uuid, boolean, boolean) to authenticated, service_role;

do $$
begin
  if exists (
    select 1
    from pg_extension
    where extname = 'pg_cron'
  ) then
    if not exists (
      select 1
      from cron.job
      where jobname = 'domora_household_data_maintenance_hourly'
    ) then
      perform cron.schedule(
        'domora_household_data_maintenance_hourly',
        '7 * * * *',
        'select public.run_all_households_data_maintenance(true);'
      );
    end if;
  end if;
exception
  when others then
    -- Do not fail schema deploy if pg_cron setup is unavailable, but surface
    -- the issue so it is visible in migration/deploy logs.
    raise warning
      'pg_cron job setup failed for domora_household_data_maintenance_hourly (SQLSTATE %, error %)',
      SQLSTATE,
      SQLERRM;
end;
$$;

alter table households enable row level security;
alter table household_members enable row level security;
alter table user_profiles enable row level security;
alter table shopping_items enable row level security;
alter table bucket_items enable row level security;
alter table bucket_item_date_votes enable row level security;
alter table shopping_item_completions enable row level security;
alter table tasks enable row level security;
alter table task_rotation_members enable row level security;
alter table household_member_pimpers enable row level security;
alter table task_completions enable row level security;
alter table task_completion_ratings enable row level security;
alter table household_events enable row level security;
alter table household_whiteboards enable row level security;
alter table finance_entries enable row level security;
alter table cash_audit_requests enable row level security;
alter table finance_subscriptions enable row level security;

-- Prototype-friendly policy: authenticated users can read households.
drop policy if exists households_select on households;
create policy households_select on households
for select
to authenticated
using (is_household_member(id));

drop policy if exists households_insert on households;
create policy households_insert on households
for insert
to authenticated
with check ((select auth.uid()) = created_by);

drop policy if exists households_update on households;
create policy households_update on households
for update
to authenticated
using (is_household_owner(id))
with check (is_household_owner(id));

drop policy if exists households_delete on households;
create policy households_delete on households
for delete
to authenticated
using (is_household_owner(id));

drop policy if exists household_members_select on household_members;
create policy household_members_select on household_members
for select
to authenticated
using (is_household_member(household_id) or user_id = (select auth.uid()));

drop policy if exists household_members_insert on household_members;
create policy household_members_insert on household_members
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and is_household_owner(household_members.household_id)
);

drop policy if exists household_members_delete on household_members;
create policy household_members_delete on household_members
for delete
to authenticated
using ((select auth.uid()) = user_id or is_household_owner(household_id));

drop policy if exists household_members_update on household_members;
create policy household_members_update on household_members
for update
to authenticated
using ((select auth.uid()) = user_id or is_household_owner(household_id))
with check (
  is_household_owner(household_id)
  or (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from household_members hm
      where hm.household_id = household_members.household_id
        and hm.user_id = (select auth.uid())
        and hm.role = household_members.role
    )
  )
);

drop policy if exists user_profiles_select on user_profiles;
create policy user_profiles_select on user_profiles
for select
to authenticated
using (
  (select auth.uid()) = user_id
  or exists (
    select 1
    from household_members hm_viewer
    join household_members hm_target
      on hm_target.household_id = hm_viewer.household_id
    where hm_viewer.user_id = (select auth.uid())
      and hm_target.user_id = user_profiles.user_id
  )
);

drop policy if exists user_profiles_insert on user_profiles;
create policy user_profiles_insert on user_profiles
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists user_profiles_update on user_profiles;
create policy user_profiles_update on user_profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists shopping_items_all on shopping_items;
create policy shopping_items_all on shopping_items
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists bucket_items_all on bucket_items;
create policy bucket_items_all on bucket_items
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists bucket_item_date_votes_select on bucket_item_date_votes;
create policy bucket_item_date_votes_select on bucket_item_date_votes
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists bucket_item_date_votes_insert on bucket_item_date_votes;
create policy bucket_item_date_votes_insert on bucket_item_date_votes
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists bucket_item_date_votes_delete on bucket_item_date_votes;
create policy bucket_item_date_votes_delete on bucket_item_date_votes
for delete
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists shopping_item_completions_select on shopping_item_completions;
create policy shopping_item_completions_select on shopping_item_completions
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists shopping_item_completions_insert on shopping_item_completions;
create policy shopping_item_completions_insert on shopping_item_completions
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = completed_by);

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
drop policy if exists household_member_pimpers_select on household_member_pimpers;
create policy household_member_pimpers_select on household_member_pimpers
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists household_member_pimpers_insert_own on household_member_pimpers;
create policy household_member_pimpers_insert_own on household_member_pimpers
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists household_member_pimpers_update_own on household_member_pimpers;
create policy household_member_pimpers_update_own on household_member_pimpers
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id)
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists task_completions_select on task_completions;
create policy task_completions_select on task_completions
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_completions_insert on task_completions;
create policy task_completions_insert on task_completions
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists task_completion_ratings_select on task_completion_ratings;
create policy task_completion_ratings_select on task_completion_ratings
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists household_events_select on household_events;
create policy household_events_select on household_events
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists household_events_insert on household_events;
create policy household_events_insert on household_events
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (actor_user_id is null or (select auth.uid()) = actor_user_id)
);

drop policy if exists household_whiteboards_select on household_whiteboards;
create policy household_whiteboards_select on household_whiteboards
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists household_whiteboards_upsert on household_whiteboards;
create policy household_whiteboards_upsert on household_whiteboards
for insert
to authenticated
with check (is_household_member(household_id) and (updated_by is null or (select auth.uid()) = updated_by));

drop policy if exists household_whiteboards_update on household_whiteboards;
create policy household_whiteboards_update on household_whiteboards
for update
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id) and (updated_by is null or (select auth.uid()) = updated_by));

drop policy if exists finance_entries_all on finance_entries;
drop policy if exists finance_entries_select on finance_entries;
drop policy if exists finance_entries_insert on finance_entries;
drop policy if exists finance_entries_update_own on finance_entries;
drop policy if exists finance_entries_delete_own on finance_entries;

create policy finance_entries_select on finance_entries
for select
to authenticated
using (is_household_member(household_id));

create policy finance_entries_insert on finance_entries
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = created_by);

create policy finance_entries_update_own on finance_entries
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = created_by)
with check (is_household_member(household_id) and (select auth.uid()) = created_by);

create policy finance_entries_delete_own on finance_entries
for delete
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = created_by);

drop policy if exists cash_audit_requests_all on cash_audit_requests;
create policy cash_audit_requests_all on cash_audit_requests
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists finance_subscriptions_all on finance_subscriptions;
create policy finance_subscriptions_all on finance_subscriptions
for all
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));
