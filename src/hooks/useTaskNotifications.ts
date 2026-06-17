import { useEffect, useRef } from "react";
import i18n from "../i18n";
import type { HouseholdEvent, TaskItem } from "../lib/types";

const CHECK_INTERVAL_MS = 60_000;

const buildNotificationKey = (userId: string, taskId: string, dayKey: string) =>
  `domora-task-notify:${userId}:${taskId}:${dayKey}`;
const buildEventNotificationKey = (userId: string, eventId: string) => `domora-event-notify:${userId}:${eventId}`;
const isNotificationSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "Notification" in window && "localStorage" in window;
const hasBeenNotified = (key: string) => {
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};
const markNotified = (key: string) => {
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Ignore storage failures (private mode / quota issues).
  }
};
const tryNotify = (title: string, options: NotificationOptions) => {
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
};
const getRentContractsNotificationValue = (event: HouseholdEvent, userId: string) => {
  const payload = event.payload ?? {};
  const beforeMap =
    typeof payload.memberTotalsBefore === "object" && payload.memberTotalsBefore
      ? (payload.memberTotalsBefore as Record<string, unknown>)
      : null;
  const afterMap =
    typeof payload.memberTotalsAfter === "object" && payload.memberTotalsAfter
      ? (payload.memberTotalsAfter as Record<string, unknown>)
      : null;
  const beforeValue = beforeMap ? Number(beforeMap[userId] ?? Number.NaN) : Number.NaN;
  const afterValue = afterMap ? Number(afterMap[userId] ?? Number.NaN) : Number.NaN;
  if (!Number.isFinite(afterValue)) return null;
  if (Number.isFinite(beforeValue) && Math.abs(afterValue - beforeValue) < 0.004) return null;
  return {
    value: new Intl.NumberFormat(i18n.language, {
      style: "currency",
      currency: String(payload.currency ?? "EUR")
    }).format(afterValue)
  };
};
const getOverdueDays = (task: TaskItem, nowMillis: number) => {
  const dueTime = new Date(task.due_at).getTime();
  if (Number.isNaN(dueTime)) return 0;
  const graceMinutes = Math.max(0, task.grace_minutes ?? 0);
  return Math.max(0, Math.floor((nowMillis - (dueTime + graceMinutes * 60_000)) / 86_400_000));
};

export const useTaskNotifications = (
  tasks: TaskItem[],
  householdEvents: HouseholdEvent[],
  userId: string | undefined,
  permission: NotificationPermission
) => {
  const sessionStartedAtRef = useRef(Date.now());
  const userIdRef = useRef<string | undefined>(undefined);

  if (userIdRef.current !== userId) {
    userIdRef.current = userId;
    sessionStartedAtRef.current = Date.now();
  }

  useEffect(() => {
    if (!isNotificationSupported() || permission !== "granted" || !userId) {
      return;
    }

    const checkDueTasks = () => {
      const now = new Date();
      const nowMillis = now.getTime();
      const dayKey = now.toISOString().slice(0, 10);

      tasks.forEach((task) => {
        if (task.done) return;
        if (!task.is_active) return;
        if (task.assignee_id !== userId) return;

        const dueTime = new Date(task.due_at).getTime();
        if (Number.isNaN(dueTime) || dueTime > nowMillis) return;

        const key = buildNotificationKey(userId, task.id, dayKey);
        if (hasBeenNotified(key)) return;
        if (dueTime < sessionStartedAtRef.current) {
          markNotified(key);
          return;
        }

        const overdueDays = getOverdueDays(task, nowMillis);
        const sent = tryNotify(i18n.t("tasks.notificationTitle"), {
          body:
            overdueDays >= 1
              ? i18n.t("tasks.notificationOverdueBody", { title: task.title, count: overdueDays })
              : i18n.t("tasks.notificationBody", { title: task.title }),
          tag: `task-${task.id}-${dayKey}`
        });
        if (sent) markNotified(key);
      });
    };

    checkDueTasks();
    const notifyHouseholdEvents = () => {
      householdEvents.slice(0, 30).forEach((event) => {
        if (event.actor_user_id && event.actor_user_id === userId) return;
        const key = buildEventNotificationKey(userId, event.id);
        if (hasBeenNotified(key)) return;
        const eventTime = new Date(event.created_at).getTime();
        if (Number.isFinite(eventTime) && eventTime < sessionStartedAtRef.current) {
          markNotified(key);
          return;
        }

        const payload = event.payload ?? {};
        const notificationContent =
          event.event_type === "task_completed"
            ? {
                title: i18n.t("app.pushTaskCompletedTitle"),
                body: i18n.t("app.pushTaskCompletedBody", { task: String(payload.title ?? "") })
              }
            : event.event_type === "finance_created"
              ? {
                  title: i18n.t("app.pushFinanceCreatedTitle"),
                  body: i18n.t("app.pushFinanceCreatedBody", { name: String(payload.description ?? "") })
                }
              : event.event_type === "cash_audit_requested"
                ? {
                    title: i18n.t("app.pushCashAuditTitle"),
                    body: i18n.t("app.pushCashAuditBody")
                  }
                : ["rent_updated", "contract_created", "contract_updated", "contract_deleted"].includes(event.event_type)
                  ? (() => {
                      const details = getRentContractsNotificationValue(event, userId);
                      if (!details) return null;
                      return {
                        title: i18n.t("app.pushRentContractsChangedTitle"),
                        body: i18n.t("app.pushRentContractsChangedBody", { value: details.value })
                      };
                    })()
                : null;

        if (!notificationContent) return;

        const sent = tryNotify(notificationContent.title, {
          body: notificationContent.body,
          tag: `event-${event.id}`
        });
        if (sent) markNotified(key);
      });
    };

    notifyHouseholdEvents();
    const timer = window.setInterval(checkDueTasks, CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [householdEvents, permission, tasks, userId]);

  return null;
};
