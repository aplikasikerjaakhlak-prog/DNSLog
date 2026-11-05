// Service worker: install aplikasi, cadangan offline, dan notifikasi persetujuan login (FCM).
const CACHE = 'dnslog-v7';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
// halaman meminta versi baru langsung aktif (tanpa menunggu aplikasi ditutup)
self.addEventListener('message', e => { if (e.data && e.data.type === 'skip-waiting') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'dnslog-keys').map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/device-key')) return;
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
    // judul singkat agar langsung terbaca di banner atas (heads-up) tanpa perlu membuka notifikasi
    title = `🔐 ${d.nama || d.username} minta login — pilih angka`;
    opt = { body: `${ROLE[d.role] || d.role} · ${d.dev}\nCocokkan dengan angka di layar user. Ketuk untuk menolak / pilihan lain.`,
            tag: 'login-' + d.id, renotify: true, requireInteraction: true, silent: false,
            vibrate: [400, 150, 400, 150, 400, 150, 400],
            data: { id: d.id, user: d.username } };
    // tombol angka langsung di notifikasi (Android/Chrome maks. 2 tombol)
    if (d.a1 && d.a2) opt.actions = [{ action: 'p' + d.a1, title: '   ' + d.a1 + '   ' }, { action: 'p' + d.a2, title: '   ' + d.a2 + '   ' }];
  } else {
    title = d.title || 'Log Aktivitas DNS';
    opt = { body: d.body || '', tag: 'info', data: {} };
  }
  opt.icon = 'icon-192.png'; opt.badge = 'icon-192.png'; opt.timestamp = Date.now();
  e.waitUntil(self.registration.showNotification(title, opt));
});

function openApp(id) {
  const url = new URL(id ? './?approve=' + encodeURIComponent(id) : './', self.registration.scope).href;
  return clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) {
      if (c.url.startsWith(self.registration.scope)) { if (id) c.postMessage({ type: 'approve', id }); return c.focus(); }
    }
    return clients.openWindow(url);
  });
}

/** kirim pilihan angka langsung ke server tanpa membuka aplikasi */
async function approveFromNotif(id, pick, user) {
  const note = (title, body) => self.registration.showNotification(title, { body, tag: 'login-' + id, icon: 'icon-192.png',
    badge: 'icon-192.png', timestamp: Date.now(), data: {} });
  const r = await caches.open('dnslog-keys').then(c => c.match('./device-key')).catch(() => null);
  if (!r) {                                                    // kunci perangkat belum ada
    await note('⚠️ Tombol angka belum aktif', 'Buka aplikasi Log DNS sekali (login admin) agar tombol angka di notifikasi bisa dipakai.');
    return openApp(id);
  }
  const { dk, exec } = await r.json();
  const body = JSON.stringify({ type: 'push-approve', id, pick, dk });
  try {                                                        // 1) normal: baca hasil dari server
    const x = await fetch(exec, { method: 'POST', redirect: 'follow', body });
    const res = await x.json();
    return note(res.ok ? '✅ Login diizinkan' : '⛔ Login tidak diizinkan', res.msg || '');
  } catch (_) {}
  try {                                                        // 2) cadangan: kirim tanpa membaca balasan
    await fetch(exec, { method: 'POST', mode: 'no-cors', body });
    return note('📨 Pilihan ' + pick + ' terkirim', 'Cek layar ' + (user || 'user') + ' — bila angkanya sama, user langsung masuk.');
  } catch (_) {}
  await note('⚠️ Gagal mengirim', 'Tidak ada koneksi. Membuka aplikasi…');
  return openApp(id);
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if (e.action && e.action.startsWith('p') && d.id) e.waitUntil(approveFromNotif(d.id, e.action.slice(1), d.user));
  else e.waitUntil(openApp(d.id || ''));
});
