/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const loadConfig = async () => {
  try {
    const baseUrl = self.registration?.scope || "/";
    const res = await fetch(new URL("firebase-config.json", baseUrl).toString(), { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const configPromise = loadConfig();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

configPromise.then((firebaseConfig) => {
  if (!firebaseConfig) return;
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
});
