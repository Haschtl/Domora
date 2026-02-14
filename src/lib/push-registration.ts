import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "./supabase";
import { firebaseConfig, isFirebaseConfigured, vapidKey } from "./firebase-config";

const ensureFirebaseApp = () => {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: firebaseConfig.apiKey ?? "",
      authDomain: firebaseConfig.authDomain ?? "",
      projectId: firebaseConfig.projectId ?? "",
      messagingSenderId: firebaseConfig.messagingSenderId ?? "",
      appId: firebaseConfig.appId ?? ""
    });
  }
};

const getDeviceId = () => {
  if (typeof window === "undefined") return "server";
  const key = "domora:device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(key, next);
  return next;
};

export const registerWebPushToken = async ({
  householdId,
  locale,
  timezone,
  appVersion
}: {
  householdId: string;
  locale?: string;
  timezone?: string;
  appVersion?: string;
}) => {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase config missing");
  }

  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!(await isSupported())) return;

  ensureFirebaseApp();
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const messaging = getMessaging();

  const token = await getToken(messaging, {
    vapidKey: vapidKey ?? undefined,
    serviceWorkerRegistration: registration
  });

  if (!token) return;

  await supabase.functions.invoke("register-push-token", {
    body: {
      token,
      deviceId: getDeviceId(),
      householdId,
      platform: "web",
      provider: "fcm",
      appVersion: appVersion ?? null,
      locale: locale ?? null,
      timezone: timezone ?? null
    }
  });
};
