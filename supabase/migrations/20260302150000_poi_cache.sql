create table if not exists poi_cache (
  cache_key text primary key,
  payload jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists idx_poi_cache_expires_at on poi_cache (expires_at);

revoke all on table poi_cache from public;
revoke all on table poi_cache from anon;
revoke all on table poi_cache from authenticated;
grant all on table poi_cache to service_role;
