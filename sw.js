const CACHE_NAME = 'movie-night-v6';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './tmdb-logo.svg',
    './icons/icon-180.png',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/no-poster.svg',
    './assets/dogs/philip-1.png',
    './assets/dogs/philip-2.png',
    './assets/dogs/philip-3.png',
    './assets/dogs/philip-4.png',
    './assets/dogs/philip-5.png',
    './assets/dogs/philip-6.png',
    './assets/dogs/philip-7.png',
    './assets/dogs/philip-8.png',
    './assets/dogs/philip-9.png',
    './assets/dogs/philip-10.png',
    './assets/dogs/philip-11.png',
    './assets/dogs/philip-12.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.hostname.includes('generativelanguage.googleapis.com') ||
        url.hostname.includes('api.themoviedb.org') || url.pathname.includes('/api/') || url.pathname.includes('recommend')) {
        return;
    }

    if (url.hostname === 'image.tmdb.org') {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(() => new Response('', { status: 404 }));
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
