/*
 * What Stayed service worker.
 * - Keeps the app's own static files (scripts, styles, icons, fonts) so it opens fast and can show an offline page.
 * - Never caches your memories, pages, photographs or any API response: those always come from your account.
 */
const VERSION = 'ws-v2';
const SHELL = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // personal data: straight to the network, never stored here
  if (url.origin === location.origin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/print'))) return;

  // pages: left to the browser while online (so a page being written can still be saved as you leave);
  // when the device is offline, the offline page instead of the browser's error
  if (req.mode === 'navigate') {
    if (self.navigator && self.navigator.onLine === false) e.respondWith(caches.match('/offline.html'));
    return;
  }

  // the app's own build files and fonts: cached once, served fast
  const isStatic =
    (url.origin === location.origin && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/'))) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';
  if (isStatic) {
    e.respondWith(
      caches.open(VERSION).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') c.put(req, res.clone());
        return res;
      }),
    );
  }
});
