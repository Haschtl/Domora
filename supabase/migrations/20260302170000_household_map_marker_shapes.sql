create or replace function is_valid_household_map_marker(p_marker jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  marker_type text;
  entry jsonb;
  n double precision;
  s double precision;
  w double precision;
  e double precision;
begin
  if p_marker is null or jsonb_typeof(p_marker) <> 'object' then
    return false;
  end if;

  if coalesce(nullif(trim(p_marker->>'id'), ''), '') = '' then
    return false;
  end if;

  if coalesce(nullif(trim(p_marker->>'title'), ''), '') = '' then
    return false;
  end if;

  if not (p_marker ? 'icon') or (p_marker->>'icon') not in (
    'home', 'shopping', 'restaurant', 'fuel', 'hospital', 'park', 'work', 'star'
  ) then
    return false;
  end if;

  if p_marker ? 'description' and jsonb_typeof(p_marker->'description') <> 'string' then
    return false;
  end if;

  if p_marker ? 'image_url' and jsonb_typeof(p_marker->'image_url') not in ('string', 'null') then
    return false;
  end if;

  marker_type := coalesce(nullif(p_marker->>'type', ''), 'point');

  if marker_type = 'point' then
    if jsonb_typeof(p_marker->'lat') <> 'number' or jsonb_typeof(p_marker->'lon') <> 'number' then
      return false;
    end if;

    return (p_marker->>'lat')::double precision between -90 and 90
      and (p_marker->>'lon')::double precision between -180 and 180;
  end if;

  if marker_type = 'vector' then
    if jsonb_typeof(p_marker->'points') <> 'array' or jsonb_array_length(p_marker->'points') < 2 then
      return false;
    end if;

    for entry in select value from jsonb_array_elements(p_marker->'points')
    loop
      if jsonb_typeof(entry) <> 'object'
        or jsonb_typeof(entry->'lat') <> 'number'
        or jsonb_typeof(entry->'lon') <> 'number' then
        return false;
      end if;

      if (entry->>'lat')::double precision not between -90 and 90
        or (entry->>'lon')::double precision not between -180 and 180 then
        return false;
      end if;
    end loop;

    return true;
  end if;

  if marker_type = 'circle' then
    if jsonb_typeof(p_marker->'center') <> 'object'
      or jsonb_typeof(p_marker#>'{center,lat}') <> 'number'
      or jsonb_typeof(p_marker#>'{center,lon}') <> 'number'
      or jsonb_typeof(p_marker->'radius_meters') <> 'number' then
      return false;
    end if;

    n := (p_marker#>>'{center,lat}')::double precision;
    e := (p_marker#>>'{center,lon}')::double precision;

    return n between -90 and 90
      and e between -180 and 180
      and (p_marker->>'radius_meters')::double precision > 0;
  end if;

  if marker_type = 'rectangle' then
    if jsonb_typeof(p_marker->'bounds') <> 'object'
      or jsonb_typeof(p_marker#>'{bounds,south}') <> 'number'
      or jsonb_typeof(p_marker#>'{bounds,west}') <> 'number'
      or jsonb_typeof(p_marker#>'{bounds,north}') <> 'number'
      or jsonb_typeof(p_marker#>'{bounds,east}') <> 'number' then
      return false;
    end if;

    s := (p_marker#>>'{bounds,south}')::double precision;
    w := (p_marker#>>'{bounds,west}')::double precision;
    n := (p_marker#>>'{bounds,north}')::double precision;
    e := (p_marker#>>'{bounds,east}')::double precision;

    return s between -90 and 90
      and n between -90 and 90
      and w between -180 and 180
      and e between -180 and 180
      and n >= s;
  end if;

  return false;
end;
$$;

create or replace function is_valid_household_map_markers(p_markers jsonb)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  entry jsonb;
begin
  if p_markers is null or jsonb_typeof(p_markers) <> 'array' then
    return false;
  end if;

  for entry in select value from jsonb_array_elements(p_markers)
  loop
    if not is_valid_household_map_marker(entry) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

update households h
set household_map_markers = (
  select coalesce(
    jsonb_agg(
      case
        when jsonb_typeof(element) = 'object' and not (element ? 'type')
          then jsonb_set(element, '{type}', '"point"'::jsonb, true)
        else element
      end
      order by ordinality
    ),
    '[]'::jsonb
  )
  from jsonb_array_elements(h.household_map_markers) with ordinality as elems(element, ordinality)
)
where exists (
  select 1
  from jsonb_array_elements(h.household_map_markers) as elems(element)
  where jsonb_typeof(element) = 'object'
    and not (element ? 'type')
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'households_map_markers_structure_check'
  ) then
    alter table households
      add constraint households_map_markers_structure_check
      check (is_valid_household_map_markers(household_map_markers));
  end if;
end;
$$;
