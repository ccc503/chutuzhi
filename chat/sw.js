// 离线缓存：把 App 外壳（HTML/JS/图标）全存下来，装到桌面后断网也能开
// ⚠️ 只碰【同源 GET】—— 大模型接口是别的域名，绝不能拦、也不能缓存
// ⚠️ 改了任何一个 index.html / *.js 都要把 CACHE 版本号 +1 —— 否则老用户永远吃缓存
//
// ⭐⭐ 两个线上真踩的坑（2026-10-17）：
// ① Cache Storage 是【整个 origin 共享】的 —— 同一个 ccc503.github.io 下面还有根目录那个点选版。
//    activate 里以前写 `filter(k => k !== CACHE)` 会把点选版的缓存一起删 → 开聊天版就把点选版的离线包废了。
//    现在：只删自己前缀（chutuzhi-chat-）的旧版。
// ② 绝不能用全局 `caches.match(req)` —— 它按缓存创建顺序在所有缓存里找，旧版本先命中 →
//    文件更新了用户还拿几个月前的。必须 `caches.open(自己那个).match(...)`。
const PREFIX = 'chutuzhi-chat-';
const CACHE = PREFIX + 'v9';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './ref_draw.js', './data.js', './cap_rules.js', './prompts.js',
  './lib.js', './capability.js', './render.js', './llm.js', './agent.js', './app.js',
  './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];

// 只在自己这个缓存里查
const LOOKUP = (req, opt) => caches.open(CACHE).then((c) => c.match(req, opt));

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // ⭐⭐ `cache: 'reload'` 必须加！GitHub Pages 给 index.html 带 `Cache-Control: max-age=600`，
      //     不加的话 addAll 会直接吃【浏览器 HTTP 缓存里那份旧的】存进新缓存 →
      //     版本号明明变了，用户拿到的内容还是几个月前的（2026-10-17 线上真踩，v7 缓存里躺着旧页面）
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      // ⭐ 只清自己前缀的旧版；chutuzhi-site-* 是点选版的，不许动
      .then((ks) => Promise.all(
        ks.filter((k) => k.indexOf(PREFIX) === 0 && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;   // 接口跨域 → 完全不拦

  e.respondWith(
    LOOKUP(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const cp = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        }
        return resp;
      }).catch(() => LOOKUP('./index.html'));
    })
  );
});
