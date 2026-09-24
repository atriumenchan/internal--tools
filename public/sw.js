/* ADMEXO Workspace — installable PWA.
   Network-only fetch so auth, boards, and chat never serve a stale page. */
const VERSION = "admexo-sw-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
