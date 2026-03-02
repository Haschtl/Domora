import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type RouteTravelMode = "walk" | "bike" | "car" | "transit";
type RouteGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry: {
      type: "LineString" | "MultiLineString";
      coordinates: number[][] | number[][][];
    };
  }>;
};

const isValidTravelMode = (value: unknown): value is RouteTravelMode =>
  value === "walk" || value === "bike" || value === "car" || value === "transit";

const defaultMaxMinutesByMode = (mode: RouteTravelMode) => {
  switch (mode) {
    case "walk":
      return 200;
    case "bike":
      return 650;
    case "car":
      return 850;
    case "transit":
      return 500;
    default:
      return 450;
  }
};

const WEB_MERCATOR_RADIUS = 6378137;

const mercatorToWgs84 = (x: number, y: number): [number, number] => {
  const lon = (x / WEB_MERCATOR_RADIUS) * (180 / Math.PI);
  const lat =
    (2 * Math.atan(Math.exp(y / WEB_MERCATOR_RADIUS)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
};

const normalizeRouteGeoJson = (raw: unknown): RouteGeoJson | null => {
  const asRecord = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const asCoordinate = (value: unknown): [number, number] | null => {
    if (!Array.isArray(value) || value.length < 2) return null;
    const x = Number(value[0]);
    const y = Number(value[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [x, y];
  };

  const root = asRecord(raw);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;

  let featureCollection: { features: unknown[]; usesWebMercator: boolean } | null = null;
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    const crsName = asRecord(asRecord(data.crs)?.properties)?.name;
    featureCollection = {
      features: data.features,
      usesWebMercator: typeof crsName === "string" && crsName.includes("3857")
    };
  } else if (data.type === "Feature" && data.geometry) {
    featureCollection = { features: [data], usesWebMercator: false };
  } else if (Array.isArray(data.features)) {
    featureCollection = { features: data.features, usesWebMercator: false };
  } else if (Array.isArray(data.routes) && data.routes.length > 0) {
    const routeCollections = data.routes
      .map((entry) => asRecord(entry))
      .filter((entry): entry is Record<string, unknown> => entry !== null)
      .filter((entry) => Array.isArray(entry.features));
    if (routeCollections.length > 0) {
      const first = routeCollections[0]!;
      const crsName = asRecord(asRecord(first.crs)?.properties)?.name;
      const mergedFeatures = routeCollections.flatMap((entry) =>
        Array.isArray(entry.features) ? entry.features : []
      );
      featureCollection = {
        features: mergedFeatures,
        usesWebMercator: typeof crsName === "string" && crsName.includes("3857")
      };
    }
  } else if (Array.isArray(raw)) {
    featureCollection = { features: raw, usesWebMercator: false };
  }
  if (!featureCollection) return null;

  const features = featureCollection.features
    .map((entry) => {
      const feature = asRecord(entry);
      if (!feature) return null;
      const geometry = asRecord(feature.geometry);
      if (!geometry) return null;
      const geometryType = geometry.type;
      if (geometryType !== "LineString" && geometryType !== "MultiLineString") return null;
      if (!Array.isArray(geometry.coordinates)) return null;

      const mapCoordinate = (tuple: unknown): [number, number] | null => {
        const value = asCoordinate(tuple);
        if (!value) return null;
        if (featureCollection.usesWebMercator) {
          return mercatorToWgs84(value[0], value[1]);
        }
        return value;
      };

      let normalizedCoordinates: number[][] | number[][][] | null = null;
      if (geometryType === "LineString") {
        const line = geometry.coordinates
          .map((tuple) => mapCoordinate(tuple))
          .filter((tuple): tuple is [number, number] => tuple !== null)
          .map((tuple) => [tuple[0], tuple[1]]);
        if (line.length < 2) return null;
        normalizedCoordinates = line;
      } else {
        const lines = geometry.coordinates
          .map((line) =>
            Array.isArray(line)
              ? line
                .map((tuple) => mapCoordinate(tuple))
                .filter((tuple): tuple is [number, number] => tuple !== null)
                .map((tuple) => [tuple[0], tuple[1]])
              : []
          )
          .filter((line) => line.length >= 2);
        if (lines.length === 0) return null;
        normalizedCoordinates = lines;
      }

      return {
        type: "Feature" as const,
        properties: asRecord(feature.properties) ?? {},
        geometry: {
          type: geometryType,
          coordinates: normalizedCoordinates
        }
      };
    })
    .filter((entry): entry is RouteGeoJson["features"][number] => entry !== null);

  if (features.length === 0) return null;
  return {
    type: "FeatureCollection",
    features
  };
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
  const targomoKey = Deno.env.get("TARGOMO_API_KEY");
  const targomoRegion = Deno.env.get("TARGOMO_REGION") ?? "westcentraleurope";
  if (!supabaseUrl || !supabaseAnonKey || !targomoKey) {
    return new Response("Missing env", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const householdId = typeof payload.householdId === "string" ? payload.householdId : "";
  const fromLat = Number(payload.fromLat);
  const fromLon = Number(payload.fromLon);
  const toLat = Number(payload.toLat);
  const toLon = Number(payload.toLon);
  const travelMode = payload.travelMode;
  const maxMinutesRaw = payload.maxMinutes;
  const parsedMaxMinutes =
    maxMinutesRaw === null
    || typeof maxMinutesRaw === "undefined"
    || (typeof maxMinutesRaw === "string" && maxMinutesRaw.trim().length === 0)
      ? null
      : Number(maxMinutesRaw);

  if (
    !householdId
    || !Number.isFinite(fromLat)
    || !Number.isFinite(fromLon)
    || !Number.isFinite(toLat)
    || !Number.isFinite(toLon)
    || fromLat < -90
    || fromLat > 90
    || toLat < -90
    || toLat > 90
    || fromLon < -180
    || fromLon > 180
    || toLon < -180
    || toLon > 180
    || !isValidTravelMode(travelMode)
    || (
      parsedMaxMinutes !== null
      && (
        !Number.isFinite(parsedMaxMinutes)
        || parsedMaxMinutes < 1
        || parsedMaxMinutes > 240
      )
    )
  ) {
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

  const resolvedMaxMinutes = parsedMaxMinutes === null
    ? defaultMaxMinutesByMode(travelMode)
    : parsedMaxMinutes;
  const maxEdgeWeight = Math.round(resolvedMaxMinutes * 60);
  const now = new Date();
  const nowIso = now.toISOString();

  const tm = (() => {
    if (travelMode === "walk") return { walk: { maxEdgeWeight } };
    if (travelMode === "bike") return { bike: { maxEdgeWeight } };
    if (travelMode === "car") return { car: { maxEdgeWeight } };
    return {
      transit: {
        frame: {
          time: nowIso,
          date: nowIso.slice(0, 10)
        },
        maxEdgeWeight
      }
    };
  })();

  const requestBody = {
    sources: [
      {
        id: "from",
        tm,
        lat: fromLat,
        lng: fromLon
      }
    ],
    targets: [
      {
        id: "to",
        lat: toLat,
        lng: toLon
      }
    ],
    pathSerializer: "geojson"
  };

  const endpoint = `https://api.targomo.com/${encodeURIComponent(targomoRegion)}/v1/route?key=${encodeURIComponent(targomoKey)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const rawText = await response.text();
    let parsed: unknown = null;
    try {
      parsed = rawText ? JSON.parse(rawText) : null;
    } catch {
      parsed = { raw: rawText };
    }
    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Targomo request failed", details: parsed }), {
        status: Math.max(400, Math.min(599, response.status || 502)),
        headers: { "content-type": "application/json", ...corsHeaders }
      });
    }

    const geojson = normalizeRouteGeoJson(parsed);
    if (!geojson) {
      return new Response(JSON.stringify({ error: "No route data returned", details: parsed }), {
        status: 502,
        headers: { "content-type": "application/json", ...corsHeaders }
      });
    }

    return new Response(JSON.stringify({ geojson }), {
      status: 200,
      headers: { "content-type": "application/json", ...corsHeaders }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 502,
      headers: { "content-type": "application/json", ...corsHeaders }
    });
  } finally {
    clearTimeout(timeout);
  }
});
