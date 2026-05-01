const CACHE = "wc-fieldtech-v21";
const API_BASE = "https://wilbanks-server-production.up.railway.app";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => new Response("Offline", { status: 503 })));
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  if (!e.data) return;

  let data;
  try { data = e.data.json(); } catch { data = { title: "New Job", body: e.data.text() }; }

  // Silent push — just clear the badge, no notification shown
  if (data.silent === true) {
    e.waitUntil(
      (navigator.clearAppBadge ? navigator.clearAppBadge() : Promise.resolve()).catch(() => {})
    );
    return;
  }

  const title = data.title || "Wilbanks Company";
  const options = {
    body: data.body || "You have a new job assignment.",
    icon: "https://gwilbanksplumbing.github.io/wilbanks-fieldtech/icons/icon-192.png",
    tag: "wc-job-" + (data.appointmentId || Date.now()),
    renotify: true,
    data: { appointmentId: data.appointmentId, badgeCount: data.badgeCount || 0 },
  };

  e.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      if (data.badgeCount && navigator.setAppBadge) {
        return navigator.setAppBadge(data.badgeCount).catch(() => {});
      }
    }).catch((err) => {
      console.warn("[SW] showNotification failed:", err);
    })
  );
});

// ── Message from page: clear badge when app is opened ─────────────────────
self.addEventListener("message", (e) => {
  if (e.data?.type === "CLEAR_BADGE") {
    if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  }
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  if (navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  const apptId = e.notification.data?.appointmentId;

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();

          return;
        }
      }
      const _base = self.registration.scope;
      if (clients.openWindow) return clients.openWindow(_base);
    })
  );
});
