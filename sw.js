const CACHE_NAME = 'nodal-ai-cache-v1';

// Static asset manifest mapping local files and external CDNs
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/styles.css',
    '/scripts/main.js',
    '/scripts/helpers.js',
    '/scripts/state.js',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.11.338/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/tone/14.7.77/Tone.js',
    'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js',
    'https://js.puter.com/v2/',
    'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.5.0/lz-string.min.js'
];

// 1. Install Event: Cache all critical assets immediately
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching Application Shell and Assets');
            return cache.addAll(ASSETS_TO_CACHE);
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Sweep away any outdated caches from previous system builds
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Evicting Old Cache Storage:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event: Intercept lookups with a Cache-First falling back to Network strategy
self.addEventListener('fetch', (event) => {
    // Bypass service worker interception completely for network-only Puter cloud operations
    if (event.request.url.includes('puter.com') || event.request.url.includes('js.puter.com/v2/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Serve saved asset instantly
            }
            
            return fetch(event.request).then((networkResponse) => {
                // If it's a valid local resource call, dynamically add it to the cache cache
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Quietly fail asset fetches when entirely detached from network endpoints
                return new Response('Network request failed and asset not found in cache.', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});