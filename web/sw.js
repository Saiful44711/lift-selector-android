// Only the packaged public interface is cached. API responses are never cached here.
const CACHE='lift-interface-v3';
const ASSETS=['./','./index.html','./style.css','./shell.css','./app.js','./ui-helpers.js','./company-logo.png','./transport.js','./logic.js','./native.js','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lift-interface-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const pathname=new URL(event.request.url).pathname;
 if(!ASSETS.some(asset=>new URL(asset,self.registration.scope).pathname===pathname))return;
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request).then(response=>response||Promise.reject(new Error('Interface asset unavailable offline')))));
});
