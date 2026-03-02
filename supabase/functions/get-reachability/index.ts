import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type ReachabilityTravelMode = "walk" | "bike" | "car" | "transit";
type ReachabilityGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry: {
      type: "Polygon" | "MultiPolygon";
      coordinates: number[][][] | number[][][][];
    };
  }>;
};

const isValidTravelMode = (value: unknown): value is ReachabilityTravelMode =>
  value === "walk" || value === "bike" || value === "car" || value === "transit";

const buildReachabilityBandSeconds = (minutes: number) => {
  const safeMinutes = Math.max(1, Math.min(180, Math.round(minutes)));
  const rawBands = [
    Math.round(safeMinutes * 0.25),
    Math.round(safeMinutes * 0.5),
    Math.round(safeMinutes * 0.75),
    safeMinutes
  ];
  const uniqueMinutes = Array.from(
    new Set(rawBands.map((value) => Math.max(1, Math.min(safeMinutes, value))))
  ).sort((a, b) => a - b);
  return uniqueMinutes.map((value) => value * 60);
};

const normalizeGeoJson = (raw: unknown): ReachabilityGeoJson | null => {
  const asRecord = (value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

  const candidate = (() => {
    const root = asRecord(raw);
    if (!root) return null;
    const data = asRecord(root.data);
    if (data) return data;
    return root;
  })();
  if (!candidate) return null;

  let featureCollection: { type: string; features: unknown[] } | null = null;
  if (candidate.type === "FeatureCollection" && Array.isArray(candidate.features)) {
    featureCollection = { type: "FeatureCollection", features: candidate.features };
  } else if (candidate.type === "Feature" && candidate.geometry) {
    featureCollection = { type: "FeatureCollection", features: [candidate] };
  } else if (Array.isArray(candidate.features)) {
    featureCollection = { type: "FeatureCollection", features: candidate.features };
  } else if (Array.isArray(raw)) {
    featureCollection = { type: "FeatureCollection", features: raw };
  }
  if (!featureCollection) return null;

  const normalizedFeatures = featureCollection.features
    .map((entry) => {
      const feature = asRecord(entry);
      if (!feature) return null;
      const geometry = asRecord(feature.geometry);
      if (!geometry) return null;
      const geometryType = geometry.type;
      if (geometryType !== "Polygon" && geometryType !== "MultiPolygon") return null;
      const coordinates = geometry.coordinates;
      if (!Array.isArray(coordinates)) return null;
      return {
        type: "Feature" as const,
        properties: asRecord(feature.properties) ?? {},
        geometry: {
          type: geometryType,
          coordinates: coordinates as number[][][] | number[][][][]
        }
      };
    })
    .filter((entry): entry is ReachabilityGeoJson["features"][number] => entry !== null);

  if (normalizedFeatures.length === 0) return null;
  return {
    type: "FeatureCollection",
    features: normalizedFeatures
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
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  const minutes = Number(payload.minutes);
  const travelMode = payload.travelMode;
  if (
    !householdId
    || !Number.isFinite(lat)
    || !Number.isFinite(lon)
    || lat < -90
    || lat > 90
    || lon < -180
    || lon > 180
    || !Number.isFinite(minutes)
    || minutes < 1
    || minutes > 180
    || !isValidTravelMode(travelMode)
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

  const reachabilityBandSeconds = buildReachabilityBandSeconds(minutes);
  const maxSeconds = reachabilityBandSeconds[reachabilityBandSeconds.length - 1] ?? Math.round(minutes * 60);
  const now = new Date();
  const nowIso = now.toISOString();
  const tm = (() => {
    if (travelMode === "walk") return { walk: {} };
    if (travelMode === "bike") return { bike: {} };
    if (travelMode === "car") return { car: {} };
    return {
      transit: {
        frame: {
          time: nowIso,
          date: nowIso.slice(0, 10)
        },
        maxEdgeWeight: maxSeconds
      }
    };
  })();

  const requestBody = {
    sources: [
      {
        id: "origin",
        tm,
        lat,
        lng: lon
      }
    ],
    polygon: {
      serializer: "geojson",
      srid: 4326,
      values: reachabilityBandSeconds,
      intersectionMode: "union"
    }
  };

  const endpoint = `https://api.targomo.com/${encodeURIComponent(targomoRegion)}/v1/polygon_post?key=${encodeURIComponent(targomoKey)}`;
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

    const geojson = normalizeGeoJson(parsed);
    if (!geojson) {
      return new Response(JSON.stringify({ error: "No polygon data returned", details: parsed }), {
        status: 502,
        headers: { "content-type": "application/json", ...corsHeaders }
      });
    }

    if (geojson.features.length === reachabilityBandSeconds.length) {
      geojson.features = geojson.features.map((feature, index) => ({
        ...feature,
        properties: {
          ...(feature.properties ?? {}),
          domora_reachability_seconds: reachabilityBandSeconds[index],
          domora_reachability_minutes: Math.round((reachabilityBandSeconds[index] ?? 0) / 60)
        }
      }));
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
