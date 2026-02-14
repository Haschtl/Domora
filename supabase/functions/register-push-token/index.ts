import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RegisterRequest = {
  token: string;
  deviceId: string;
  householdId: string;
  platform?: "web" | "android" | "ios";
  provider?: "fcm" | "webpush" | "apns";
  appVersion?: string;
  locale?: string;
  timezone?: string;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: RegisterRequest;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!payload?.token || !payload?.deviceId || !payload?.householdId) {
    return new Response("Missing fields", { status: 400 });
  }

  const platform = payload.platform ?? "web";
  const provider = payload.provider ?? "fcm";

  const { error } = await supabase
    .from("push_tokens")
    .upsert(
      {
        user_id: authData.user.id,
        household_id: payload.householdId,
        token: payload.token,
        device_id: payload.deviceId,
        platform,
        provider,
        app_version: payload.appVersion ?? null,
        locale: payload.locale ?? null,
        timezone: payload.timezone ?? null,
        status: "active",
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "user_id,device_id,provider" }
    );

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
