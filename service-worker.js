// 离线缓存 Service Worker：缓存全部应用资源，实现离线可用
const CACHE_NAME = "service-report-cache-v12";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/company-data.js",
  "./js/db.js",
  "./js/report-number.js",
  "./js/template-render.js",
  "./js/sync-config.js",
  "./js/sync.js",
  "./js/app.js",
  "./vendor/signature_pad.umd.min.js",
  "./vendor/html2canvas.min.js",
  "./vendor/jspdf.umd.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/logos/logo-STD.png",
  "./icons/logos/logo-ZKPY.png",
  "./icons/logos/logo-SSTD.png"
];

self.addEventListener("install", (event) => {
  // 新版本先在后台把新资源缓存好，但不立即接管页面，
  // 等页面里的"立即更新"按钮被点击（收到 SKIP_WAITING 消息）后才切换。
  //
  // 关键点：这里不用 cache.addAll(ASSETS)，而是对每个资源单独用
  // fetch(url, { cache: "reload" }) 强制绕过浏览器自己的HTTP缓存去请求。
  // 原因：cache.addAll() 内部用的是普通fetch，会遵守浏览器HTTP缓存（比如
  // GitHub Pages给静态文件设置的Cache-Control）。如果工程师前一次访问时
  // 浏览器已经把某个文件（比如app.js/css）缓存了一段时间，即使这次
  // service-worker.js本身检测到了变化、触发了安装，安装过程中重新抓取
  // app.js/css时仍然可能从浏览器的HTTP缓存里拿到旧内容，把"旧内容"当成
  // "新版本"缓存进Cache Storage——导致SW明明触发了更新，实际缓存进去的
  // 还是旧的，症状就是"点了更新、也刷新了，但内容还是没变"。
  // { cache: "reload" } 强制每次都真正从服务器网络请求最新内容，从根本上
  // 避免这个问题。
  //
  // Key point: instead of cache.addAll(ASSETS), each asset is fetched
  // individually with { cache: "reload" } to force bypassing the browser's
  // own HTTP cache. cache.addAll() uses a plain fetch() internally, which
  // still respects normal HTTP caching (e.g. GitHub Pages' Cache-Control
  // headers for static files). If the browser had already cached an asset
  // like app.js/css from an earlier visit, install could silently re-fetch
  // that STALE copy even though service-worker.js itself was correctly
  // detected as changed — so the update appears to happen, but the actual
  // cached content never changes. { cache: "reload" } forces a genuine
  // fresh network fetch every time, eliminating that failure mode.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        ASSETS.map((url) =>
          fetch(url, { cache: "reload" }).then((resp) => {
            if (!resp.ok) throw new Error("SW install: failed to fetch " + url + " (status " + resp.status + ")");
            return cache.put(url, resp);
          })
        )
      )
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first, 回退到网络；导航请求失败时回退到 index.html
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          return resp;
        })
        .catch(() => {
          if (event.request.mode === "navigate") return caches.match("./index.html");
        });
    })
  );
});
