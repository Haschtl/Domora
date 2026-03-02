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

const normalizeRouteGeoJson = (raw: unknown): RouteGeoJson | null => {
  const asRecord = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  const root = asRecord(raw);
  if (!root) return null;
  const data = asRecord(root.data) ?? root;

  let featureCollection: { features: unknown[] } | null = null;
  if (data.type === "FeatureCollection" && Array.isArray(data.features)) {
    featureCollection = { features: data.features };
  } else if (data.type === "Feature" && data.geometry) {
    featureCollection = { features: [data] };
  } else if (Array.isArray(data.features)) {
    featureCollection = { features: data.features };
  } else if (Array.isArray(raw)) {
    featureCollection = { features: raw };
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
      return {
        type: "Feature" as const,
        properties: asRecord(feature.properties) ?? {},
        geometry: {
          type: geometryType,
          coordinates: geometry.coordinates as number[][] | number[][][]
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
  const maxMinutes = Number(payload.maxMinutes);

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
    || !Number.isFinite(maxMinutes)
    || maxMinutes < 1
    || maxMinutes > 240
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

  const maxEdgeWeight = Math.round(maxMinutes * 60);
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
    source: {
      id: "from",
      tm,
      w: { lat: fromLat, lng: fromLon }
    },
    targets: [
      {
        id: "to",
        w: { lat: toLat, lng: toLon }
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
        status: 502,
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
