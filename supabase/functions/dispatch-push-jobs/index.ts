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
  created_at: string;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
  device_id: string;
  platform: string;
  provider: string;
  app_version: string | null;
  locale: string | null;
  last_seen_at: string;
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
      type: event,
      householdId: job.household_id
    } as Record<string, string>
  };
  const getRentContractsNotificationBody = () => {
    if (!job.user_id) return null;
    const beforeMap =
      payload.payload && typeof payload.payload === "object" && typeof payload.payload.memberTotalsBefore === "object"
        ? (payload.payload.memberTotalsBefore as Record<string, unknown>)
        : null;
    const afterMap =
      payload.payload && typeof payload.payload === "object" && typeof payload.payload.memberTotalsAfter === "object"
        ? (payload.payload.memberTotalsAfter as Record<string, unknown>)
        : null;
    const beforeValue = beforeMap ? Number(beforeMap[job.user_id] ?? Number.NaN) : Number.NaN;
    const afterValue = afterMap ? Number(afterMap[job.user_id] ?? Number.NaN) : Number.NaN;
    if (!Number.isFinite(afterValue)) return null;
    if (Number.isFinite(beforeValue) && Math.abs(afterValue - beforeValue) < 0.004) return null;
    const currency = String(payload.payload?.currency ?? "EUR");
    const formatted = new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(afterValue);
    return `Du zahlst jetzt ${formatted} für Miete und Verträge. Pass deinen Dauerauftrag an.`;
  };

  if (event === "finance_created") {
    base.title = "Neuer Finanzeintrag";
    base.body = String(payload.payload?.description ?? "Ein neuer Eintrag wurde erstellt.");
  } else if (event === "task_completed") {
    base.title = "Aufgabe erledigt";
    const actorName = String(payload.payload?.actorName ?? "Jemand");
    const taskTitle = String(payload.payload?.title ?? "Unbekannt");
    const delayMinutes = Number(payload.payload?.delayMinutes ?? 0);
    const pimpersEarnedRaw = Number(payload.payload?.pimpersEarned ?? 0);
    const delayDays = delayMinutes > 0 ? Math.max(1, Math.ceil(delayMinutes / 1440)) : 0;
    const delayPart =
      delayDays <= 0
        ? "pünktlich"
        : delayDays === 1
          ? "mit 1 Tag Verzögerung"
          : `mit ${delayDays} Tagen Verzögerung`;
    const pimpersLabel = Number.isInteger(pimpersEarnedRaw)
      ? `${pimpersEarnedRaw}`
      : pimpersEarnedRaw.toFixed(2).replace(".", ",");
    base.body = `${actorName} hat Aufgabe "${taskTitle}" ${delayPart} erledigt und dafür ${pimpersLabel} Pimpers erhalten.`;
  } else if (event === "task_skipped") {
    base.title = "Aufgabe übersprungen";
    base.body = String(payload.payload?.title ?? "Eine Aufgabe wurde übersprungen.");
  } else if (event === "task_taken_over") {
    base.title = "Aufgabe übernommen";
    base.body = String(payload.title ?? payload.payload?.title ?? "Eine Aufgabe wurde übernommen.");
  } else if (event === "task_rated") {
    base.title = "Bewertung erhalten";
    const title = String(payload.payload?.title ?? "Eine Aufgabe");
    const rating = payload.payload?.rating != null ? `${payload.payload?.rating}` : "eine";
    const rater = String(payload.payload?.rater_name ?? "Jemand");
    base.body = `${rater} hat ${title} mit ${rating} Sternen bewertet.`;
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
    const taskTitle = String(payload.title ?? "Eine Aufgabe").trim() || "Eine Aufgabe";
    const overdueDaysRaw = Number(payload.overdueDays ?? 0);
    const overdueDays = Number.isFinite(overdueDaysRaw) ? Math.max(0, Math.floor(overdueDaysRaw)) : 0;
    if (overdueDays >= 1) {
      base.title = "Aufgabe überfällig";
      base.body =
        overdueDays === 1
          ? `${taskTitle} ist seit 1 Tag überfällig.`
          : `${taskTitle} ist seit ${overdueDays} Tagen überfällig.`;
    } else {
      base.title = "Aufgabe fällig";
      base.body = `${taskTitle} ist fällig.`;
    }
  } else if (event === "task_reminder") {
    base.title = String(payload.title ?? "Erinnerung");
    const reminderBody = String(payload.body ?? "Eine Aufgabe wartet.");
    const streakToLose = Number(payload.streakToLose ?? payload.payload?.streakToLose ?? 0);
    const lostPimpersRaw = Number(payload.lostPimpers ?? payload.payload?.lostPimpers ?? 0);
    const hasLostPimpers = Number.isFinite(lostPimpersRaw) && lostPimpersRaw > 0;
    const lostPimpersLabel = Number.isInteger(lostPimpersRaw)
      ? `${lostPimpersRaw}`
      : lostPimpersRaw.toFixed(2).replace(".", ",");
    if (Number.isFinite(streakToLose) && streakToLose >= 1) {
      const streakLabel = streakToLose === 1 ? "1er-Serie" : `${Math.floor(streakToLose)}er-Serie`;
      base.body = `${reminderBody} Wenn du sie nicht pünktlich erledigst, verlierst du deine ${streakLabel}.`;
    } else {
      base.body = reminderBody;
    }
    if (hasLostPimpers) {
      base.body = `${base.body} du hast bereits ${lostPimpersLabel} Pimpers verloren, beeilung!`;
    }
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
  } else if (event === "member_joined") {
    base.title = "Einzug";
    const name = String(payload.payload?.name ?? "Jemand");
    base.body = `${name} ist eingezogen.`;
  } else if (event === "member_left") {
    base.title = "Auszug";
    const name = String(payload.payload?.name ?? "Jemand");
    base.body = `${name} ist ausgezogen.`;
  } else if (event === "live_location_started") {
    base.title = "Live-Standort gestartet";
    const name = String(payload.payload?.actorName ?? "Jemand");
    const durationMinutes = Number(payload.payload?.durationMinutes ?? 0);
    const durationText =
      Number.isFinite(durationMinutes) && durationMinutes > 0
        ? ` für ${Math.floor(durationMinutes)} Minuten`
        : "";
    base.body = `${name} teilt den Live-Standort${durationText}.`;
  } else if (event === "one_off_claim_created") {
    base.title = "Neue Einmalige Aufgabe";
    const title = String(payload.payload?.title ?? "Neue Aufgabe");
    const requested = Number(payload.payload?.requestedPimpers ?? 0);
    const requestedLabel = Number.isFinite(requested) && requested > 0 ? `${Math.floor(requested)} P` : "";
    base.body = requestedLabel ? `${title} (${requestedLabel})` : title;
  } else if (event === "rent_updated") {
    const personalizedBody = getRentContractsNotificationBody();
    if (!personalizedBody) return null;
    base.title = "Miete & Verträge geändert";
    base.body = personalizedBody;
  } else if (event === "contract_created") {
    const personalizedBody = getRentContractsNotificationBody();
    if (!personalizedBody) return null;
    base.title = "Miete & Verträge geändert";
    base.body = personalizedBody;
  } else if (event === "contract_updated") {
    const personalizedBody = getRentContractsNotificationBody();
    if (!personalizedBody) return null;
    base.title = "Miete & Verträge geändert";
    base.body = personalizedBody;
  } else if (event === "contract_deleted") {
    const personalizedBody = getRentContractsNotificationBody();
    if (!personalizedBody) return null;
    base.title = "Miete & Verträge geändert";
    base.body = personalizedBody;
  }

  const dataPayload = payload.payload ?? payload;
  if (job.user_id) base.data.actorUserId = String(job.user_id);
  if (dataPayload?.taskId) base.data.taskId = String(dataPayload.taskId);
  if (dataPayload?.claimId) base.data.claimId = String(dataPayload.claimId);
  if (dataPayload?.requestedPimpers) base.data.requestedPimpers = String(dataPayload.requestedPimpers);
  if (dataPayload?.financeEntryId) base.data.financeEntryId = String(dataPayload.financeEntryId);
  if (dataPayload?.shoppingItemId) base.data.shoppingItemId = String(dataPayload.shoppingItemId);
  if (dataPayload?.bucketItemId) base.data.bucketItemId = String(dataPayload.bucketItemId);

  return base;
};

