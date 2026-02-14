import { useEffect, useState } from "react";
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

export const useTaskNotifications = (tasks: TaskItem[], householdEvents: HouseholdEvent[], userId: string | undefined) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    isNotificationSupported() ? Notification.permission : "denied"
  );

  const requestPermission = async () => {
    if (!isNotificationSupported()) {
      return "denied" as NotificationPermission;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

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

        const sent = tryNotify(i18n.t("tasks.notificationTitle"), {
          body: i18n.t("tasks.notificationBody", { title: task.title }),
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

  return {
    permission,
    requestPermission
  };
};
