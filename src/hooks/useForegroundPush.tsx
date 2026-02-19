import { useEffect } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { toast } from "react-toastify";
import { getFirebaseRuntimeConfig } from "../lib/firebase-config";

type ForegroundPushOptions = {
  enabled: boolean;
  onNavigate?: (data: Record<string, string>) => void;
};

export const useForegroundPush = ({ enabled, onNavigate }: ForegroundPushOptions) => {
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      const runtimeConfig = await getFirebaseRuntimeConfig();
      if (!runtimeConfig) return;
      if (!(await isSupported())) return;
      if (getApps().length === 0) {
        initializeApp({
          apiKey: runtimeConfig.firebase.apiKey,
          authDomain: runtimeConfig.firebase.authDomain,
          projectId: runtimeConfig.firebase.projectId,
          messagingSenderId: runtimeConfig.firebase.messagingSenderId,
          appId: runtimeConfig.firebase.appId,
          storageBucket: runtimeConfig.firebase.storageBucket,
          measurementId: runtimeConfig.firebase.measurementId
        });
      }
      const messaging = getMessaging();
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Domora";
        const body = payload.notification?.body ?? "";
        const data = payload.data ?? {};
        const handleClick =
          onNavigate && Object.keys(data).length > 0
            ? () => {
                onNavigate(data as Record<string, string>);
              }
            : undefined;
        const shouldShowOsNotification =
          typeof document !== "undefined" ? document.visibilityState !== "visible" : true;
        if (shouldShowOsNotification && typeof Notification !== "undefined" && Notification.permission === "granted") {
          try {
            const notification = new Notification(title, {
              body,
              icon: "/icon-192.png",
              badge: "/icon-192.png"
            });
            if (handleClick) {
              notification.onclick = () => {
                window.focus();
                handleClick();
                notification.close();
              };
            }
          } catch {
            // Ignore Notification errors (e.g. blocked by browser policy).
          }
        }
        toast.info(
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {body ? <p className="text-xs text-slate-200/90">{body}</p> : null}
          </div>,
          {
            onClick: handleClick,
            className: handleClick ? "cursor-pointer" : undefined
          }
        );
      });
    };

    void init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [enabled, onNavigate]);
};
