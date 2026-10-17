/* 出图纸 —— Service Worker
   ⭐ 为什么要它：Android 的 Chrome 只有在「HTTPS + 有 manifest + 有带 fetch 的 SW」三条都满足时，
      才会给「安装应用」按钮 → 才能变成桌面真图标（没有地址栏）。
      顺带把整页缓存下来，装上以后【断网也能用】。

   ⚠️ 改内容后必须改下面的版本号（build_pwa.py 会自动打时间戳），否则手机拿的还是旧的。
*/
const VER = 'chutuzhi-__V__';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-180.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VER)
      .then((c) => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 打开页面：先给缓存里的首页（离线也能开）
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('./index.html').then((h) => h || fetch(req).catch(() => caches.match('./')))
    );
    return;
  }

  // 其它资源：缓存优先，没有再去网上拿，拿到就存起来
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          try {
            if (res && res.ok && new URL(req.url).origin === self.location.origin) {
              const cp = res.clone();
              caches.open(VER).then((c) => c.put(req, cp));
            }
          } catch (_) { /* 跨域或者 URL 解析失败就跳过缓存 */ }
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
