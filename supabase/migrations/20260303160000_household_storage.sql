alter table households
  add column if not exists storage_provider text not null default 'none',
  add column if not exists storage_url text not null default '',
  add column if not exists storage_username text not null default '',
  add column if not exists storage_password text not null default '',
  add column if not exists storage_base_path text not null default '/domora';

update households
set storage_provider = 'none'
where storage_provider is null
   or storage_provider not in ('none', 'webdav', 'nextcloud');

update households
set storage_url = ''
where storage_url is null;

update households
set storage_username = ''
where storage_username is null;

update households
set storage_password = ''
where storage_password is null;

update households
set storage_base_path = '/domora'
where storage_base_path is null
   or char_length(trim(storage_base_path)) = 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_storage_provider_allowed_check'
  ) then
    alter table households
      add constraint households_storage_provider_allowed_check
      check (storage_provider in ('none', 'webdav', 'nextcloud'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_storage_base_path_not_empty_check'
  ) then
    alter table households
      add constraint households_storage_base_path_not_empty_check
      check (char_length(trim(storage_base_path)) > 0);
  end if;
end;
$$;
