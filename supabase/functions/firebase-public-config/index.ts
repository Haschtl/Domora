import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type FirebaseClientConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  messagingSenderId: string;
  appId: string;
  storageBucket?: string;
  measurementId?: string;
};

type FirebasePublicConfigResponse = {
  firebase: FirebaseClientConfig;
  vapidKey: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const normalizeString = (value: string | null | undefined) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeFirebaseConfig = (
  value: Partial<FirebaseClientConfig> | null | undefined
): FirebaseClientConfig | null => {
  if (!value) return null;

  const apiKey = normalizeString(value.apiKey);
  const authDomain = normalizeString(value.authDomain);
  const projectId = normalizeString(value.projectId);
  const messagingSenderId = normalizeString(value.messagingSenderId);
  const appId = normalizeString(value.appId);
  if (!apiKey || !authDomain || !projectId || !messagingSenderId || !appId) {
    return null;
  }

  const storageBucket = normalizeString(value.storageBucket);
  const measurementId = normalizeString(value.measurementId);

  const normalized: FirebaseClientConfig = {
    apiKey,
    authDomain,
    projectId,
    messagingSenderId,
    appId
  };

  if (storageBucket) normalized.storageBucket = storageBucket;
  if (measurementId) normalized.measurementId = measurementId;
  return normalized;
};

const parseJsonConfigSecret = (): FirebasePublicConfigResponse | null => {
  const rawValue = normalizeString(Deno.env.get("FIREBASE_WEB_CONFIG_JSON"));
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as {
      firebase?: Partial<FirebaseClientConfig>;
      vapidKey?: string;
      apiKey?: string;
      authDomain?: string;
      projectId?: string;
      messagingSenderId?: string;
      appId?: string;
      storageBucket?: string;
      measurementId?: string;
    };

    const firebaseConfig = normalizeFirebaseConfig(
      parsed.firebase ?? {
        apiKey: parsed.apiKey,
        authDomain: parsed.authDomain,
        projectId: parsed.projectId,
        messagingSenderId: parsed.messagingSenderId,
        appId: parsed.appId,
        storageBucket: parsed.storageBucket,
        measurementId: parsed.measurementId
      }
    );
    const vapidKey = normalizeString(parsed.vapidKey);
    if (!firebaseConfig || !vapidKey) return null;

    return {
      firebase: firebaseConfig,
      vapidKey
    };
  } catch {
    return null;
  }
};

const readConfigFromDiscreteSecrets = (): FirebasePublicConfigResponse | null => {
  const firebaseConfig = normalizeFirebaseConfig({
    apiKey: Deno.env.get("FIREBASE_WEB_API_KEY") ?? undefined,
    authDomain: Deno.env.get("FIREBASE_WEB_AUTH_DOMAIN") ?? undefined,
    projectId: Deno.env.get("FIREBASE_WEB_PROJECT_ID") ?? undefined,
    messagingSenderId: Deno.env.get("FIREBASE_WEB_MESSAGING_SENDER_ID") ?? undefined,
    appId: Deno.env.get("FIREBASE_WEB_APP_ID") ?? undefined,
    storageBucket: Deno.env.get("FIREBASE_WEB_STORAGE_BUCKET") ?? undefined,
    measurementId: Deno.env.get("FIREBASE_WEB_MEASUREMENT_ID") ?? undefined
  });
  const vapidKey = normalizeString(Deno.env.get("FIREBASE_WEB_VAPID_KEY"));
  if (!firebaseConfig || !vapidKey) return null;

  return {
    firebase: firebaseConfig,
    vapidKey
  };
};

serve((req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders
    });
  }

  if (req.method !== "GET") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders
    });
  }

  const config = parseJsonConfigSecret() ?? readConfigFromDiscreteSecrets();
  if (!config) {
    return new Response("Firebase web config is not configured.", {
      status: 404,
      headers: corsHeaders
    });
  }

  return new Response(JSON.stringify(config), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=300",
      ...corsHeaders
    }
  });
});
