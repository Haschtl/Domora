create table if not exists task_time_archives (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  archived_by uuid references auth.users(id) on delete set null,
  entry_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table task_time_archives enable row level security;

drop policy if exists task_time_archives_select on task_time_archives;
create policy task_time_archives_select on task_time_archives
for select
to authenticated
using (is_household_member(household_id));

alter table task_time_entries
add column if not exists archived_at timestamptz,
add column if not exists archived_by uuid references auth.users(id) on delete set null,
add column if not exists archive_batch_id uuid references task_time_archives(id) on delete set null;

drop index if exists idx_task_time_entries_vacation_credit;
create unique index if not exists idx_task_time_entries_vacation_credit
  on task_time_entries (vacation_id)
  where source = 'vacation_credit'
    and archived_at is null;

create index if not exists idx_task_time_entries_household_active_date
  on task_time_entries (household_id, entry_date desc, created_at desc)
  where archived_at is null;

create index if not exists idx_task_time_entries_archive_batch
  on task_time_entries (archive_batch_id)
  where archive_batch_id is not null;

drop policy if exists task_time_entries_insert_manual on task_time_entries;
create policy task_time_entries_insert_manual on task_time_entries
for insert
to authenticated
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and (select auth.uid()) = created_by
  and source = 'manual'
  and archived_at is null
);

drop policy if exists task_time_entries_delete_manual_own on task_time_entries;
create policy task_time_entries_delete_manual_own on task_time_entries
for delete
to authenticated
using (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
  and archived_at is null
);

drop policy if exists task_time_entries_update_manual_own on task_time_entries;
create policy task_time_entries_update_manual_own on task_time_entries
for update
to authenticated
using (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
  and archived_at is null
)
with check (
  is_household_member(household_id)
  and (select auth.uid()) = created_by
  and source = 'manual'
  and archived_at is null
);

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
      and tte.archived_at is null
  )
);

drop policy if exists task_time_entry_ratings_update on task_time_entry_ratings;
create policy task_time_entry_ratings_update on task_time_entry_ratings
for update
to authenticated
using (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from task_time_entries tte
    where tte.id = task_time_entry_id
      and tte.household_id = task_time_entry_ratings.household_id
      and tte.archived_at is null
  )
)
with check (
  is_household_member(household_id)
  and (select auth.uid()) = user_id
  and exists (
    select 1
    from task_time_entries tte
    where tte.id = task_time_entry_id
      and tte.household_id = task_time_entry_ratings.household_id
      and tte.archived_at is null
  )
);

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
      and tte.archived_at is null
  )
);

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
          and existing.archived_at is null
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
       and tte.archived_at is null
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
    select tcp.*
    from task_time_correction_proposals tcp
    join task_time_entries tte
      on tte.id = tcp.task_time_entry_id
     and tte.household_id = tcp.household_id
     and tte.archived_at is null
    where tcp.household_id = p_household_id
      and tcp.status = 'open'
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
        and source = 'manual'
        and archived_at is null;
    end if;

    update task_time_correction_proposals
    set
      status = case when v_accept then 'approved' else 'rejected' end,
      resolved_at = now()
    where id = v_proposal.id;
  end loop;
end;
$$;

create or replace function reset_task_time_data(p_household_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  v_archive_id uuid;
begin
  if not is_household_owner(p_household_id) then
    raise exception 'Only household owners can reset task time data';
  end if;

  insert into task_time_archives (
    household_id,
    archived_by
  )
  values (
    p_household_id,
    auth.uid()
  )
  returning id into v_archive_id;

  update task_time_entries
  set
    archived_at = now(),
    archived_by = auth.uid(),
    archive_batch_id = v_archive_id
  where household_id = p_household_id
    and archived_at is null;

  get diagnostics affected = row_count;

  update task_time_archives
  set entry_count = affected
  where id = v_archive_id;

  update task_time_correction_proposals
  set
    status = 'rejected',
    resolved_at = now()
  where household_id = p_household_id
    and status = 'open'
    and exists (
      select 1
      from task_time_entries tte
      where tte.id = task_time_correction_proposals.task_time_entry_id
        and tte.archive_batch_id = v_archive_id
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
    'task_time_reset',
    auth.uid(),
    null,
    jsonb_build_object('total_archived', affected, 'archive_id', v_archive_id),
    now()
  );

  return affected;
end;
$$;

revoke all on function reset_task_time_data(uuid) from public, anon;
grant execute on function reset_task_time_data(uuid) to authenticated, service_role;
