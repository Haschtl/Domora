import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ReminderPayload = {
  taskId?: string;
  title?: string;
  body?: string;
};

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Missing env", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }
  });

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: ReminderPayload;
  try {
    payload = (await req.json()) as ReminderPayload;
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const taskId = String(payload.taskId ?? "").trim();
  if (!taskId) {
    return new Response("Missing taskId", { status: 400 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id,household_id,title,due_at,assignee_id,done,is_active")
    .eq("id", taskId)
    .maybeSingle();
  if (taskError || !task) {
    return new Response("Task not found", { status: 404 });
  }

  const { data: membership } = await supabase
    .from("household_members")
    .select("user_id")
    .eq("household_id", task.household_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!task.is_active || task.done || !task.assignee_id) {
    return new Response("Task not eligible", { status: 400 });
  }

  const now = new Date();
  const dueAt = new Date(task.due_at);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() > now.getTime()) {
    return new Response("Task not due", { status: 400 });
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
    return new Response(insertError.message, { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
