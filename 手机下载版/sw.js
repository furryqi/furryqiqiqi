/* 双人麻将 · 离线缓存（容忍个别文件缺失，缺了也能安装成功） */
const CACHE = 'mj2p-v3';
const ASSETS = [
  './',
  './index.html',
  './game.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './css/style.css',
  './js/engine.js',
  './js/game.js',
  './js/ai.js',
  './js/ui.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 逐个缓存：某个文件 404 不会让整个安装失败
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 缓存优先，网络兜底（离线也能玩）
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
