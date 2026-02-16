import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderPayload = {
  taskId?: string;
  title?: string;
  body?: string;
  accessToken?: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
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

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let payload: ReminderPayload;
  try {
    payload = (await req.json()) as ReminderPayload;
  } catch {
    return new Response("Invalid payload", { status: 400, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const headerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const payloadToken = String(payload.accessToken ?? "").trim();
  const token = headerToken || payloadToken;
  const authDebug = {
    tag: "send-task-reminder:auth-debug",
    hasAuthHeader: Boolean(authHeader),
    authHeaderPrefix: authHeader ? authHeader.slice(0, 12) : null,
    hasHeaderToken: Boolean(headerToken),
    hasPayloadToken: Boolean(payloadToken),
    payloadKeys: Object.keys(payload ?? {}),
    contentLength: req.headers.get("content-length") ?? null,
    userAgent: req.headers.get("user-agent") ?? null
  };
  console.error(JSON.stringify(authDebug));
  if (!token) {
    console.error(
      JSON.stringify({
        tag: "send-task-reminder:unauthorized",
        reason: "missing-token"
      })
    );
    return new Response(JSON.stringify({ ok: false, error: "missing-token", debug: authDebug }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders }
    });
  }

  const { data: authData } = await supabase.auth.getUser(token);
  const user = authData?.user ?? null;
  if (!user) {
    console.error(
      JSON.stringify({
        tag: "send-task-reminder:unauthorized",
        reason: "invalid-user"
      })
    );
    return new Response(JSON.stringify({ ok: false, error: "invalid-user", debug: authDebug }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders }
    });
  }

  const taskId = String(payload.taskId ?? "").trim();
  if (!taskId) {
    return new Response("Missing taskId", { status: 400, headers: corsHeaders });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id,household_id,title,due_at,assignee_id,done,is_active")
    .eq("id", taskId)
    .maybeSingle();
  if (taskError || !task) {
    return new Response("Task not found", { status: 404, headers: corsHeaders });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", task.household_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return new Response("Forbidden", { status: 403, headers: corsHeaders });
  }

  if (!task.is_active || task.done || !task.assignee_id) {
    return new Response("Task not eligible", { status: 400, headers: corsHeaders });
  }

  const now = new Date();
  const dueAt = new Date(task.due_at);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() > now.getTime()) {
    return new Response("Task not due", { status: 400, headers: corsHeaders });
  }

  const title = String(payload.title ?? "").trim() || "Aufgabe fällig";
  const body = String(payload.body ?? "").trim() || task.title;

  const dedupeKey = `task_reminder:${task.id}:${task.assignee_id}:${now
    .toISOString()
    .slice(0, 16)}`;

  const { error: insertError } = await supabase.from("push_jobs").insert({
    type: "task_reminder",
    household_id: task.household_id,
    user_id: task.assignee_id,
    payload: {
      title,
      body,
      taskId: task.id,
      dueAt: task.due_at,
      actor_user_id: user.id,
      target_user_id: task.assignee_id
    },
    scheduled_for: now.toISOString(),
    dedupe_key: dedupeKey
  });

  if (insertError) {
    return new Response(insertError.message, { status: 500, headers: corsHeaders });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders }
  });
});
