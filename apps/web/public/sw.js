/* global self, caches, URL, fetch */
const VERSION = "myqsl-v2";
const STATIC_ASSETS = ["/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== VERSION) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API routes or public card routes
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/c/")) {
    return;
  }

  // HTML navigation requests must ALWAYS be network-first so updates are received immediately
  if (event.request.mode === "navigate" || url.pathname === "/" || url.pathname.endsWith(".html")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // For other static assets, try network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const copy = response.clone();
          void caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

