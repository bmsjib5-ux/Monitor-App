/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Take control immediately
self.skipWaiting();
clientsClaim();

// Clean old caches
cleanupOutdatedCaches();

// Precache all assets built by Vite
precacheAndRoute(self.__WB_MANIFEST);

// Runtime caching for Supabase API
registerRoute(
  ({ url }) => url.hostname.includes('supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 5, // 5 minutes
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Runtime caching for local API
registerRoute(
  ({ url }) => url.pathname.startsWith('/api'),
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 2, // 2 minutes
      }),
      new CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Cache images
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
      }),
    ],
  })
);

// =============================================
// Push Notification Handling
// =============================================

// Handle push events
self.addEventListener('push', (event: PushEvent) => {
  console.log('[SW] Push received:', event);

  if (!event.data) {
    console.log('[SW] No data in push event');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[SW] Push data:', data);

    const title = data.title || 'MonitorApp Alert';
    const options = {
      body: data.body || '',
      icon: data.icon || '/Monitor-App/pwa-192x192.png',
      badge: data.badge || '/Monitor-App/pwa-192x192.png',
      tag: data.tag || 'monitorapp-notification',
      data: data.data || {},
      requireInteraction: data.requireInteraction !== false,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'view', title: 'ดู' },
        { action: 'dismiss', title: 'ปิด' }
      ]
    } as NotificationOptions;

    event.waitUntil(
      self.registration.showNotification(title, options)
    );
  } catch (error) {
    console.error('[SW] Error processing push:', error);

    // Fallback to simple notification
    const text = event.data?.text() || 'New notification';
    event.waitUntil(
      self.registration.showNotification('MonitorApp Alert', {
        body: text,
        icon: '/Monitor-App/pwa-192x192.png'
      })
    );
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  console.log('[SW] Notification clicked:', event);

  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};

  if (action === 'dismiss') {
    return;
  }

  // Determine URL to open
  let url = '/Monitor-App/';
  if (data.url) {
    url = data.url;
  } else if (data.alert_id) {
    url = `/Monitor-App/?alert=${data.alert_id}`;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Check if there's already an open window
        for (const client of clientList) {
          if (client.url.includes('/Monitor-App') && 'focus' in client) {
            client.focus();
            return client;
          }
        }
        // Open new window if none found
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
      })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event: NotificationEvent) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', ((_event: Event) => {
  console.log('[SW] Push subscription changed');
  // The subscription will be re-created by the client
}) as EventListener);

console.log('[SW] Service Worker loaded with Push support');
