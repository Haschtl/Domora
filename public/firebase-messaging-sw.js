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

const buildNotificationOptions = (payload) => {
  const notification = payload.notification ?? {};
  const data = payload.data || {};
  const type = String(data.type || "");
  const recipientUserId = String(data.recipientUserId || "");
  const actorUserId = String(data.actorUserId || "");
  const actions = [];

  if (type === "live_location_started") {
    actions.push({ action: "live_show_on_map", title: "Auf Karte anzeigen" });
    if (recipientUserId && actorUserId && recipientUserId === actorUserId) {
      actions.push({ action: "live_stop_share", title: "Teilen beenden" });
    }
  }

  if (type === "one_off_claim_created" && data.claimId) {
    actions.push({ action: "oneoff_approve", title: "Approve" });
    actions.push({ action: "oneoff_reject", title: "Reject" });
    actions.push({ action: "oneoff_counter", title: "Counter" });
  }

  const options = {
    body: notification.body || "",
    data,
    actions
  };
  return options;
};

const openClientUrl = async (url) => {
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  if (clientsList.length > 0) {
    const client = clientsList[0];
    if ("focus" in client) {
      await client.focus();
    }
    if ("navigate" in client) {
      await client.navigate(url);
    }
    return;
  }
  await self.clients.openWindow(url);
};

const buildActionUrl = (data, action) => {
  const currentUrl = new URL(self.location.origin);
  currentUrl.pathname = "/home/summary";
  const type = String(data?.type || "");
  if (action === "live_show_on_map" || type === "live_location_started") {
    currentUrl.searchParams.set("pushAction", "live_show_on_map");
    if (data?.actorUserId) currentUrl.searchParams.set("actorUserId", String(data.actorUserId));
    if (data?.householdId) currentUrl.searchParams.set("householdId", String(data.householdId));
    return currentUrl.toString();
  }
  if (action === "live_stop_share") {
    currentUrl.searchParams.set("pushAction", "live_stop_share");
    if (data?.householdId) currentUrl.searchParams.set("householdId", String(data.householdId));
    if (data?.actorUserId) currentUrl.searchParams.set("actorUserId", String(data.actorUserId));
    return currentUrl.toString();
  }
  if ((action === "oneoff_approve" || action === "oneoff_reject" || action === "oneoff_counter") && data?.claimId) {
    currentUrl.pathname = "/tasks/overview";
    currentUrl.searchParams.set("pushAction", action);
    currentUrl.searchParams.set("claimId", String(data.claimId));
    if (data?.requestedPimpers) currentUrl.searchParams.set("requestedPimpers", String(data.requestedPimpers));
    return currentUrl.toString();
  }
  if (type === "task_due" || type === "task_taken_over" || type === "task_completed" || type === "task_skipped") {
    currentUrl.pathname = "/tasks/overview";
    if (data?.taskId) currentUrl.searchParams.set("taskId", String(data.taskId));
    return currentUrl.toString();
  }
  return currentUrl.toString();
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const action = String(event.action || "");
  const targetUrl = buildActionUrl(data, action);
  event.waitUntil(openClientUrl(targetUrl));
});

const firebaseConfig = readConfigFromQuery();
if (firebaseConfig) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification ?? {};
    const title = notification.title || "Domora";
    const options = buildNotificationOptions(payload);
    self.registration.showNotification(title, options);
  });
}
