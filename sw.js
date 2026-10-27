/*
 * Trust Network app-shell service worker.
 *
 * Caches the installable shell (start page, icons, manifest) so the app
 * opens offline and installs as a PWA. API calls (/v1/*, /health, JWKS)
 * are NEVER cached: scores, challenges and tokens must always be fresh.
 *
 * The site may be mounted under a subpath (GitHub project page, e.g.
 * /peer-trust-network) or at a domain root (custom domain). This script
 * is served from the mount root in both cases, so derive the base from
 * the script's own URL instead of assuming "/".
 */
const BASE = self.location.pathname.replace(/\/sw\.js$/, "");
const CACHE = "tn-shell-v3";
const SHELL = [
  `${BASE}/`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/icons/icon-192.png`,
  `${BASE}/icons/icon-512.png`,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never touch the API origin
  if (url.pathname.startsWith("/v1/") || url.pathname === "/health" || url.pathname.startsWith("/.well-known/")) {
    return;
  }
  if (request.mode === "navigate") {
    // Network first for pages; fall back to the cached start page offline.
    event.respondWith(fetch(request).catch(() => caches.match(`${BASE}/`)));
    return;
  }
  if (url.pathname.startsWith(`${BASE}/_next/static/`) || url.pathname.startsWith(`${BASE}/icons/`)) {
    // Network first, cache as the offline fallback. (Cache-first pinned
    // stale code whenever chunk URLs were not content-hashed, e.g. `next dev`.)
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request)),
    );
  }
});
