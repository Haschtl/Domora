import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendFcmMessage } from "../_shared/fcm.ts";

type PushJob = {
  id: string;
  type: string;
  household_id: string;
  user_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
};

const parseTimeToMinutes = (value?: string) => {
  if (!value) return null;
  const parts = value.split(":");
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Math.min(23, Math.max(0, hours)) * 60 + Math.min(59, Math.max(0, minutes));
};

const isWithinQuietHours = (
  now: Date,
  quiet: { start?: string; end?: string; offsetMinutes?: number } | null
) => {
  if (!quiet?.start || !quiet?.end) return { active: false, nextAllowedAt: null as Date | null };
  const startMin = parseTimeToMinutes(quiet.start);
  const endMin = parseTimeToMinutes(quiet.end);
  if (startMin === null || endMin === null) return { active: false, nextAllowedAt: null };
  const offset = Number(quiet.offsetMinutes ?? 0);
  const localMs = now.getTime() + offset * 60_000;
  const local = new Date(localMs);
  const localMinutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const spansMidnight = startMin > endMin;
  const active = spansMidnight
    ? localMinutes >= startMin || localMinutes < endMin
    : localMinutes >= startMin && localMinutes < endMin;
  if (!active) return { active: false, nextAllowedAt: null };

  const localEnd = new Date(localMs);
  if (spansMidnight && localMinutes >= startMin) {
    localEnd.setUTCDate(localEnd.getUTCDate() + 1);
  }
  localEnd.setUTCHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
  const nextAllowedAt = new Date(localEnd.getTime() - offset * 60_000);
  return { active: true, nextAllowedAt };
};

