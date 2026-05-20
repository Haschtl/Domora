alter table households
add column if not exists task_mode text not null default 'rotation';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_task_mode_check'
  ) then
    alter table households
      add constraint households_task_mode_check
      check (task_mode in ('rotation', 'time'));
  end if;
end $$;

create table if not exists task_time_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  hours numeric(8, 2) not null,
  details text not null default '',
  image_url text,
  source text not null default 'manual' check (source in ('manual', 'vacation_credit')),
  vacation_id uuid references member_vacations(id) on delete set null,
  entry_date date not null default current_date,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (char_length(trim(description)) > 0),
  check (hours >= 0 and hours <= 24),
  check (
    (source = 'manual' and vacation_id is null)
    or (source = 'vacation_credit' and vacation_id is not null)
  )
);

create table if not exists task_time_entry_ratings (
  task_time_entry_id uuid not null references task_time_entries(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating >= 1 and rating <= 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_time_entry_id, user_id)
);

create table if not exists task_time_correction_proposals (
  id uuid primary key default gen_random_uuid(),
  task_time_entry_id uuid not null references task_time_entries(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  proposed_description text not null,
  proposed_hours numeric(8, 2) not null,
  proposed_details text not null default '',
  proposed_image_url text,
  reason text not null default '',
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (char_length(trim(proposed_description)) > 0),
  check (proposed_hours > 0 and proposed_hours <= 24)
);

create table if not exists task_time_correction_votes (
  proposal_id uuid not null references task_time_correction_proposals(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_type text not null check (vote_type in ('approve', 'reject')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create unique index if not exists idx_task_time_entries_vacation_credit
  on task_time_entries (vacation_id)
  where source = 'vacation_credit';

create index if not exists idx_task_time_entries_household_date
  on task_time_entries (household_id, entry_date desc, created_at desc);

create index if not exists idx_task_time_entries_user
  on task_time_entries (household_id, user_id);

create index if not exists idx_task_time_entry_ratings_household_entry
  on task_time_entry_ratings (household_id, task_time_entry_id);
create index if not exists idx_task_time_correction_proposals_household_status
  on task_time_correction_proposals (household_id, status, created_at desc);
create index if not exists idx_task_time_correction_votes_proposal
  on task_time_correction_votes (proposal_id);

create or replace function settle_task_time_vacation_credits(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vacation record;
  v_average_hours numeric(8, 2);
begin
  if not is_household_member(p_household_id) then
    raise exception 'Not allowed to settle vacation credits for this household';
  end if;

  for v_vacation in
    select mv.*
    from member_vacations mv
    where mv.household_id = p_household_id
      and mv.end_date < current_date
      and not exists (
        select 1
        from task_time_entries existing
        where existing.source = 'vacation_credit'
          and existing.vacation_id = mv.id
      )
  loop
    with present_members as (
      select hm.user_id
      from household_members hm
      where hm.household_id = v_vacation.household_id
        and hm.user_id <> v_vacation.user_id
        and not exists (
          select 1
          from member_vacations other_vacation
          where other_vacation.household_id = hm.household_id
            and other_vacation.user_id = hm.user_id
            and other_vacation.start_date <= v_vacation.end_date
            and other_vacation.end_date >= v_vacation.start_date
        )
    ),
    present_member_hours as (
      select
        pm.user_id,
        coalesce(sum(tte.hours), 0) as total_hours
      from present_members pm
      left join task_time_entries tte
        on tte.household_id = v_vacation.household_id
       and tte.user_id = pm.user_id
       and tte.source = 'manual'
       and tte.entry_date between v_vacation.start_date and v_vacation.end_date
      group by pm.user_id
    )
    select round(coalesce(avg(total_hours), 0), 2)
    into v_average_hours
    from present_member_hours;

    if coalesce(v_average_hours, 0) > 0 then
      insert into task_time_entries (
        household_id,
        user_id,
        description,
        hours,
        details,
        source,
        vacation_id,
        entry_date,
        created_by
      )
      values (
        v_vacation.household_id,
        v_vacation.user_id,
        'Urlaubs-Gutschrift',
        v_average_hours,
        '',
        'vacation_credit',
        v_vacation.id,
        v_vacation.end_date,
        v_vacation.created_by
      )
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

create or replace function resolve_task_time_correction_proposals(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_proposal record;
  v_member_count integer;
  v_approve_count integer;
  v_reject_count integer;
  v_accept boolean;
begin
  if not is_household_member(p_household_id) then
    raise exception 'Not allowed to resolve correction proposals for this household';
  end if;

  select count(*)
  into v_member_count
  from household_members
  where household_id = p_household_id;

  for v_proposal in
    select *
    from task_time_correction_proposals
    where household_id = p_household_id
      and status = 'open'
  loop
    select
      count(*) filter (where vote_type = 'approve'),
      count(*) filter (where vote_type = 'reject')
    into v_approve_count, v_reject_count
    from task_time_correction_votes
    where proposal_id = v_proposal.id;

    v_accept := false;
    if v_approve_count > v_member_count / 2.0 then
      v_accept := true;
    elsif v_reject_count > v_member_count / 2.0 then
      v_accept := false;
    elsif v_proposal.expires_at <= now() then
      v_accept := v_approve_count > v_reject_count;
    else
      continue;
    end if;

    if v_accept then
      update task_time_entries
      set
        description = v_proposal.proposed_description,
        hours = v_proposal.proposed_hours,
        details = v_proposal.proposed_details,
        image_url = v_proposal.proposed_image_url
      where id = v_proposal.task_time_entry_id
        and household_id = v_proposal.household_id
        and source = 'manual';
    end if;

    update task_time_correction_proposals
    set
      status = case when v_accept then 'approved' else 'rejected' end,
      resolved_at = now()
    where id = v_proposal.id;
  end loop;
end;
$$;

alter table task_time_entries enable row level security;
alter table task_time_entry_ratings enable row level security;
alter table task_time_correction_proposals enable row level security;
alter table task_time_correction_votes enable row level security;

drop policy if exists task_time_entries_select on task_time_entries;
create policy task_time_entries_select on task_time_entries
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_time_entries_insert_manual on task_time_entries;
create policy task_time_entries_insert_manual on task_time_entries
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and (select auth.uid()) = created_by
  and source = 'manual'
);

drop policy if exists task_time_entries_delete_manual_own on task_time_entries;
create policy task_time_entries_delete_manual_own on task_time_entries
for delete
to authenticated
using (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
);

drop policy if exists task_time_entries_update_manual_own on task_time_entries;
create policy task_time_entries_update_manual_own on task_time_entries
for update
to authenticated
using (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
)
with check (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
);

drop policy if exists task_time_entry_ratings_select on task_time_entry_ratings;
create policy task_time_entry_ratings_select on task_time_entry_ratings
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_time_entry_ratings_insert on task_time_entry_ratings;
create policy task_time_entry_ratings_insert on task_time_entry_ratings
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from task_time_entries tte
    where tte.id = task_time_entry_id
      and tte.household_id = task_time_entry_ratings.household_id
      and tte.user_id <> (select auth.uid())
  )
);

drop policy if exists task_time_entry_ratings_update on task_time_entry_ratings;
create policy task_time_entry_ratings_update on task_time_entry_ratings
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id)
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists task_time_correction_proposals_select on task_time_correction_proposals;
create policy task_time_correction_proposals_select on task_time_correction_proposals
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_time_correction_proposals_insert on task_time_correction_proposals;
create policy task_time_correction_proposals_insert on task_time_correction_proposals
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and exists (
    select 1
    from task_time_entries tte
    where tte.id = task_time_entry_id
      and tte.household_id = task_time_correction_proposals.household_id
      and tte.user_id <> (select auth.uid())
      and tte.source = 'manual'
  )
);

drop policy if exists task_time_correction_votes_select on task_time_correction_votes;
create policy task_time_correction_votes_select on task_time_correction_votes
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists task_time_correction_votes_insert on task_time_correction_votes;
create policy task_time_correction_votes_insert on task_time_correction_votes
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists task_time_correction_votes_update on task_time_correction_votes;
create policy task_time_correction_votes_update on task_time_correction_votes
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id)
with check (is_household_member(household_id) and (select auth.uid()) = user_id);
