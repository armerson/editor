// QuickCut Match — Service Worker
// Strategy: stale-while-revalidate for same-origin GET requests.
// Cross-origin requests (render API, Firebase, CDN) are never cached.

const CACHE = 'quickcut-v1'

// Pre-cache the app shell on install so the app opens offline
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add('/')))
  self.skipWaiting()
})

// Delete old cache versions on activate
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

// Stale-while-revalidate: serve cached immediately, update cache from network
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  // Only cache same-origin (skip API, Firebase, Jamendo, etc.)
  if (new URL(e.request.url).origin !== self.location.origin) return

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(e.request)
      const networkFetch = fetch(e.request).then((res) => {
        if (res.ok) cache.put(e.request, res.clone())
        return res
      }).catch(() => null)
      return cached ?? await networkFetch
    })
  )
})
