/* Service worker de Maths Quotidien — version __VERSION__, build __BUILD__ (le nom du cache change à chaque modification des fichiers). */
var PREFIX = "maths-quotidien-";
var CACHE = PREFIX + "__BUILD__";
var APP_PATH = new URL("app/", self.registration.scope).pathname;
var ASSETS = __ASSETS__;
self.addEventListener("install", function (e) {
  /* cache:"reload" : on télécharge vraiment les fichiers (GitHub Pages les garde 10 min dans le cache HTTP) */
  e.waitUntil(caches.open(CACHE).then(function (c) { return Promise.all(ASSETS.map(function (u) { return c.add(new Request(u, { cache: "reload" })); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf(PREFIX) === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function offline(req, url) {
  return caches.match(req).then(function (hit) { return hit || (req.mode === "navigate" ? caches.match((url.pathname + "/").indexOf(APP_PATH) === 0 ? "app/index.html" : "index.html") : undefined); });
}
self.addEventListener("fetch", function (e) {
  var req = e.request; if (req.method !== "GET") return;
  var url = new URL(req.url); if (url.origin !== location.origin) return;
  if (/\/version\.json$/.test(url.pathname) || /content\.enc\.json$/.test(url.pathname)) return;        // toujours depuis le réseau
  if (req.mode === "navigate" && url.pathname + "/" === APP_PATH) { e.respondWith(Response.redirect(new URL(APP_PATH + url.search, location.origin).href, 302)); return; }   // « …/app » sans slash, même hors ligne
  if (req.cache === "reload" || req.cache === "no-store") {                                                // téléchargement voulu (« Forcer la mise à jour », rechargement forcé)
    e.respondWith(fetch(req).catch(function () { return offline(req, url); }));                            // réseau d'abord (met à jour le cache HTTP) ; hors ligne : copie gardée, même quand le navigateur recharge « en dur »
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: false }).then(function (hit) {
    if (hit) return hit;
    return fetch(req).then(function (res) { if (res && res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); } return res; })
      .catch(function () { return offline(req, url); });
  }));
});
