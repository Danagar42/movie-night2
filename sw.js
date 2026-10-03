const CACHE_NAME = 'movie-night-v3';
const STATIC_ASSETS = [
    './',
    './index.html'
];

// Встановлення: кешуємо основні ресурси
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Активація: видаляємо старі кеші
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

// Стратегія: Network First для HTML/API, Cache First для статики
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // API запити — тільки мережа, без кешування
    if (url.hostname.includes('generativelanguage.googleapis.com') ||
        url.hostname.includes('api.themoviedb.org') || url.pathname.includes('/api/') || url.pathname.includes('recommend')) {
        return; // дозволяємо fetch працювати нативно
    }

    // Зображення TMDB — Cache First (постери рідко змінюються)
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

    // HTML та інша статика — Network First з фолбеком на кеш
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

