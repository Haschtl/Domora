import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type PoiCategory = "restaurant" | "shop" | "supermarket" | "fuel";
type OverpassElement = {
  type?: "node" | "way" | "relation";
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const CATEGORY_CLAUSES: Record<PoiCategory, string[]> = {
  restaurant: ['["amenity"~"restaurant|fast_food|cafe|bar|pub"]'],
  shop: ['["shop"]'],
  supermarket: ['["shop"="supermarket"]'],
  fuel: ['["amenity"="fuel"]']
};

const deriveCategory = (tags: Record<string, string>): PoiCategory => {
  if (tags.amenity === "fuel") return "fuel";
  if (tags.shop === "supermarket") return "supermarket";
  if (typeof tags.shop === "string" && tags.shop.length > 0) return "shop";
  return "restaurant";
};

const normalizeCategories = (categories: unknown): PoiCategory[] => {
  const valid = new Set<PoiCategory>(["restaurant", "shop", "supermarket", "fuel"]);
  if (!Array.isArray(categories)) return ["restaurant", "shop", "supermarket", "fuel"];
  const deduplicated = categories
    .filter((entry): entry is PoiCategory => typeof entry === "string" && valid.has(entry as PoiCategory))
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .sort();
  return deduplicated.length > 0 ? deduplicated : ["restaurant", "shop", "supermarket", "fuel"];
};

const clampRadius = (radiusMeters: unknown) => {
  const parsed = Number(radiusMeters);
  if (!Number.isFinite(parsed)) return 1500;
  return Math.max(100, Math.min(5000, Math.round(parsed)));
};

const toCacheKey = (lat: number, lon: number, radiusMeters: number, categories: PoiCategory[]) => {
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLon = Math.round(lon * 1000) / 1000;
  const radiusBucket = Math.max(100, Math.round(radiusMeters / 100) * 100);
  return `v1:${roundedLat}:${roundedLon}:${radiusBucket}:${categories.join(",")}`;
};

const buildOverpassQuery = (lat: number, lon: number, radiusMeters: number, categories: PoiCategory[]) => {
  const clauses = categories.flatMap((category) => CATEGORY_CLAUSES[category] ?? []);
  const queryLines = clauses.flatMap((clause) => [
    `node${clause}(around:${radiusMeters},${lat},${lon});`,
    `way${clause}(around:${radiusMeters},${lat},${lon});`,
    `relation${clause}(around:${radiusMeters},${lat},${lon});`
  ]);
  return `
[out:json][timeout:25];
(
  ${queryLines.join("\n  ")}
);
out center 200;
`;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const overpassEndpoint = Deno.env.get("OVERPASS_ENDPOINT") ?? "https://overpass-api.de/api/interpreter";
  const cacheTtlSeconds = Math.max(300, Number(Deno.env.get("POI_CACHE_TTL_SECONDS") ?? 21600));
  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    return new Response("Missing Supabase env", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let payload: { householdId?: string; lat?: number; lon?: number; radiusMeters?: number; categories?: PoiCategory[] };
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const householdId = typeof payload.householdId === "string" ? payload.householdId : "";
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!householdId || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response("Invalid request payload", { status: 400, headers: corsHeaders });
  }

  const { data: membership, error: membershipError } = await userClient
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (membershipError || !membership) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  const radiusMeters = clampRadius(payload.radiusMeters);
  const categories = normalizeCategories(payload.categories);
  const cacheKey = toCacheKey(lat, lon, radiusMeters, categories);
  const nowIso = new Date().toISOString();

  const { data: cachedRow } = await serviceClient
    .from("poi_cache")
    .select("payload,expires_at")
    .eq("cache_key", cacheKey)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (cachedRow && Array.isArray((cachedRow as { payload?: unknown }).payload)) {
    const row = cachedRow as { payload: unknown[]; expires_at: string };
    return new Response(
      JSON.stringify({
        rows: row.payload,
        cached: true,
        expiresAt: row.expires_at
      }),
      {
        status: 200,
        headers: { "content-type": "application/json", ...corsHeaders }
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(overpassEndpoint, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: buildOverpassQuery(lat, lon, radiusMeters, categories),
      signal: controller.signal
    });
  } catch {
    clearTimeout(timeout);
    return new Response("Failed to reach Overpass", { status: 502, headers: corsHeaders });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return new Response(`Overpass error (${response.status})`, { status: 502, headers: corsHeaders });
  }

  const body = (await response.json()) as { elements?: OverpassElement[] };
  const elements = Array.isArray(body.elements) ? body.elements : [];
  const seen = new Set<string>();
  const rows = elements
    .map((element) => {
      const osmType = element.type;
      const osmId = Number(element.id);
      if (!osmType || !Number.isFinite(osmId)) return null;
      const latValue = Number(element.lat ?? element.center?.lat);
      const lonValue = Number(element.lon ?? element.center?.lon);
      if (!Number.isFinite(latValue) || !Number.isFinite(lonValue)) return null;
      const tags = element.tags ?? {};
      const category = deriveCategory(tags);
      if (!categories.includes(category)) return null;
      const dedupeKey = `${osmType}:${osmId}`;
      if (seen.has(dedupeKey)) return null;
      seen.add(dedupeKey);
      return {
        id: dedupeKey,
        source: "overpass" as const,
        osm_type: osmType,
        osm_id: osmId,
        lat: latValue,
        lon: lonValue,
        name: (tags.name ?? tags.brand ?? null) as string | null,
        category,
        tags
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .slice(0, 200);

  const expiresAt = new Date(Date.now() + cacheTtlSeconds * 1000).toISOString();
  await serviceClient.from("poi_cache").upsert(
    {
      cache_key: cacheKey,
      payload: rows,
      fetched_at: nowIso,
      expires_at: expiresAt
    },
    { onConflict: "cache_key" }
  );
  await serviceClient.from("poi_cache").delete().lt("expires_at", nowIso);

  return new Response(
    JSON.stringify({
      rows,
      cached: false,
      expiresAt
    }),
    {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders }
    }
  );
});
