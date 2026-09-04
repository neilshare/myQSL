/* global self, caches, URL, fetch */
const VERSION = "myqsl-static-v1";
const STATIC_ASSETS = ["/", "/manifest.webmanifest"];
self.addEventListener("install", (event) => event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(STATIC_ASSETS))));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/c/")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => { const copy = response.clone(); void caches.open(VERSION).then((cache) => cache.put(event.request, copy)); return response; })));
});
