const CACHE = "wc-fieldtech-v6";
const API_BASE = "https://wilbanks-server-production.up.railway.app";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  // Delete ALL old caches on activate
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  // Always go to network — no caching of app shell
  // This prevents stale UI from being served
  if (e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).catch(() => new Response("Offline", { status: 503 })));
});

// ── Push notifications ──────────────────────────────────────────────────────

self.addEventListener("push", (e) => {
  if (!e.data) return;

  let data;
  try { data = e.data.json(); } catch { data = { title: "New Job", body: e.data.text() }; }

  const title = data.title || "Wilbanks Company";
  const options = {
    body: data.body || "You have a new job assignment.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `job-${data.appointmentId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: { appointmentId: data.appointmentId },
  };

  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const apptId = e.notification.data?.appointmentId;

  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
      // If app is already open, focus it and navigate
      for (const client of windowClients) {
        if ("focus" in client) {
          client.focus();
          if (apptId) client.postMessage({ type: "NAVIGATE", path: `/job/${apptId}` });
          return;
        }
      }
      // Otherwise open app
      const url = apptId ? `/#/job/${apptId}` : "/";
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
