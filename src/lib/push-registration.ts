import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "./supabase";
import {
  getFirebaseRuntimeConfig,
  serializeFirebaseConfigForServiceWorker,
  type FirebaseClientConfig
} from "./firebase-config";

const ensureFirebaseApp = (config: FirebaseClientConfig) => {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      messagingSenderId: config.messagingSenderId,
      appId: config.appId,
      storageBucket: config.storageBucket,
      measurementId: config.measurementId
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
  if (typeof window === "undefined") return;
  if (Notification.permission !== "granted") return;
  if (!(await isSupported())) return;

  const runtimeConfig = await getFirebaseRuntimeConfig({ forceRefresh: true });
  if (!runtimeConfig) return;

  ensureFirebaseApp(runtimeConfig.firebase);
  const baseUrl = import.meta.env.BASE_URL || "/";
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const existingRegistration = await navigator.serviceWorker.getRegistration(`${normalizedBaseUrl}firebase/`);
  if (existingRegistration?.active?.scriptURL?.includes("firebase-messaging-sw.js")) {
    await existingRegistration.unregister();
  }
  const swUrl = new URL(`${normalizedBaseUrl}firebase/firebase-messaging-sw.js`, window.location.origin);
  swUrl.searchParams.set("config", serializeFirebaseConfigForServiceWorker(runtimeConfig.firebase));
  const registration = await navigator.serviceWorker.register(swUrl.toString(), {
    scope: `${normalizedBaseUrl}firebase/`
  });
  const messaging = getMessaging();

  const token = await getToken(messaging, {
    vapidKey: runtimeConfig.vapidKey,
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
