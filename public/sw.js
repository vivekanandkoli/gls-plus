/* GLS Plus service worker — intentionally minimal and safe.
 *
 *  - Pages (navigations): network-first, so users always get fresh content when
 *    online; fall back to a cached offline page only when the network fails.
 *  - Only a tiny set of static assets is precached. Everything else (including
 *    all Supabase API/auth traffic, which is cross-origin) goes straight to the
 *    network and is never cached, so nothing can serve stale app data.
 *  Bump CACHE to roll the precache on future changes.
 */
const CACHE = "gls-plus-v1";
const PRECACHE = ["/offline", "/icon-192.png", "/apple-touch-icon.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Never intercept cross-origin requests (Supabase, fonts, etc.).
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first with an offline fallback.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline")));
    return;
  }

  // Precached static assets: serve from cache; otherwise go to the network.
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
});
