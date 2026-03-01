import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderPayload = {
  taskId?: string;
  title?: string;
  body?: string;
  accessToken?: string;
};

type ReminderAction = {
  at: number;
  id: string;
  type: "completion" | "skipped";
  delay: number;
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
    supabaseUrl,
    requestHost: req.headers.get("host") ?? null,
    requestOrigin: req.headers.get("origin") ?? null,
    hasAuthHeader: Boolean(authHeader),
    authHeaderPrefix: authHeader ? authHeader.slice(0, 12) : null,
    hasHeaderToken: Boolean(headerToken),
    hasPayloadToken: Boolean(payloadToken),
    headerTokenPrefix: headerToken ? headerToken.slice(0, 16) : null,
    payloadTokenPrefix: payloadToken ? payloadToken.slice(0, 16) : null,
    tokenLength: token ? token.length : 0,
    payloadKeys: Object.keys(payload ?? {}),
    contentLength: req.headers.get("content-length") ?? null,
    userAgent: req.headers.get("user-agent") ?? null
  };
  const debugEnabled = Deno.env.get("DEBUG_SEND_TASK_REMINDER") === "true";
  if (debugEnabled) {
    console.log(JSON.stringify(authDebug));
  }
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

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError) {
    console.error(
      JSON.stringify({
        tag: "send-task-reminder:auth-error",
        message: authError.message,
        status: authError.status ?? null
      })
    );
  }
  const user = authData?.user ?? null;
  if (!user) {
    console.error(
      JSON.stringify({
        tag: "send-task-reminder:unauthorized",
        reason: "invalid-user"
      })
    );
    return new Response(
      JSON.stringify({
        ok: false,
        error: "invalid-user",
        authError: authError ? { message: authError.message, status: authError.status ?? null } : null,
        debug: authDebug
      }),
      {
        status: 401,
        headers: { "content-type": "application/json", ...corsHeaders }
      }
    );
  }

  const taskId = String(payload.taskId ?? "").trim();
  if (!taskId) {
    return new Response("Missing taskId", { status: 400, headers: corsHeaders });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id,household_id,title,due_at,assignee_id,done,is_active,grace_minutes,delay_penalty_per_day,ignore_delay_penalty_once")
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

  let streakToLose = 0;
  const [completionResult, skipResult] = await Promise.all([
    supabase
      .from("task_completions")
      .select("id,delay_minutes,completed_at")
      .eq("household_id", task.household_id)
      .eq("user_id", task.assignee_id)
      .order("completed_at", { ascending: false })
      .limit(200),
    supabase
      .from("household_events")
      .select("id,created_at")
      .eq("household_id", task.household_id)
      .eq("event_type", "task_skipped")
      .eq("actor_user_id", task.assignee_id)
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  if (!completionResult.error && !skipResult.error) {
    const completionActions: ReminderAction[] = (completionResult.data ?? []).map((entry) => ({
      at: new Date(String(entry.completed_at)).getTime(),
      id: String(entry.id),
      type: "completion",
      delay: Math.max(0, Number(entry.delay_minutes ?? 0))
    }));
    const skippedActions: ReminderAction[] = (skipResult.data ?? []).map((entry) => ({
      at: new Date(String(entry.created_at)).getTime(),
      id: String(entry.id),
      type: "skipped",
      delay: 1
    }));
    const actions = [...completionActions, ...skippedActions]
      .filter((entry) => Number.isFinite(entry.at))
      .sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
    for (const action of actions) {
      if (action.type !== "completion" || action.delay > 0) break;
      streakToLose += 1;
    }
  }

  const title = String(payload.title ?? "").trim() || "Aufgabe fällig";
  const body = String(payload.body ?? "").trim() || task.title;
  const graceMinutes = Math.max(0, Number(task.grace_minutes ?? 0));
  const dueAtMs = dueAt.getTime();
  const overdueMinutes = Math.max(0, Math.floor((now.getTime() - (dueAtMs + graceMinutes * 60_000)) / 60_000));
  const delayPenaltyPerDay = Math.max(0, Number(task.delay_penalty_per_day ?? 0));
  const penaltyActive = delayPenaltyPerDay > 0 && !task.ignore_delay_penalty_once;
  const lostPimpersRaw = penaltyActive ? delayPenaltyPerDay * (overdueMinutes / 1440) : 0;
  const lostPimpers = Number.isFinite(lostPimpersRaw) ? Number(lostPimpersRaw.toFixed(2)) : 0;

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
      streakToLose,
      lostPimpers,
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
