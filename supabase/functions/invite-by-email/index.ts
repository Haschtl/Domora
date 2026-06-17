import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const normalizePublicOrigin = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return null;
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Missing env", { status: 500, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }
  const callerToken = authHeader.slice(7).trim();

  let body: { email?: unknown; household_id?: unknown; app_origin?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : null;
  const householdId = typeof body.household_id === "string" ? body.household_id.trim() : null;
  const appOrigin = typeof body.app_origin === "string" ? body.app_origin.trim() : null;
  const fallbackAppOrigin =
    normalizePublicOrigin(Deno.env.get("PUBLIC_APP_ORIGIN"))
    ?? normalizePublicOrigin(Deno.env.get("APP_ORIGIN"));
  const resolvedAppOrigin = normalizePublicOrigin(appOrigin) ?? fallbackAppOrigin;

  if (!email || !householdId || !resolvedAppOrigin) {
    return new Response("Missing email, household_id or valid public app origin", { status: 400, headers: corsHeaders });
  }

  // Use service-role client to perform admin operations
  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Verify the caller's identity using their token
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(callerToken);
  if (callerError || !callerData.user) {
    return new Response("Invalid token", { status: 401, headers: corsHeaders });
  }
  const callerUserId = callerData.user.id;

  // Verify caller is a member of the household
  const { data: memberRow, error: memberError } = await adminClient
    .from("household_members")
    .select("role")
    .eq("household_id", householdId)
    .eq("user_id", callerUserId)
    .maybeSingle();

  if (memberError || !memberRow) {
    return new Response("Not a member of this household", { status: 403, headers: corsHeaders });
  }

  // Get the household's invite code
  const { data: householdRow, error: householdError } = await adminClient
    .from("households")
    .select("invite_code")
    .eq("id", householdId)
    .single();

  if (householdError || !householdRow) {
    return new Response("Household not found", { status: 404, headers: corsHeaders });
  }

  const inviteCode = (householdRow as { invite_code: string }).invite_code;
  const redirectTo = `${resolvedAppOrigin}/?invite=${encodeURIComponent(inviteCode)}`;

  const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo
  });

  if (inviteError) {
    return new Response(JSON.stringify({ error: inviteError.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
