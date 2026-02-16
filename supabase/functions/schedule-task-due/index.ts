import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!supabaseUrl || !supabaseServiceKey || !cronSecret) {
    return new Response("Missing env", { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id,household_id,title,due_at,last_due_notification_at,assignee_id,done,is_active")
    .eq("done", false)
    .eq("is_active", true)
    .lte("due_at", now.toISOString());

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  let scheduled = 0;
  for (const task of tasks ?? []) {
    const lastNotified = task.last_due_notification_at ? new Date(task.last_due_notification_at) : null;
    if (lastNotified && lastNotified.toISOString() > threeDaysAgo) {
      continue;
    }

    const dedupeKey = `task_due:${task.id}:${now.toISOString().slice(0, 10)}`;
    const { error: insertError } = await supabase.from("push_jobs").insert({
      type: "task_due",
      household_id: task.household_id,
      user_id: task.assignee_id,
      payload: {
        title: task.title,
        taskId: task.id,
        dueAt: task.due_at,
        actor_user_id: null
      },
      scheduled_for: now.toISOString(),
      dedupe_key: dedupeKey
    });

    if (insertError) {
      continue;
    }

    await supabase
      .from("tasks")
      .update({ last_due_notification_at: now.toISOString() })
      .eq("id", task.id);
    scheduled += 1;
  }

  return new Response(JSON.stringify({ scheduled }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
