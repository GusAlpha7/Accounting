const CACHE_NAME = 'ledger-app-v19'; // 建议升级版本号以触发更新
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  // --- 关键修复：必须预缓存核心依赖 ---
  // 如果不缓存这些，离线时即使加载了 HTML，页面也是空白的
  'https://cdn.jsdelivr.net/npm/react@18.2.0/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18.2.0/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.23.5/babel.min.js',
  'https://cdn.jsdelivr.net/npm/prop-types@15.8.1/prop-types.min.js',
  'https://cdn.jsdelivr.net/npm/recharts@2.10.3/umd/Recharts.js',
  'https://cdn.tailwindcss.com' 
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
        // 使用 addAll 如果有一个失败会导致整个 SW 安装失败
        // 这里加一个容错机制，尽可能缓存所有
        return Promise.all(
            ASSETS_TO_CACHE.map(url => {
                return cache.add(url).catch(err => console.error('预缓存失败:', url, err));
            })
        );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // 策略 1: HTML 文件 -> 网络优先 (失败则回退到缓存的 index.html)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('index.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
           const responseClone = response.clone();
           caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
           return response;
        })
        .catch(() => {
            // --- 关键修复 ---
            // 当网络失败时，无论请求的是 '/' 还是 '/index.html'
            // 我们都强制返回缓存中的 './index.html'
            return caches.match('./index.html');
        })
    );
    return;
  }

  // 策略 2: CDN 资源 -> 缓存优先
  if (url.hostname.includes('jsdelivr.net') || url.hostname.includes('tailwindcss.com')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request).then(networkResponse => {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return networkResponse;
        });
      })
    );
    return;
  }

  // 策略 3: 其他资源 -> 缓存优先
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});