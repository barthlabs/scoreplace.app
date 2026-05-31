// scoreplace.app — Service Worker
// Cache-first for static assets, network-first for API/Firebase
// Also handles FCM push notification background messages

// Import Firebase Messaging SW scripts for background push handling
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Initialize Firebase in the service worker context
firebase.initializeApp({
  apiKey: "AIzaSyB7AyOojV_Pm50Kr7bovVY4jVTTNbKOK0A",
  authDomain: "scoreplace-app.firebaseapp.com",
  projectId: "scoreplace-app",
  storageBucket: "scoreplace-app.firebasestorage.app",
  messagingSenderId: "382268772878",
  appId: "1:382268772878:web:7c164933f3beacba4be25f"
});

// Handle background push notifications
var messaging = firebase.messaging();
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background push received:', payload);
  var title = (payload.notification && payload.notification.title) || 'scoreplace.app';
  var body = (payload.notification && payload.notification.body) || '';
  var link = (payload.data && payload.data.link) || '/';
  return self.registration.showNotification(title, {
    body: body,
    icon: '/icons/icon-192.svg',
    badge: '/icons/icon-192.svg',
    data: { url: link },
    vibrate: [200, 100, 200]
  });
});

// Handle notification click — open the app at the relevant tournament
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // If app is already open, focus it and navigate
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if (client.url.indexOf(self.location.origin) === 0 && 'focus' in client) {
          client.focus();
          if (url !== '/') client.navigate(url);
          return;
        }
      }
      // Otherwise open a new window
      return clients.openWindow(url);
    })
  );
});

var CACHE_NAME = 'scoreplace-v1.8.75-beta';
// NOTE: js/release-notes.js NÃO entra aqui de propósito — é lazy-loaded só
// quando o usuário abre "Notas de versões" no Help. Adicioná-lo ao precache
// faria cache.addAll baixar 1MB durante o SW install, anulando o ganho do
// lazy-load. O fetch handler runtime (network-first p/ same-origin) cacheia
// na primeira solicitação de quem realmente abre o changelog.
var STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/css/components.css',
  '/css/layout.css',
  '/css/bracket.css',
  '/css/responsive.css',
  '/css/trophies.css',
  '/js/theme.js',
  '/js/sentry-init.js',
  '/js/logger.js',
  '/js/analytics.js',
  '/js/notification-catalog.js',
  '/js/store.js',
  '/js/firebase-db.js',
  '/js/notifications.js',
  '/js/ui.js',
  '/js/router.js',
  '/js/main.js',
  '/js/views/dashboard.js',
  '/js/views/tournaments-utils.js',
  '/js/views/tournaments-sharing.js',
  '/js/views/tournaments-analytics.js',
  '/js/views/tournaments-organizer.js',
  '/js/views/tournaments.js',
  '/js/views/create-tournament.js',
  '/js/views/pre-draw.js',
  '/js/views/bracket-logic.js',
  '/js/views/bracket-model.js',
  '/js/views/bracket.js',
  '/js/views/bracket-ui.js',
  '/js/views/participants.js',
  '/js/views/rules.js',
  '/js/views/explore.js',
  '/js/views/notifications-view.js',
  '/js/views/auth.js',
  '/js/views/host-transfer.js',
  '/js/views/tournaments-categories.js',
  '/js/views/tournaments-enrollment.js',
  '/js/views/tournaments-enrollment-report.js',
  '/js/views/tournaments-draw-prep.js',
  '/js/views/tournaments-draw.js',
  '/js/views/landing.js',
  '/js/views/privacy.js',
  '/js/views/terms.js',
  '/js/views/terms-acceptance.js',
  '/js/trophy-catalog.js',
  '/js/trophies.js',
  '/js/views/trophies-view.js',
  '/js/views/arbitros.js',

  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
  '/icons/logo-podium.svg',
  '/icons/logo-wordmark.svg'
];

// Domains that should NEVER be cached (APIs, auth, real-time data)
var NO_CACHE_PATTERNS = [
  'firestore.googleapis.com',
  'firebase',
  'identitytoolkit',
  'securetoken',
  'googleapis.com/identitytoolkit',
  'maps.googleapis.com',
  'openweathermap.org'
];

// Listen for skip waiting message from the page
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Install: pre-cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Pre-cache partial fail:', err);
      });
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: network-first for API, cache-first for static
self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API/Firebase/auth requests — always network
  for (var i = 0; i < NO_CACHE_PATTERNS.length; i++) {
    if (url.indexOf(NO_CACHE_PATTERNS[i]) !== -1) return;
  }

  // Skip chrome-extension and other non-http
  if (url.indexOf('http') !== 0) return;

  // For same-origin static assets: network-first (always try fresh, fallback to cache)
  if (url.indexOf(self.location.origin) === 0) {
    event.respondWith(
      fetch(event.request).then(function(response) {
        if (response && response.status === 200) {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function() {
        // Network failed — fallback to cache (offline support)
        return caches.match(event.request);
      })
    );
    return;
  }

  // For third-party assets: cache-first with network fallback
  if (url.indexOf('http') === 0) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(response) {
          if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // External resources (fonts, CDN): cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request).then(function(response) {
        if (response && response.status === 200 && response.type !== 'opaque') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
