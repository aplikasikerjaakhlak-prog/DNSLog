// Service worker: install aplikasi, cadangan offline, dan notifikasi persetujuan login (FCM).
const CACHE = 'dnslog-v2';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});

/* ---------- notifikasi dari FCM (pesan data) ---------- */
const ROLE = { viewer: 'Viewer', operator: 'Operator', admin: 'Admin' };
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (_) {}
  const d = p.data || p;
  let title, opt;
  if (d.type === 'login') {
    title = '🔐 Permintaan login';
    opt = { body: `${d.nama} (${d.username}) · ${ROLE[d.role] || d.role}\n${d.dev}\nKetuk untuk memilih angka`,
            tag: 'login-' + d.id, renotify: true, requireInteraction: true, vibrate: [200, 100, 200, 100, 200],
            data: { id: d.id } };
  } else {
    title = d.title || 'Log Aktivitas DNS';
    opt = { body: d.body || '', tag: 'info', data: {} };
  }
  opt.icon = 'icon-192.png'; opt.badge = 'icon-192.png'; opt.timestamp = Date.now();
  e.waitUntil(self.registration.showNotification(title, opt));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = (e.notification.data || {}).id || '';
  const url = new URL(id ? './?approve=' + encodeURIComponent(id) : './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { if (id) c.postMessage({ type: 'approve', id }); return c.focus(); }
    }
    return clients.openWindow(url);
  }));
});
