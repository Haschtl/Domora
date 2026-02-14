import { useEffect, useState } from "react";
import i18n from "../i18n";
import type { HouseholdEvent, TaskItem } from "../lib/types";

const CHECK_INTERVAL_MS = 60_000;

const buildNotificationKey = (userId: string, taskId: string, dayKey: string) =>
  `domora-task-notify:${userId}:${taskId}:${dayKey}`;
const buildEventNotificationKey = (userId: string, eventId: string) => `domora-event-notify:${userId}:${eventId}`;

export const useTaskNotifications = (tasks: TaskItem[], householdEvents: HouseholdEvent[], userId: string | undefined) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "denied"
  );

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      return "denied" as NotificationPermission;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    return result;
  };

  useEffect(() => {
    if (!("Notification" in window) || permission !== "granted" || !userId) {
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
        if (window.localStorage.getItem(key) === "1") return;

        new Notification(i18n.t("tasks.notificationTitle"), {
          body: i18n.t("tasks.notificationBody", { title: task.title }),
          tag: `task-${task.id}-${dayKey}`
        });

        window.localStorage.setItem(key, "1");
      });
    };

    checkDueTasks();
    const notifyHouseholdEvents = () => {
      householdEvents.slice(0, 30).forEach((event) => {
        if (event.actor_user_id && event.actor_user_id === userId) return;
        const key = buildEventNotificationKey(userId, event.id);
        if (window.localStorage.getItem(key) === "1") return;

        const payload = event.payload ?? {};
        let title:string|undefined = undefined;
        let body = "";

        if (event.event_type === "task_completed") {
          title = i18n.t("app.pushTaskCompletedTitle");
          body = i18n.t("app.pushTaskCompletedBody", { task: String(payload.title ?? "") });
        } else if (event.event_type === "finance_created") {
          title = i18n.t("app.pushFinanceCreatedTitle");
          body = i18n.t("app.pushFinanceCreatedBody", { name: String(payload.description ?? "") });
        } else if (event.event_type === "cash_audit_requested") {
          title = i18n.t("app.pushCashAuditTitle");
          body = i18n.t("app.pushCashAuditBody");
        } else {
          return;
        }

        new Notification(title, {
          body,
          tag: `event-${event.id}`
        });

        window.localStorage.setItem(key, "1");
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
