/* Hors connexion : réseau d'abord, cache en secours. */
const VERSION = "coeval-1";
const FILES = ["./", "index.html", "coeval.css", "coeval.js", "qrcode.js", "jsQR.js", "manifest.webmanifest"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(request, {cache: "no-store"})
      .then(async response => {
        if (response.ok) {
          const url = new URL(request.url);
          const cache = await caches.open(VERSION);
          await cache.put(url.origin + url.pathname, response.clone());
        }
        return response;
      })
      .catch(async () =>
        (await caches.match(request, {ignoreSearch: true})) ||
        (request.mode === "navigate" ? caches.match("index.html") : undefined) ||
        new Response("Hors connexion.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}})
      )
  );
});
