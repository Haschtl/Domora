create table if not exists household_storage_secrets (
  household_id uuid primary key references households(id) on delete cascade,
  storage_username text not null,
  storage_password text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (char_length(trim(storage_username)) > 0),
  check (char_length(storage_password) > 0)
);

create table if not exists household_storage_login_flows (
  flow_id uuid primary key,
  household_id uuid not null references households(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'completed', 'expired', 'failed')),
  nextcloud_login_url text not null,
  nextcloud_poll_endpoint text not null,
  nextcloud_poll_token text,
  nextcloud_instance_url text not null,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create index if not exists idx_household_storage_login_flows_household_requested
  on household_storage_login_flows (household_id, requested_by, created_at desc);

update household_storage_secrets hs
set
  storage_username = h.storage_username,
  storage_password = h.storage_password,
  updated_at = now()
from households h
where hs.household_id = h.id
  and h.storage_provider <> 'none'
  and char_length(trim(h.storage_username)) > 0
  and char_length(h.storage_password) > 0;

insert into household_storage_secrets (household_id, storage_username, storage_password, updated_by, updated_at)
select
  h.id,
  h.storage_username,
  h.storage_password,
  h.created_by,
  now()
from households h
where h.storage_provider <> 'none'
  and char_length(trim(h.storage_username)) > 0
  and char_length(h.storage_password) > 0
  and not exists (
    select 1
    from household_storage_secrets hs
    where hs.household_id = h.id
  );

alter table household_storage_secrets enable row level security;
alter table household_storage_login_flows enable row level security;

revoke all on table household_storage_secrets from public;
revoke all on table household_storage_secrets from anon;
revoke all on table household_storage_secrets from authenticated;
grant all on table household_storage_secrets to service_role;

revoke all on table household_storage_login_flows from public;
revoke all on table household_storage_login_flows from anon;
revoke all on table household_storage_login_flows from authenticated;
grant all on table household_storage_login_flows to service_role;
