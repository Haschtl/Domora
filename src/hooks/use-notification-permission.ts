import { useState } from "react";

const isNotificationSupported = () =>
  typeof window !== "undefined" && window.isSecureContext && "Notification" in window;

export const useNotificationPermission = () => {
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

  return {
    permission,
    requestPermission
  };
};
