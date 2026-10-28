/* 双人麻将 · 离线缓存 v5
 * 策略：
 *   - 页面导航（HTML）走「网络优先」，保证更新后立刻能看到新版本，断网时才用缓存
 *   - 静态资源（css/js/图片）走「缓存优先」，省流量、离线可用
 *   - 单个文件 404 不会让安装失败
 */
const CACHE = 'mj2p-v5';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
];
const EXTRA = [
  './css/style.css',
  './js/engine.js',
  './js/game.js',
  './js/ai.js',
  './js/ui.js',
  './game.html',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(
        CORE.concat(EXTRA).map((u) => c.add(u).catch(() => null))
      ))
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

function isHtmlRequest(req, url) {
  if (req.mode === 'navigate') return true;
  if (url.pathname.endsWith('/')) return true;
  return /\.html?$/i.test(url.pathname);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 页面：网络优先（更新立刻生效），失败再退回缓存
  if (isHtmlRequest(req, url)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  // 静态资源：缓存优先
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      });
    })
  );
});

// 让页面可以在 SW 更新后自动刷新
self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
