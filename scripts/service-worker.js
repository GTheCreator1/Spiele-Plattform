const scope = self.registration.scope
const prefix = `stichrunde:${scope}:`
const cacheName = prefix + build
const indexUrl = new URL('index.html', scope).href
const urls = new Set(assets.map((asset) => new URL(asset, scope).href))

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...urls])))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((key) => key.startsWith(prefix) && key !== cacheName).map((key) => caches.delete(key)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET' || !request.url.startsWith(scope)) return
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request)
      } catch {
        const cache = await caches.open(cacheName)
        return await cache.match(indexUrl) ?? Response.error()
      }
    })())
    return
  }
  if (urls.has(request.url)) {
    // The build allowlist contains identical public files for every request origin.
    event.respondWith(caches.open(cacheName).then(async (cache) => await cache.match(request, { ignoreVary: true }) ?? fetch(request)))
  }
})
