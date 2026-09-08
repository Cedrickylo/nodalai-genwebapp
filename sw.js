// Incremented to v37 for September 9 changelog, desktop PWA window frame controls, and 30/60/90/120Hz adaptive header transitions
const CACHE_NAME = 'nodal-ai-cache-v37';
const OFFLINE_QUIZ_CACHE = 'nodal-offline-quizzes-v1';

// Pre-cache core local files to ensure stable installation and reliable offline mode
const LOCAL_ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css',
    '/scripts/main.js',
    '/scripts/helpers.js',
    '/scripts/state.js',
    '/scripts/aiService.js',
    '/scripts/quiz.js',
    '/scripts/quiz/fileHandling.js',
    '/scripts/quiz/quizExecution.js',
    '/scripts/quiz/quizGeneration.js',
    '/scripts/quiz/quizHistory.js',
    '/scripts/quiz/quizResults.js',
    '/scripts/quiz/quizUtils.js',
    '/scripts/quiz/quizStatistics.js',
    '/scripts/quiz/quizOffline.js',
    '/scripts/quiz/quizMigration.js',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/icon-maskable-192.png',
    '/icons/icon-maskable-512.png',
    '/icons/icon-180.png'
];

// List of allowed external CDNs to be automatically cached dynamically at runtime
const ALLOWED_CDN_ORIGINS = [
    'cdn.tailwindcss.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com',
    'js.puter.com'
];

// 1. Install Event: Pre-cache local application framework files & immediately skip waiting
self.addEventListener('install', (event) => {
    console.log('[Service Worker v22] Installing & Pre-caching Core Assets');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const asset of LOCAL_ASSETS_TO_CACHE) {
                try {
                    await cache.add(asset);
                } catch (err) {
                    console.warn(`[Service Worker v22] Failed to pre-cache ${asset}:`, err);
                }
            }
        }).then(() => self.skipWaiting())
    );
});

// 2. Activate Event: Flush deprecated caches from previous versions and claim clients
self.addEventListener('activate', (event) => {
    console.log('[Service Worker v22] Activating & Evicting Deprecated Caches');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME && cache !== OFFLINE_QUIZ_CACHE) {
                        console.log('[Service Worker v22] Evicting Deprecated Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim()).then(async () => {
            // Notify existing open tabs about the update
            try {
                const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
                for (const client of clients) {
                    client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
                }
            } catch (err) {
                console.warn('[Service Worker v22] Notification warning during activate:', err);
            }
        })
    );
});

self.addEventListener('message', (event) => {
    if (!event.data) return;

    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'CACHE_OFFLINE_QUIZ') {
        const { quizKey, quizData, takesData, expiresAt } = event.data;
        if (quizKey && quizData) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                const quizPayload = {
                    ...quizData,
                    cachedAt: Date.now(),
                    expiresAt
                };
                cache.put(
                    new Request(`/api/offline-quiz/${encodeURIComponent(quizKey)}`),
                    new Response(JSON.stringify(quizPayload), {
                        headers: { 'Content-Type': 'application/json' }
                    })
                );
                if (takesData) {
                    cache.put(
                        new Request(`/api/offline-takes/${encodeURIComponent(quizKey)}`),
                        new Response(JSON.stringify(takesData), {
                            headers: { 'Content-Type': 'application/json' }
                        })
                    );
                }
            }).catch(err => console.error('[SW] Failed to cache offline quiz:', err));
        }
    } else if (event.data.type === 'REMOVE_OFFLINE_QUIZ') {
        const { quizKey } = event.data;
        if (quizKey) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                cache.delete(new Request(`/api/offline-quiz/${encodeURIComponent(quizKey)}`));
                cache.delete(new Request(`/api/offline-takes/${encodeURIComponent(quizKey)}`));
            }).catch(err => console.error('[SW] Failed to delete offline quiz:', err));
        }
    } else if (event.data.type === 'PRUNE_EXPIRED_QUIZZES') {
        const { expiredKeys } = event.data;
        if (Array.isArray(expiredKeys)) {
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => {
                expiredKeys.forEach(k => {
                    cache.delete(new Request(`/api/offline-quiz/${encodeURIComponent(k)}`));
                    cache.delete(new Request(`/api/offline-takes/${encodeURIComponent(k)}`));
                });
            }).catch(err => console.error('[SW] Failed to prune offline quizzes:', err));
        }
    }
});

