const CACHE = 'okan-sah-stok-v8'

const START_FILES = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg'
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(START_FILES))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    const hadOldCache = keys.some(key => key !== CACHE)

    await Promise.all(
      keys
        .filter(key => key !== CACHE)
        .map(key => caches.delete(key))
    )

    await self.clients.claim()

    // Yeni sürüm geldiğinde açık PWA penceresini bir kez yenile.
    // Böylece iPhone ana ekran uygulaması eski JS'i göstermeye devam etmez.
    if(hadOldCache){
      const windows = await self.clients.matchAll({
        type:'window',
        includeUncontrolled:true
      })

      await Promise.all(
        windows.map(client => {
          if('navigate' in client){
            return client.navigate(client.url).catch(() => null)
          }
          return null
        })
      )
    }
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request

  if(request.method !== 'GET') return

  const url = new URL(request.url)

  // Supabase ve diğer dış servisleri cache'e alma
  if(url.origin !== self.location.origin) return

  if(request.mode === 'navigate'){
    const networkRequest = fetch(request)
      .then(response => {
        if(response && response.ok){
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put('/', copy))
        }
        return response
      })

    // Wi-Fi bağlı görünüp internet cevabı gecikirse uygulamayı bekletme.
    // 1.5 saniye içinde ağ dönmezse son çalışan sayfayı aç;
    // ağ cevabı arkada gelirse cache yine güncellenir.
    const fastFallback = new Promise(resolve => {
      setTimeout(async () => {
        const cached = await caches.match('/')
        resolve(cached || networkRequest)
      }, 1500)
    })

    event.respondWith(
      Promise.race([networkRequest, fastFallback])
        .catch(() => caches.match('/'))
    )

    event.waitUntil(networkRequest.catch(() => {}))
    return
  }

  // Vite'ın hash'li JS/CSS dosyalarını hızlı aç.
  // Yeni build'de dosya adları değiştiği için eski dosya yeni sürümü engellemez.
  event.respondWith(
    caches.match(request).then(cached => {
      if(cached) return cached

      return fetch(request).then(response => {
        if(response && response.ok){
          const copy = response.clone()
          caches.open(CACHE).then(cache => cache.put(request, copy))
        }
        return response
      })
    })
  )
})

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {}

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Okan-Şah Gıda',
      {
        body: data.body || 'Yeni bir stok bildiriminiz var.',
        icon: '/icon.svg',
        badge: '/icon.svg',
        data: data.data || {},
        tag: data.tag || undefined
      }
    )
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()

  event.waitUntil(
    clients
      .matchAll({
        type:'window',
        includeUncontrolled:true
      })
      .then(list => {
        for(const client of list){
          if('focus' in client){
            client.navigate('/?tab=expiry')
            return client.focus()
          }
        }

        if(clients.openWindow){
          return clients.openWindow('/?tab=expiry')
        }
      })
  )
})
