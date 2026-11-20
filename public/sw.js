// Minimal service worker: it exists so the site can be installed, and to show a small offline page when there is no network.
// It never stores pages, data or photos (everything behind the login stays on the server and is never kept on the device).
const OFFLINE = "/offline.html";
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open("offline-v1").then((c) => c.add(OFFLINE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== "offline-v1").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // only page loads; data and files go straight to the network
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
