const CACHE_NAME = "rays-pwa-v4";
const pushSettings = {
  notificationsEnabled: true,
  currentLogin: "",
  mutedChatKeys: new Set(),
};

function normalizeString(value) {
  return String(value || "");
}

function resolvePushChatKey(data) {
  if (data?.type === "call:invite" && data.from_login) {
    return `private:${normalizeString(data.from_login)}`;
  }
  if (data?.chat_type === "group" && data.target) {
    return `group:${normalizeString(data.target)}`;
  }
  if (data?.chat_type !== "private") return "";
  const sender = normalizeString(data.sender_login);
  const target = normalizeString(data.target);
  const me = normalizeString(pushSettings.currentLogin);
  const partner = sender && me && sender !== me ? sender : target;
  return partner ? `private:${partner}` : "";
}

function isSelfPush(data) {
  const me = normalizeString(pushSettings.currentLogin);
  if (!me) return false;
  const sender = normalizeString(data?.sender_login || data?.from_login);
  return !!sender && sender === me;
}

self.addEventListener("message", (event) => {
  const data = event?.data;
  if (!data || data.type !== "push:settings" || !data.settings) return;
  pushSettings.notificationsEnabled = !!data.settings.notificationsEnabled;
  pushSettings.currentLogin = normalizeString(data.settings.currentLogin);
  pushSettings.mutedChatKeys = new Set((data.settings.mutedChatKeys || []).map((x) => normalizeString(x)));
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(url));
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "RayS Messenger", body: event.data.text() };
  }
  const title = payload.title || "RayS Messenger";
  const body = payload.body || "";
  const data = payload.data || {};
  if (!pushSettings.notificationsEnabled) return;
  if (isSelfPush(data)) return;
  const chatKey = resolvePushChatKey(data);
  if (chatKey && pushSettings.mutedChatKeys.has(chatKey)) return;
  const options = {
    body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      ...data,
      url: data.url || "/",
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
