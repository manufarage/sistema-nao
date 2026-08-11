/* Service worker — estrategia network-first:
   online siempre sirve lo más fresco; sin conexión, sirve la última copia en caché. */
var CACHE = "lt-vzla-v3";

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return; // APIs externas (tasas) van directo
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copia = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copia); });
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});
