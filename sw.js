/* Hors connexion : réseau d'abord, cache en secours.
   Si le réseau ne répond pas en 3 s (gymnase), la version en cache est servie
   et le cache est quand même mis à jour dès que le réseau répond. */
const VERSION = "coeval-2";
const FILES = ["./", "index.html", "coeval.css", "coeval-core.js", "coeval.js", "qrcode.js", "jsQR.js", "manifest.webmanifest"];
const NETWORK_TIMEOUT = 3000;

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
  const url = new URL(request.url);
  const network = fetch(request, {cache: "no-store"}).then(async response => {
    if (response.ok) {
      const cache = await caches.open(VERSION);
      await cache.put(url.origin + url.pathname, response.clone());
    }
    return response;
  });
  const cached = async () =>
    (await caches.match(request, {ignoreSearch: true})) ||
    (request.mode === "navigate" ? caches.match("index.html") : undefined);
  event.respondWith(new Promise(resolve => {
    let done = false;
    const finish = response => { if (!done && response) { done = true; resolve(response); } };
    const timer = setTimeout(() => cached().then(finish), NETWORK_TIMEOUT);
    network
      .then(response => { clearTimeout(timer); finish(response); })
      .catch(async () => {
        clearTimeout(timer);
        finish((await cached()) || new Response("Hors connexion.", {status: 503, headers: {"Content-Type": "text/plain; charset=utf-8"}}));
      });
  }));
  event.waitUntil(network.catch(() => {}));
});
