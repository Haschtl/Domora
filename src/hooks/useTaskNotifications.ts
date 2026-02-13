import { useEffect, useState } from "react";
import i18n from "../i18n";
import type { TaskItem } from "../lib/types";

const CHECK_INTERVAL_MS = 60_000;

const buildNotificationKey = (userId: string, taskId: string, dayKey: string) =>
  `domora-task-notify:${userId}:${taskId}:${dayKey}`;

export const useTaskNotifications = (tasks: TaskItem[], userId: string | undefined) => {
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
    const timer = window.setInterval(checkDueTasks, CHECK_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [permission, tasks, userId]);

  return {
    permission,
    requestPermission
  };
};
