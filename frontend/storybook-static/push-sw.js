/* global clients */
// Web Push handlers for Trivela (issue #619).
//
// This file is imported into the Workbox-generated service worker via
// vite.config.js (`workbox.importScripts: ['push-sw.js']`), so it runs in the
// service-worker context. It renders incoming pushes as notifications and
// focuses/opens the app when one is clicked.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Trivela', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'Trivela';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(targetUrl) : undefined;
    }),
  );
});
