alter table households
  add column if not exists feature_one_off_tasks_enabled boolean not null default true;

alter table households
  add column if not exists one_off_claim_timeout_hours integer not null default 72;

alter table households
  add column if not exists one_off_claim_max_pimpers integer not null default 500;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'households_one_off_claim_timeout_hours_allowed_check'
  ) then
    alter table households
      add constraint households_one_off_claim_timeout_hours_allowed_check
      check (one_off_claim_timeout_hours >= 0 and one_off_claim_timeout_hours <= 336);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'households_one_off_claim_max_pimpers_allowed_check'
  ) then
    alter table households
      add constraint households_one_off_claim_max_pimpers_allowed_check
      check (one_off_claim_max_pimpers >= 1 and one_off_claim_max_pimpers <= 5000);
  end if;
end;
$$;

create table if not exists one_off_task_claims (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  title text not null,
  description text not null default '',
  requested_pimpers integer not null check (requested_pimpers > 0),
  status text not null default 'open' check (status in ('open', 'approved', 'rejected', 'expired', 'withdrawn')),
  resolved_pimpers numeric(12, 2) check (resolved_pimpers is null or resolved_pimpers >= 0),
  expires_at timestamptz not null default (now() + interval '72 hours'),
  resolved_at timestamptz,
  renewed_from uuid references one_off_task_claims(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists one_off_task_claim_votes (
  claim_id uuid not null references one_off_task_claims(id) on delete cascade,
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_type text not null check (vote_type in ('approve', 'reject', 'counter')),
  counter_pimpers integer check (counter_pimpers is null or counter_pimpers > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (claim_id, user_id),
  check ((vote_type = 'counter' and counter_pimpers is not null) or (vote_type <> 'counter' and counter_pimpers is null))
);

create index if not exists idx_one_off_task_claims_household_created_at on one_off_task_claims (household_id, created_at desc);
create index if not exists idx_one_off_task_claims_household_status on one_off_task_claims (household_id, status, created_at desc);
create index if not exists idx_one_off_task_claim_votes_claim on one_off_task_claim_votes (claim_id);

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

drop trigger if exists trg_one_off_task_claim_votes_set_updated_at on one_off_task_claim_votes;
create trigger trg_one_off_task_claim_votes_set_updated_at
before update on one_off_task_claim_votes
for each row execute function set_updated_at();

create or replace function resolve_one_off_task_claim(
  p_claim_id uuid,
  p_status text,
  p_resolved_pimpers numeric default null
)
returns one_off_task_claims
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim one_off_task_claims%rowtype;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated';
  end if;

  if p_status not in ('approved', 'rejected', 'expired', 'withdrawn') then
    raise exception 'Invalid status';
  end if;

  select *
  into v_claim
  from one_off_task_claims
  where id = p_claim_id
  for update;

  if not found then
    raise exception 'Claim not found';
  end if;

  if not is_household_member(v_claim.household_id) then
    raise exception 'Forbidden';
  end if;

  if v_claim.status <> 'open' then
    return v_claim;
  end if;

  update one_off_task_claims
  set
    status = p_status,
    resolved_pimpers = case
      when p_status = 'approved' then greatest(coalesce(p_resolved_pimpers, v_claim.requested_pimpers), 0)
      else null
    end,
    resolved_at = now()
  where id = p_claim_id
  returning *
  into v_claim;

  if p_status = 'approved' then
    insert into household_member_pimpers (household_id, user_id, total_pimpers, updated_at)
    values (
      v_claim.household_id,
      v_claim.created_by,
      greatest(coalesce(v_claim.resolved_pimpers, v_claim.requested_pimpers), 0),
      now()
    )
    on conflict (household_id, user_id)
    do update
      set total_pimpers = household_member_pimpers.total_pimpers + excluded.total_pimpers,
          updated_at = now();
  end if;

  return v_claim;
end;
$$;

revoke all on function resolve_one_off_task_claim(uuid, text, numeric) from public;
grant execute on function resolve_one_off_task_claim(uuid, text, numeric) to authenticated, service_role;

alter table one_off_task_claims enable row level security;
alter table one_off_task_claim_votes enable row level security;

drop policy if exists one_off_task_claims_select on one_off_task_claims;
create policy one_off_task_claims_select on one_off_task_claims
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists one_off_task_claims_insert on one_off_task_claims;
create policy one_off_task_claims_insert on one_off_task_claims
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = created_by);

drop policy if exists one_off_task_claims_update on one_off_task_claims;
create policy one_off_task_claims_update on one_off_task_claims
for update
to authenticated
using (is_household_member(household_id))
with check (is_household_member(household_id));

drop policy if exists one_off_task_claim_votes_select on one_off_task_claim_votes;
create policy one_off_task_claim_votes_select on one_off_task_claim_votes
for select
to authenticated
using (is_household_member(household_id));

drop policy if exists one_off_task_claim_votes_insert on one_off_task_claim_votes;
create policy one_off_task_claim_votes_insert on one_off_task_claim_votes
for insert
to authenticated
with check (is_household_member(household_id) and (select auth.uid()) = user_id);

drop policy if exists one_off_task_claim_votes_update on one_off_task_claim_votes;
create policy one_off_task_claim_votes_update on one_off_task_claim_votes
for update
to authenticated
using (is_household_member(household_id) and (select auth.uid()) = user_id)
with check (is_household_member(household_id) and (select auth.uid()) = user_id);
