-- Household rules and feature flags
alter table if exists households
  add column if not exists vacation_tasks_exclude_enabled boolean not null default true,
  add column if not exists vacation_finances_exclude_enabled boolean not null default true,
  add column if not exists task_skip_enabled boolean not null default true,
  add column if not exists feature_bucket_enabled boolean not null default true,
  add column if not exists feature_shopping_enabled boolean not null default true,
  add column if not exists feature_tasks_enabled boolean not null default true,
  add column if not exists feature_finances_enabled boolean not null default true;
