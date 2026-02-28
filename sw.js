/**
 * AI Rural Road Pothole Reporter - Service Worker
 * Provides offline support and caching
 */

const CACHE_NAME = 'pothole-reporter-v1';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/manifest.json',
    '/data/villages.json'
];

const MODEL_ASSETS = [
    '/model/model.json',
    '/model/metadata.json',
    '/model/weights.bin'
];

const EXTERNAL_ASSETS = [
    'https://fonts.googleapis.com/css2?family=Noto+Sans+Telugu:wght@400;600;700&family=Roboto:wght@400;500;700&display=swap',
    'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js'
];

// ============================================
// INSTALL EVENT
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[SW] Caching model assets');
                return caches.open(CACHE_NAME + '-model')
                    .then(modelCache => modelCache.addAll(MODEL_ASSETS));
            })
            .then(() => {
                console.log('[SW] Caching external assets');
                return caches.open(CACHE_NAME + '-external')
                    .then(extCache => {
                        // Cache external assets with individual fetch to handle failures gracefully
                        return Promise.all(
                            EXTERNAL_ASSETS.map(url => 
                                fetch(url, { mode: 'no-cors' })
                                    .then(response => extCache.put(url, response))
                                    .catch(err => console.log('[SW] Failed to cache:', url, err))
                            )
                        );
                    });
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Installation failed:', error);
            })
    );
});

// ============================================
// ACTIVATE EVENT
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => {
                            return name.startsWith('pothole-reporter-') && 
                                   name !== CACHE_NAME &&
                                   name !== CACHE_NAME + '-model' &&
                                   name !== CACHE_NAME + '-external';
                        })
                        .map((name) => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH EVENT
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Strategy: Cache First for static assets
    if (isStaticAsset(url)) {
        event.respondWith(cacheFirst(request, CACHE_NAME));
        return;
    }
    
    // Strategy: Cache First for model files
    if (isModelAsset(url)) {
        event.respondWith(cacheFirst(request, CACHE_NAME + '-model'));
        return;
    }
    
    // Strategy: Stale While Revalidate for external assets
    if (isExternalAsset(url)) {
        event.respondWith(staleWhileRevalidate(request, CACHE_NAME + '-external'));
        return;
    }
    
    // Strategy: Network First for API calls
    if (url.pathname.includes('/api/')) {
        event.respondWith(networkFirst(request));
        return;
    }
    
    // Default: Network with cache fallback
    event.respondWith(networkWithCacheFallback(request));
});

// ============================================
// CACHING STRATEGIES
// ============================================

// Cache First Strategy
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
        return cachedResponse;
    }
    
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        return new Response('Offline - Content not available', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    }
}

// Stale While Revalidate Strategy
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cachedResponse = await cache.match(request);
    
    const fetchPromise = fetch(request, { mode: 'no-cors' })
        .then((networkResponse) => {
            if (networkResponse.ok) {
                cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        })
        .catch((error) => {
            console.log('[SW] Network fetch failed, using cache:', error);
            return cachedResponse;
        });
    
    return cachedResponse || fetchPromise;
}

// Network First Strategy
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', error);
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        throw error;
    }
}

// Network with Cache Fallback
async function networkWithCacheFallback(request) {
    try {
        const networkResponse = await fetch(request);
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', error);
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            return cachedResponse;
        }
        
        throw error;
    }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function isStaticAsset(url) {
    const staticPaths = ['/', '/index.html', '/style.css', '/app.js', '/manifest.json', '/data/villages.json'];
    return staticPaths.includes(url.pathname);
}

function isModelAsset(url) {
    return url.pathname.startsWith('/model/');
}

function isExternalAsset(url) {
    return url.hostname === 'fonts.googleapis.com' || 
           url.hostname === 'fonts.gstatic.com' ||
           url.hostname === 'cdn.jsdelivr.net';
}

// ============================================
// BACKGROUND SYNC (for future use)
// ============================================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-reports') {
        console.log('[SW] Background sync triggered');
        event.waitUntil(syncReports());
    }
});

async function syncReports() {
    // This would sync pending reports when back online
    // Implementation depends on IndexedDB structure in main app
    console.log('[SW] Syncing reports...');
}

// ============================================
// PUSH NOTIFICATIONS (for future use)
// ============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    const options = {
        body: event.data ? event.data.text() : 'New notification',
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            url: '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('Pothole Reporter', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked:', event);
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

// ============================================
// MESSAGE HANDLING
// ============================================
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

console.log('[SW] Service Worker loaded');
