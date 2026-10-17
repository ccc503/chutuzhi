/* 出图纸 —— Service Worker（点选版 / 根目录）
   ⭐ 为什么要它：Android 的 Chrome 只有在「HTTPS + 有 manifest + 有带 fetch 的 SW」三条都满足时，
      才会给「安装应用」按钮 → 才能变成桌面真图标（没有地址栏）。
      顺带把整页缓存下来，装上以后【断网也能用】。

   ⚠️ 改内容后必须改 __V__（build_pwa.py 会自动换成内容指纹），否则手机拿的还是旧的。

   ⭐⭐ 两个必须记住的坑（2026-10-17 线上真踩）：
   ① Cache Storage 是【整个 origin 共享】的 —— 同一个 ccc503.github.io 下面还挂着 /chat/ 那个聊天版。
      所以 activate 里 **只能删自己前缀（chutuzhi-site-）的旧缓存**，
      以前写 `filter(k => k !== VER)` 会把聊天版的缓存一起删掉 → 开一个 App 就把另一个的离线包废了。
   ② **绝不能用全局 `caches.match(req)`** —— 它会按缓存创建顺序在所有缓存里找，
      老的旧版本缓存会先命中 → 改了文件用户永远拿旧的。
      必须 `caches.open(自己那个).match(...)`。
*/
const PREFIX = 'chutuzhi-site-';
const VER = PREFIX + '18ab4bb1237e';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './icon-180.png'
];

// 只在自己这个缓存里查
const LOOKUP = (req, opt) => caches.open(VER).then((c) => c.match(req, opt));

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
      // ⭐ 只清自己前缀的旧版；别的前缀（chutuzhi-chat-*）是人家的，不许动
      .then((ks) => Promise.all(
        ks.filter((k) => k.indexOf(PREFIX) === 0 && k !== VER).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 打开页面：先给缓存里的首页（离线也能开）
  if (req.mode === 'navigate') {
    e.respondWith(
      LOOKUP('./index.html').then((h) => h || fetch(req).catch(() => LOOKUP('./')))
    );
    return;
  }

  // 其它资源：缓存优先，没有再去网上拿，拿到就存起来
  e.respondWith(
    LOOKUP(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          try {
            if (res && res.ok && new URL(req.url).origin === self.location.origin) {
              const cp = res.clone();
              caches.open(VER).then((c) => c.put(req, cp)).catch(() => {});
            }
          } catch (_) { /* 跨域或者 URL 解析失败就跳过缓存 */ }
          return res;
        })
        .catch(() => LOOKUP('./index.html'));
    })
  );
});
