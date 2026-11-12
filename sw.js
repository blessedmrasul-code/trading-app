// ARVEX storefront: retire the old app service worker and remove stale app caches.
const CACHE_PREFIX = "arvex-";
self.addEventListener("install", event => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
    await self.clients.claim();
    await self.registration.unregister();
  })());
});
// No offline app fallback and no cached application shell: requests go directly to the network.
