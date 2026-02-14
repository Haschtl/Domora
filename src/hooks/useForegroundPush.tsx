import { useEffect } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, isSupported, onMessage } from "firebase/messaging";
import { toast } from "react-toastify";
import { firebaseConfig, isFirebaseConfigured } from "../lib/firebase-config";

export const useForegroundPush = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;
    if (!isFirebaseConfigured) return;
    if (typeof window === "undefined") return;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      if (!(await isSupported())) return;
      if (getApps().length === 0) {
        initializeApp({
          apiKey: firebaseConfig.apiKey ?? "",
          authDomain: firebaseConfig.authDomain ?? "",
          projectId: firebaseConfig.projectId ?? "",
          messagingSenderId: firebaseConfig.messagingSenderId ?? "",
          appId: firebaseConfig.appId ?? ""
        });
      }
      const messaging = getMessaging();
      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title ?? "Domora";
        const body = payload.notification?.body ?? "";
        toast.info(
          <div>
            <p className="text-sm font-semibold">{title}</p>
            {body ? <p className="text-xs text-slate-200/90">{body}</p> : null}
          </div>
        );
      });
    };

    void init();
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [enabled]);
};