const extractFcmError = (body: Record<string, unknown>) => {
  const error = body.error as Record<string, unknown> | undefined;
  const details = Array.isArray(error?.details) ? error.details : [];
  const detail = details.find((entry) => entry && typeof entry === "object") as Record<string, unknown> | undefined;
  return {
    status: typeof error?.status === "string" ? error.status : null,
    message: typeof error?.message === "string" ? error.message : null,
    errorCode: typeof detail?.errorCode === "string" ? detail.errorCode : null
  };
};

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const fcmServiceAccount = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  const fcmProjectId = Deno.env.get("FCM_PROJECT_ID");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!supabaseUrl || !supabaseServiceKey || !fcmServiceAccount || !fcmProjectId || !cronSecret) {
    return new Response("Missing env", { status: 500 });
  }
  if (req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const serviceAccount = JSON.parse(fcmServiceAccount);

  const now = new Date().toISOString();
  const { data: jobs, error } = await supabase
    .from("push_jobs")
    .select("id,type,household_id,user_id,payload,attempts,created_at")
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
    const isPushTest = payload.push_test === true || payload.push_test === "true";
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
      if (isPushTest) {
        await supabase.from("push_log").insert({
          job_id: job.id,
          token_id: null,
          status: "failed",
          provider_response: {
            reason: "no_target_users",
            eventType,
            explicitTarget
          }
        });
        await supabase
          .from("push_jobs")
          .update({ status: "failed", attempts: job.attempts + 1, last_error: "No target users resolved" })
          .eq("id", job.id);
      } else {
        await supabase.from("push_jobs").update({ status: "sent" }).eq("id", job.id);
      }
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
    const filteredTargetUserIds = isPushTest
      ? targetUserIds
      : targetUserIds.filter((userId) => {
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
      } else if (isPushTest) {
        await supabase.from("push_log").insert({
          job_id: job.id,
          token_id: null,
          status: "failed",
          provider_response: {
            reason: "all_targets_filtered",
            eventType,
            topicType
          }
        });
        await supabase
          .from("push_jobs")
          .update({ status: "failed", attempts: job.attempts + 1, last_error: "All targets were filtered before dispatch" })
          .eq("id", job.id);
      } else {
        await supabase.from("push_jobs").update({ status: "sent" }).eq("id", job.id);
      }
      processed += 1;
      continue;
    }

    let tokensQuery = supabase
      .from("push_tokens")
      .select("id,user_id,token,device_id,platform,provider,app_version,locale,last_seen_at")
      .eq("household_id", job.household_id)
      .eq("status", "active")
      .in("user_id", filteredTargetUserIds);
    if (!isPushTest) {
      tokensQuery = tokensQuery.lte("created_at", job.created_at);
    }
    const { data: tokens } = await tokensQuery;

    if (!(tokens?.length)) {
      await supabase.from("push_log").insert({
        job_id: job.id,
        token_id: null,
        status: "failed",
        provider_response: {
          reason: "no_active_tokens",
          eventType,
          targetUserIds: filteredTargetUserIds
        }
      });
      await supabase
        .from("push_jobs")
        .update({
          status: "failed",
          attempts: job.attempts + 1,
          last_error: "No active push tokens found"
        })
        .eq("id", job.id);
      processed += 1;
      continue;
    }

    const message = buildMessage(job);
    if (!message) {
      await supabase
        .from("push_jobs")
        .update({
          status: "done",
          attempts: job.attempts + 1,
          last_error: null
        })
        .eq("id", job.id);
      processed += 1;
      continue;
    }
    let successCount = 0;

    for (const tokenRow of (tokens ?? []) as PushTokenRow[]) {
      const messageData = {
        ...message.data,
        recipientUserId: tokenRow.user_id
      };
      const result = await sendFcmMessage({
        serviceAccount,
        projectId: fcmProjectId,
        token: tokenRow.token,
        title: message.title,
        body: message.body,
        data: messageData
      });

      const fcmError = extractFcmError(result.body ?? {});

      await supabase.from("push_log").insert({
        job_id: job.id,
        token_id: tokenRow.id,
        status: result.ok ? "sent" : "failed",
        provider_response: {
          ok: result.ok,
          httpStatus: result.status,
          tokenUserId: tokenRow.user_id,
          deviceId: tokenRow.device_id,
          platform: tokenRow.platform,
          provider: tokenRow.provider,
          appVersion: tokenRow.app_version,
          locale: tokenRow.locale,
          lastSeenAt: tokenRow.last_seen_at,
          fcmStatus: fcmError.status,
          fcmMessage: fcmError.message,
          fcmErrorCode: fcmError.errorCode,
          body: result.body ?? {}
        }
      });

      if (result.ok) {
        successCount += 1;
        await supabase.from("push_tokens").update({ last_error: null }).eq("id", tokenRow.id);
      } else {
        const errorCode = fcmError.errorCode;
        const errorMessage = fcmError.message ?? fcmError.status ?? `HTTP ${result.status}`;
        await supabase.from("push_tokens").update({ last_error: errorMessage }).eq("id", tokenRow.id);
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
