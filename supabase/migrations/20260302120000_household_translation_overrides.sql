alter table households
add column if not exists translation_overrides jsonb not null default '[]'::jsonb;

update households
set translation_overrides = '[]'::jsonb
where translation_overrides is null
   or jsonb_typeof(translation_overrides) <> 'array';
