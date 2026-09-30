// 票記 InvoiceSync — service worker: network-first, cache fallback (offline shell).
const CACHE='piaoji-v2';   // bump → activate 時自動刪除舊快取（避免鎖死舊版頁面）
const CORE=['./','index.html','manifest.webmanifest','icon-192.png','icon-512.png'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  // API responses (live lottery data) are never cached
  if(url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req).then(res=>{
      // HTML 永遠走網路、不存快取（避免鎖死舊版）；其他資源照舊快取供離線用
      if(res.ok && res.type==='basic' && !url.pathname.endsWith('.html')){
        const cp=res.clone();
        caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{});
      }
      return res;
    }).catch(()=>caches.match(req).then(r=>r||caches.match('./')))
  );
});
