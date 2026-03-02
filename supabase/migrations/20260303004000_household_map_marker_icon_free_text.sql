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

  -- Allow arbitrary icon identifiers (non-empty string).
  if not (p_marker ? 'icon')
    or jsonb_typeof(p_marker->'icon') <> 'string'
    or char_length(trim(p_marker->>'icon')) = 0 then
    return false;
  end if;

  if p_marker ? 'description' and jsonb_typeof(p_marker->'description') <> 'string' then
    return false;
  end if;

  if p_marker ? 'image_url' then
    return false;
  end if;

  if p_marker ? 'poi_ref' then
    if jsonb_typeof(p_marker->'poi_ref') not in ('string', 'null') then
      return false;
    end if;
    if jsonb_typeof(p_marker->'poi_ref') = 'string'
      and char_length(trim(p_marker->>'poi_ref')) = 0 then
      return false;
    end if;
  end if;

  if not (p_marker ? 'created_at')
    or jsonb_typeof(p_marker->'created_at') <> 'string'
    or char_length(trim(p_marker->>'created_at')) = 0 then
    return false;
  end if;

  if not (p_marker ? 'last_edited_at')
    or jsonb_typeof(p_marker->'last_edited_at') <> 'string'
    or char_length(trim(p_marker->>'last_edited_at')) = 0 then
    return false;
  end if;

  if p_marker ? 'created_by' and jsonb_typeof(p_marker->'created_by') not in ('string', 'null') then
    return false;
  end if;

  if p_marker ? 'last_edited_by' and jsonb_typeof(p_marker->'last_edited_by') not in ('string', 'null') then
    return false;
  end if;

  if p_marker ? 'image_b64' then
    if jsonb_typeof(p_marker->'image_b64') not in ('string', 'null') then
      return false;
    end if;

    if jsonb_typeof(p_marker->'image_b64') = 'string'
      and (p_marker->>'image_b64') !~ '^data:image/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$' then
      return false;
    end if;
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