const buildMessage = (job: PushJob) => {
  const payload = job.payload ?? {};
  const event = String(payload.event ?? job.type);
  const base = {
    title: "WG Update",
    body: "Neue Aktivität",
    data: {
      type: event
    } as Record<string, string>
  };

  if (event === "finance_created") {
    base.title = "Neuer Finanzeintrag";
    base.body = String(payload.payload?.description ?? "Ein neuer Eintrag wurde erstellt.");
  } else if (event === "task_completed") {
    base.title = "Aufgabe erledigt";
    base.body = String(payload.payload?.title ?? "Eine Aufgabe wurde abgeschlossen.");
  } else if (event === "task_skipped") {
    base.title = "Aufgabe übersprungen";
    base.body = String(payload.payload?.title ?? "Eine Aufgabe wurde übersprungen.");
  } else if (event === "task_taken_over") {
    base.title = "Aufgabe übernommen";
    base.body = String(payload.title ?? payload.payload?.title ?? "Eine Aufgabe wurde übernommen.");
  } else if (event === "shopping_completed") {
    base.title = "Einkauf erledigt";
    base.body = String(payload.payload?.title ?? "Ein Einkauf wurde abgehakt.");
  } else if (event === "shopping_added") {
    base.title = "Einkaufsliste";
    base.body = String(payload.title ?? "Neuer Eintrag auf der Einkaufsliste.");
  } else if (event === "cash_audit_requested") {
    base.title = "Kassensturz";
    base.body = "Ein Kassensturz wurde gestartet.";
  } else if (event === "bucket_added") {
    base.title = "Bucketlist";
    base.body = String(payload.title ?? "Neuer Bucketlist-Eintrag.");
  } else if (event === "task_due") {
    base.title = "Aufgabe fällig";
    base.body = String(payload.title ?? "Eine Aufgabe ist fällig.");
  } else if (event === "task_reminder") {
    base.title = String(payload.title ?? "Erinnerung");
    base.body = String(payload.body ?? "Eine Aufgabe wartet.");
  } else if (event === "member_of_month") {
    base.title = String(payload.title ?? "Mitbewohner:in des Monats");
    base.body = String(payload.body ?? "Neue Auszeichnung in der WG.");
  } else if (event === "vacation_mode_enabled") {
    base.title = "Urlaubsmodus aktiviert";
    const name = String(payload.payload?.name ?? "Jemand");
    base.body = `${name} ist jetzt im Urlaub.`;
  } else if (event === "vacation_mode_disabled") {
    base.title = "Urlaubsmodus beendet";
    const name = String(payload.payload?.name ?? "Jemand");
    base.body = `${name} ist wieder da.`;
  }

  const dataPayload = payload.payload ?? payload;
  if (dataPayload?.taskId) base.data.taskId = String(dataPayload.taskId);
  if (dataPayload?.financeEntryId) base.data.financeEntryId = String(dataPayload.financeEntryId);
  if (dataPayload?.shoppingItemId) base.data.shoppingItemId = String(dataPayload.shoppingItemId);
  if (dataPayload?.bucketItemId) base.data.bucketItemId = String(dataPayload.bucketItemId);

  return base;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const fcmServiceAccount = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const fcmProjectId = Deno.env.get("FCM_PROJECT_ID");

  if (!supabaseUrl || !supabaseServiceKey || !fcmServiceAccount || !fcmProjectId) {
    return new Response("Missing env", { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const serviceAccount = JSON.parse(fcmServiceAccount);

  const now = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from("push_jobs")
    .select("id,type,household_id,user_id,payload,attempts")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .order("scheduled_for", { ascending: true })
    .limit(50);

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  let processed = 0;
  for (const job of (jobs ?? []) as PushJob[]) {
    const { error: lockError } = await supabase
      .from("push_jobs")
      .update({ status: "processing" })
      .eq("id", job.id)
      .eq("status", "pending");
    if (lockError) continue;

    const payload = job.payload ?? {};
    const eventType = String(payload.event ?? job.type);
    const topicType = eventType.startsWith("vacation_mode_") ? "vacation_mode" : eventType;
    const actorUserId = String(job.payload?.actor_user_id ?? job.user_id ?? "");
    const { data: members } = await supabase
      .from("household_members")
      .select("user_id")
      .eq("household_id", job.household_id);
    const allUserIds = (members ?? [])
      .map((entry) => String(entry.user_id))
      .filter((userId) => (eventType === "task_skipped" ? true : userId !== actorUserId));
    const explicitTarget = payload.target_user_id ? String(payload.target_user_id) : null;
    const targetScope = explicitTarget ? [explicitTarget] : allUserIds;
    const householdUserIds = new Set((members ?? []).map((entry) => String(entry.user_id)));
    const targetUserIds = targetScope.filter((userId) => householdUserIds.has(userId));

    if (targetUserIds.length === 0) {
      await supabase.from("push_jobs").update({ status: "sent" }).eq("id", job.id);
      processed += 1;
      continue;
    }

    const { data: prefs } = await supabase
      .from("push_preferences")
      .select("user_id,enabled,topics,quiet_hours")
      .eq("household_id", job.household_id)
      .in("user_id", targetUserIds);
    const prefByUser = new Map(
      (prefs ?? []).map((p) => [String(p.user_id), p as { user_id: string; enabled: boolean; topics?: string[]; quiet_hours?: Record<string, unknown> }])
    );
    const quietUsers: Array<{ userId: string; nextAllowedAt: Date }> = [];
    const filteredTargetUserIds = targetUserIds.filter((userId) => {
      const pref = prefByUser.get(userId);
      if (pref && pref.enabled === false) return false;
      const topics = Array.isArray(pref?.topics) ? pref?.topics ?? [] : [];
      if (topics.length > 0 && !topics.includes(topicType)) return false;
      const quiet = isWithinQuietHours(new Date(), pref?.quiet_hours as { start?: string; end?: string; offsetMinutes?: number } | null);
      if (quiet.active && quiet.nextAllowedAt) {
        quietUsers.push({ userId, nextAllowedAt: quiet.nextAllowedAt });
        return false;
      }
      return true;
    });

    if (filteredTargetUserIds.length === 0) {
      if (quietUsers.length > 0) {
        const nextAt = quietUsers
          .map((entry) => entry.nextAllowedAt.getTime())
          .reduce((min, value) => Math.min(min, value), quietUsers[0].nextAllowedAt.getTime());
        await supabase
          .from("push_jobs")
          .update({ status: "pending", scheduled_for: new Date(nextAt).toISOString() })
          .eq("id", job.id);
      } else {
        await supabase.from("push_jobs").update({ status: "sent" }).eq("id", job.id);
      }
      processed += 1;
      continue;
    }

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("id,user_id,token")
      .eq("household_id", job.household_id)
      .eq("status", "active")
      .in("user_id", filteredTargetUserIds);

    const message = buildMessage(job);
    let successCount = 0;

    for (const tokenRow of (tokens ?? []) as PushTokenRow[]) {
      const result = await sendFcmMessage({
        serviceAccount,
        projectId: fcmProjectId,
        token: tokenRow.token,
        title: message.title,
        body: message.body,
        data: message.data
      });

      await supabase.from("push_log").insert({
        job_id: job.id,
        token_id: tokenRow.id,
        status: result.ok ? "sent" : "failed",
        provider_response: result.body ?? {}
      });

      if (result.ok) {
        successCount += 1;
      } else {
        const errorCode = (result.body as { error?: { details?: Array<{ errorCode?: string }> } })?.error?.details?.[0]?.errorCode;
        if (errorCode === "UNREGISTERED") {
          await supabase.from("push_tokens").update({ status: "invalid" }).eq("id", tokenRow.id);
        }
      }
    }

    await supabase
      .from("push_jobs")
      .update({
        status: successCount > 0 ? "sent" : "failed",
        attempts: job.attempts + 1,
        last_error: successCount > 0 ? null : "All tokens failed"
      })
      .eq("id", job.id);

    processed += 1;
  }

  return new Response(JSON.stringify({ processed }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
});
