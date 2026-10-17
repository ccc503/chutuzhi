// 离线缓存：把 App 外壳（HTML/JS/图标）全存下来，装到桌面后断网也能开
// ⚠️ 只碰【同源 GET】—— 大模型接口是别的域名，绝不能拦、也不能缓存
// ⚠️ 改了任何一个 index.html / *.js 都要把这个版本号 +1 —— 否则老用户永远吃缓存
const CACHE = 'chutuzhi-chat-v5';
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './ref_draw.js', './data.js', './cap_rules.js', './prompts.js',
  './lib.js', './capability.js', './render.js', './llm.js', './agent.js', './app.js',
  './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;   // 接口跨域 → 完全不拦

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const cp = resp.clone();
          caches.open(CACHE).then((c) => c.put(req, cp)).catch(() => {});
        }
        return resp;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
