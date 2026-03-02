alter table households
add column if not exists household_map_markers jsonb not null default '[]'::jsonb;

update households
set household_map_markers = '[]'::jsonb
where household_map_markers is null
   or jsonb_typeof(household_map_markers) <> 'array';