// ==================================================================
// RESILIENT NETWORK & CACHING HELPERS (v22)
// ==================================================================

/**
 * Executes a network fetch with an AbortController timeout guard.
 * Prevents hanging infinitely when internet modems/routers or firewalls drop packets.
 * @param {Request|string} request 
 * @param {number} timeoutMs 
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(request, timeoutMs = 2500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(request, { signal: controller.signal });
        clearTimeout(timer);
        return response;
    } catch (err) {
        clearTimeout(timer);
        throw err;
    }
}

/**
 * Handles local assets (HTML, CSS, JS, icons).
 * Strategy: Cache-First / Stale-While-Revalidate with Fast Timeout.
 * - If cached on device: returns offline copy immediately (< 5ms).
 * - Background revalidates with a 2.5s timeout. If modem is blocked or offline, silently aborts.
 * - If not yet cached: attempts network with 4s timeout guard, falling back to /index.html.
 * @param {Request} request 
 * @param {FetchEvent} event 
 * @returns {Promise<Response>}
 */
async function handleLocalRequest(request, event) {
    // 1. Check local cache first
    const cachedResponse = await caches.match(request);

    // If navigation request, check for exact match or cached /index.html / /
    const fallbackCached = (request.mode === 'navigate')
        ? (cachedResponse || await caches.match('/index.html') || await caches.match('/'))
        : cachedResponse;

    if (fallbackCached) {
        // Cached copy exists: return immediately to prevent infinite loading or hanging on blocked modems
        if (event && event.waitUntil) {
            event.waitUntil((async () => {
                try {
                    const networkResponse = await fetchWithTimeout(request, 2500);
                    if (networkResponse && networkResponse.status === 200) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put(request, networkResponse);
                    }
                } catch (e) {
                    // Slow network, modem blocked, or offline: ignore background update silently
                }
            })());
        }
        return fallbackCached;
    }

    // 2. Not cached yet (e.g. first visit before install completes)
    try {
        const networkResponse = await fetchWithTimeout(request, 4000);
        if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, responseToCache).catch(() => {});
        }
        return networkResponse;
    } catch (netErr) {
        if (request.mode === 'navigate') {
            const indexFallback = await caches.match('/index.html') || await caches.match('/');
            if (indexFallback) return indexFallback;
        }
        return new Response('Offline resource unavailable.', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

/**
 * Handles allowed CDN assets (Tailwind, Fonts, Cloudflare CDN libraries).
 * Strategy: Cache-First with Timeout Fallback.
 * @param {Request} request 
 * @returns {Promise<Response>}
 */
async function handleCDNRequest(request) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetchWithTimeout(request, 4000);
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            const responseToCache = networkResponse.clone();
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, responseToCache).catch(() => {});
        }
        return networkResponse;
    } catch (err) {
        return cachedResponse || new Response('CDN resource unavailable offline.', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// 3. Fetch Event: Instant Cache-First with 2.5s Background Revalidation for Local Assets
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = new URL(event.request.url);

    // Bypass background service worker mapping for internal Puter backend communication
    if (requestUrl.href.includes('puter.com') && !requestUrl.href.includes('js.puter.com/v2/')) {
        return;
    }

    // Bypass Vercel serverless API functions
    if (requestUrl.pathname.startsWith('/api/generate-quiz')) {
        return;
    }

    // Offline Quiz API requests
    if (requestUrl.pathname.startsWith('/api/offline-quiz/') || requestUrl.pathname.startsWith('/api/offline-takes/')) {
        event.respondWith(
            caches.open(OFFLINE_QUIZ_CACHE).then((cache) => cache.match(event.request))
        );
        return;
    }

    const isLocal = requestUrl.origin === self.location.origin;
    const isAllowedCDN = ALLOWED_CDN_ORIGINS.some(origin => requestUrl.hostname === origin);

    // Local files: Stale-While-Revalidate with Fast Timeout (instant load, never hang if blocked by modem)
    if (isLocal) {
        event.respondWith(handleLocalRequest(event.request, event));
        return;
    }

    // Allowed CDN assets: Cache-First with timeout protection
    if (isAllowedCDN) {
        event.respondWith(handleCDNRequest(event.request));
        return;
    }
});