/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const decodeBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padding);
  return atob(padded);
};

const readConfigFromQuery = () => {
  try {
    const workerUrl = new URL(self.location.href);
    const encodedConfig = workerUrl.searchParams.get("config");
    if (!encodedConfig) return null;
    return JSON.parse(decodeBase64Url(encodedConfig));
  } catch {
    return null;
  }
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const firebaseConfig = readConfigFromQuery();
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification ?? {};
    const title = notification.title || "Domora";
    const options = {
      body: notification.body || "",
      data: payload.data || {}
    };
    self.registration.showNotification(title, options);
  });
}
