const CACHE = "wc-fieldtech-v71";
const API_BASE = "https://wilbanks-server-production.up.railway.app";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first with cache fallback.
// - GET requests for our own app shell (HTML/JS/CSS/images) are cached opportunistically.
//   If the network fails, we serve the cached copy so the PWA still loads on flaky cell.
// - API calls (anything to API_BASE) are NEVER cached — we don't want stale job data.
//   They pass through normally; failure falls back to a clean 503 (not a fake "Offline" page).
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isApi = url.origin === API_BASE || url.href.startsWith(API_BASE);

  if (isApi) {
    // Pass-through; on network failure return a JSON-ish 503 so the app can detect it.
    e.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: "offline", code: "NETWORK_UNAVAILABLE" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    return;
  }

  // App shell: network-first, cache on success, fall back to cache on failure.
  e.respondWith(
    fetch(req)
      .then(resp => {
        // Only cache OK basic/cors responses (don't cache opaque/error responses).
        if (resp && resp.ok && (resp.type === "basic" || resp.type === "cors")) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return resp;
      })
      .catch(() =>
        caches.match(req).then(cached => {
          if (cached) return cached;
          // Last-resort fallback for top-level navigations: try the cached root HTML.
          if (req.mode === "navigate") {
            return caches.match("./") || caches.match("./index.html");
          }
          return new Response("Offline", { status: 503 });
        })
      )
  );
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
