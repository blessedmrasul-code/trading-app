// Service worker ARVEX: сначала сеть (обновления доходят сразу), офлайн — из кэша.
const CACHE = "arvex-v4-5";
const ASSETS = ["./", "index.html", "style.css", "app.js", "cloud-config.js", "cloud.js", "premium.js", "chart.js", "school.js", "tools.js", "lessons.js", "exam.js", "glossary.js", "logo.png", "favicon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return; // API Binance — только из сети
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request).then(m => m || caches.match("index.html"))));
});
