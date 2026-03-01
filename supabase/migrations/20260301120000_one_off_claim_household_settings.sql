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
