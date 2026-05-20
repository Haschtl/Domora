create table if not exists task_comments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  target_type text not null check (target_type in ('task', 'task_time_entry')),
  task_id uuid references tasks(id) on delete cascade,
  task_time_entry_id uuid references task_time_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(trim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check (
    (target_type = 'task' and task_id is not null and task_time_entry_id is null)
    or (target_type = 'task_time_entry' and task_time_entry_id is not null and task_id is null)
  )
);

create index if not exists idx_task_comments_household_created
  on task_comments (household_id, created_at);
create index if not exists idx_task_comments_task
  on task_comments (task_id, created_at)
  where task_id is not null;
create index if not exists idx_task_comments_task_time_entry
  on task_comments (task_time_entry_id, created_at)
  where task_time_entry_id is not null;

alter table task_comments enable row level security;

drop policy if exists task_comments_select on task_comments;
create policy task_comments_select on task_comments
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_comments_insert on task_comments;
create policy task_comments_insert on task_comments
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and (
    (
      target_type = 'task'
      and task_id is not null
      and exists (
        select 1
        from tasks t
        where t.id = task_id
          and t.household_id = task_comments.household_id
      )
    )
    or (
      target_type = 'task_time_entry'
      and task_time_entry_id is not null
      and exists (
        select 1
        from task_time_entries tte
        where tte.id = task_time_entry_id
          and tte.household_id = task_comments.household_id
      )
    )
  )
);
