// scoreplace.app — Service Worker
// Shell precacheado servido do cache (paint instantâneo), rede em segundo plano.
// Também exibe as notificações de push (FCM) quando o app está fechado.

// ⛔ NUNCA voltar a fazer `importScripts()` do Firebase aqui — nem em qualquer
// outro lugar do topo deste arquivo. FOI A CAUSA DA TELA BRANCA DE ~7s no cold
// start do PWA (relato 12/ago/2026, v1.8.34):
//
//   O SW é MORTO junto com o app. Em toda abertura fria ele é reavaliado do
//   zero, e NENHUM evento `fetch` é despachado antes de o topo do arquivo
//   terminar de rodar. Com os dois `importScripts('https://www.gstatic.com/…')`
//   síncronos aqui em cima, o topo dependia de DNS + TLS + download de dois
//   scripts de OUTRO domínio (≈20KB gzip, ~300ms cada em fibra; segundos no
//   4G com rádio dormindo) mais `initializeApp()` + `messaging()`. Só DEPOIS
//   disso o pedido do próprio index.html começava a ser respondido — e atrás
//   dele os 7 CSS e os 3 scripts de <head>, todos render-blocking. Enquanto
//   isso a tela fica BRANCA: nem o splash inline do index.html tinha chegado a
//   pintar. A 2ª abertura era mais rápida porque o gstatic já estava no cache
//   HTTP e o processo do SW às vezes ainda vivia.
//
// O SDK não é necessário: `sendPushNotification` (functions-autodraw/index.js)
// manda DATA-ONLY para a web, então o `push` chega como Web Push padrão e o
// payload é lido direto de `event.data.json()`. Sem SDK, o topo deste arquivo
// roda em ~1ms e o fetch da navegação sai na hora.

// Exibe a notificação de push. Handler NATIVO (registrado no topo, como o spec
// exige) — sem SDK, sem rede, sem I/O antes de poder responder fetch.
self.addEventListener('push', function(event) {
  // ⚠️ CONTRATO DATA-ONLY (espelha o comentário da CF `sendPushNotification`):
  // a mensagem web NÃO pode conter payload `notification` — se contiver, o
  // navegador exibe uma cópia automática ALÉM desta → notificação DUPLICADA.
  // Tudo (title/body/link/type/tournamentId/tag) viaja em `data`. O fallback
  // pra `notification` fica só por compat com mensagens antigas.
  var raw = {};
  try { raw = (event.data && event.data.json()) || {}; } catch (e) { raw = {}; }
  // O FCM entrega `{ data: {...}, from, fcmMessageId, ... }`. Algumas versões
  // aninham sob `firebase-messaging-msg-data`; os dois formatos são aceitos.
  var env = raw['firebase-messaging-msg-data'] || raw;
  var data = env.data || {};
  var note = env.notification || {};
  var title = data.title || note.title || 'scoreplace.app';
  var body = data.body || note.body || '';
  var link = data.link || (env.fcmOptions && env.fcmOptions.link) || '/';
  // `tag` estável: entregas repetidas (retry, multi-aba, race) substituem a
  // notificação anterior em vez de empilhar — só uma aparece na tela.
  var tag = data.tag || ('scoreplace|' + (data.type || '') + '|' + (data.tournamentId || ''));

  // ⚠️ APP ABERTO NA FRENTE = TOAST, NÃO NOTIFICAÇÃO DO SISTEMA.
  // Era o SDK do Firebase que fazia esta separação sozinho: com uma aba visível
  // ele NÃO disparava o `onBackgroundMessage`, e em vez disso entregava a
  // mensagem à página, onde o `messaging.onMessage` mostra o toast in-app. Sem
  // o SDK aqui, um `showNotification` incondicional passaria a somar
  // notificação do sistema AO toast — a mesma coisa aparecendo duas vezes, que
  // é exatamente o defeito que a v2.1.92 corrigiu. Ver [[project_notification_dedup]].
  // Então o SW refaz a separação: cliente visível → manda pra página (toast);
  // ninguém olhando → notificação do sistema.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      var visivel = list.filter(function(c) { return c.visibilityState === 'visible'; });
      if (visivel.length) {
        visivel.forEach(function(c) {
          c.postMessage({ type: 'SP_PUSH', data: data, notification: note });
        });
        return;
      }
      return self.registration.showNotification(title, {
        body: body,
        icon: '/icons/icon-192.svg',
        badge: '/icons/icon-192.svg',
        tag: tag,
        renotify: false,
        data: { url: link },
        vibrate: [200, 100, 200]
      });
    })
  );
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

var CACHE_NAME = 'scoreplace-v1.9.36';
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
  // v1.7.94: os DICIONÁRIOS entram no precache. Todo o TEXTO da interface sai daqui —
  // se `i18n-pt.js` não executa, `_t()` devolve a chave e a tela inteira vira
  // "landing.tagline"/"landing.feat1Title". Era o único bloco do caminho crítico fora
  // do precache, e o `ignoreSearch` do fallback (ver o fetch handler) é o que faz estas
  // entradas, gravadas sem `?v=`, casarem com a requisição versionada.
  '/js/i18n.js',
  '/js/i18n-pt.js',
  '/js/i18n-en.js',
  '/js/sentry-init.js',
  '/js/logger.js',
  '/js/analytics.js',
  '/js/notification-catalog.js',
  '/js/views/identity-core.js',
  '/js/views/persist-core.js',
  '/js/store.js',
  '/js/firebase-db.js',
  '/js/notifications.js',
  '/js/ui.js',
  '/js/router.js',
  '/js/main.js',
  '/js/deep-link.js',
  '/js/pwa-migrate-banner.js',
  '/js/views/dashboard.js',
  '/js/views/tournaments-utils.js',
  '/js/views/weather.js',
  '/js/views/tournaments-sharing.js',
  '/js/views/tournaments-analytics.js',
  '/js/views/tournaments-organizer.js',
  '/js/views/tournaments.js',
  '/js/views/sport-rules.js',
  '/js/views/create-tournament.js',
  '/js/views/bracket-logic.js',
  '/js/views/bracket-model.js',
  '/js/views/bracket.js',
  '/js/views/bracket-ui.js',
  '/js/views/phases-engine.js',
  '/js/views/phase-generators.js',
  '/js/views/team-formation.js',
  '/js/views/liga-substitution.js',
  '/js/views/wo-claim.js',
  '/js/views/wo-core.js',
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
  '/js/views/draw-decisions.js',
  '/js/views/draw-cores.js',
  '/js/views/tournaments-draw.js',
  '/js/views/landing.js',
  '/js/views/privacy.js',
  '/js/views/terms.js',
  '/js/views/delete-account.js',
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

// Lê o index.html recém-baixado e devolve as URLs VERSIONADAS (com `?v=`) dos
// css/js de mesma origem que ele referencia.
//
// POR QUE ISTO EXISTE: a lista STATIC_ASSETS acima é gravada SEM query
// (`/js/store.js`), mas a página sempre pede COM (`/js/store.js?v=1.8.34`).
// Sem esta etapa, o cache-first por URL exata nunca casaria na PRIMEIRA
// abertura depois de um deploy — justo a que o usuário faz logo em seguida —
// e ela voltaria a ser uma abertura 100% dependente da rede. Com ela, o SW
// novo já instala com as URLs exatas que a página vai pedir.
// (As entradas sem query continuam existindo: são elas que o fallback offline
// alcança via `ignoreSearch` — ver o comentário no fetch handler.)
// ⚠️ SÓ O QUE BLOQUEIA A PINTURA — o `<head>`. Isto já pegou TODO js/css com `?v=` da
// página (~90 arquivos) e os buscava de UMA VEZ (Promise.all). Como o `CACHE_NAME` muda a
// cada versão, TODA primeira abertura depois de um deploy disparava esse download inteiro
// COMPETINDO POR BANDA com a própria página — MEDIDO em produção (13/ago, 4G a 10Mbps):
// first-paint em 15.880ms na 1ª abertura contra 22ms na 2ª, com a folha de fontes levando
// 11.111ms *vinda do cache* (ou seja: a espera era fila, não rede). É a tela branca de
// volta, por um caminho diferente do que a 1.8.35 fechou.
// Os ~80 scripts `defer` do <body> NÃO precisam estar aqui: eles não seguram o primeiro
// pixel e entram no cache sozinhos, pelo runtime, na primeira vez que a página os pede.
function _versionedShellUrls(html) {
  var out = [];
  var head = html.split(/<\/head>/i)[0] || '';   // recorta o <head>: o resto é defer
  var re = /(?:src|href)\s*=\s*["']([^"']+\.(?:js|css)\?v=[^"']+)["']/g;
  var m;
  while ((m = re.exec(head)) !== null) {
    var u = m[1];
    if (u.indexOf('http') === 0 && u.indexOf(self.location.origin) !== 0) continue; // outra origem
    try { out.push(new URL(u, self.location.origin).href); } catch (e) {}
  }
  return out;
}
// Busca em SÉRIE (não Promise.all): mesmo curta, a lista não pode disputar banda com a
// página que está pintando. Um arquivo que falhe não derruba os outros.
function _cacheEmSerie(cache, urls) {
  return urls.reduce(function (p, u) {
    return p.then(function () { return cache.add(u).catch(function () {}); });
  }, Promise.resolve());
}

// Install: pre-cache static assets
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_ASSETS).catch(function(err) {
        console.warn('[SW] Pre-cache partial fail:', err);
      }).then(function() {
        // Segunda passada: as MESMAS coisas, sob a URL versionada que a página pede.
        // `cache.add` uma a uma (nunca addAll) pra que um arquivo que falhe não
        // derrube o precache inteiro.
        return fetch('/index.html', { cache: 'reload' }).then(function(r) {
          return r.ok ? r.text() : '';
        }).then(function(html) {
          if (!html) return;
          return _cacheEmSerie(cache, _versionedShellUrls(html));
        }).catch(function() {});
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

// Same-origin que AINDA NÃO ESTÁ no cache sob a URL exata: rede primeiro,
// cache como rede de segurança. É o caminho da primeira vez que cada arquivo é
// pedido (e de tudo que não faz parte do shell).
function _networkFirst(event) {
  // v1.3.64: requisição de NAVEGAÇÃO (documento HTML) força bypass do cache HTTP via
  // cache:'reload'. O index.html vem com max-age e SEM cache-buster no próprio HTML
  // → sem isto o SW podia servir HTML velho (JS travado na versão anterior).
  // Assets estáticos têm ?v= único, então não precisam. Ver [[project_pwa_auto_update]].
  var _isNav = (event.request.mode === 'navigate');
  var _fetchReq = _isNav
    ? new Request(event.request.url, { cache: 'reload', credentials: 'same-origin', redirect: 'follow' })
    : event.request;
  return fetch(_fetchReq).then(function(response) {
    if (response && response.status === 200) {
      var clone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(event.request, clone);
      });
    }
    return response;
  }).catch(function() {
    // Network failed — fallback to cache (offline support).
    //
    // v1.7.94 · `ignoreSearch` — POR QUE ISTO É O CONSERTO DA LANDING EM CHAVES CRUAS.
    // Todo asset carrega `?v=<versão>`, e o cache de runtime guarda a URL COM a query.
    // Então, no primeiro load DEPOIS de um deploy, as URLs são todas novas e
    // `caches.match(request)` (que casa a URL INTEIRA) não acha NADA — a versão
    // anterior está no cache sob outro `?v=`. Ou seja: exatamente na janela em que a
    // rede mais tropeça (troca de arquivos no servidor + SW novo purgando o cache
    // antigo), o fallback offline não existia e o script simplesmente não executava.
    // Quando quem não executa é `i18n-pt.js`, `_t()` devolve a CHAVE e a tela mostra
    // "landing.tagline"/"LANDING.CTA" — que é o print do dono em 10/ago, minutos
    // depois do deploy da 1.7.93 (o HTML servido estava correto, os arquivos vinham
    // 200, e um load limpo renderizava certo: era a janela de troca).
    // Com `ignoreSearch`, um fetch que falhou cai na ÚLTIMA cópia boa do mesmo
    // arquivo, mesmo que gravada sob outra versão. Servir um dicionário de uma versão
    // atrás é incomparavelmente melhor que servir a tela em chaves cruas — e isto só
    // roda quando a rede JÁ falhou; no caminho normal a rede manda.
    return caches.match(event.request, { ignoreSearch: true });
  });
}

// Fetch: shell do cache (paint instantâneo), rede primeiro pro resto
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

  // v4.5.96: pings de checagem de versão (_checkForUpdate) NÃO passam pelo SW — vão
  // direto à rede (fresh) e NÃO entram no cache. Sem isso, cada ping com `?_swcheck=<now>`
  // (URL única) virava uma entrada nova no cache → inchaço até o próximo bump.
  if (url.indexOf('_swcheck') !== -1) return;

  // `version.txt` é o ÁRBITRO do auto-update (`_checkForUpdate` compara com o
  // SCOREPLACE_VERSION rodando e, se diferir, nuke + reload). Servir isso do
  // cache seria o SW respondendo "você está atualizado" com a cópia velha — o
  // app nunca mais sairia da versão presa. Vai SEMPRE à rede, mesmo sem
  // `_swcheck` (chamadas diretas/curl também).
  if (url.indexOf('/version.txt') !== -1) return;

  // ── SHELL: CACHE PRIMEIRO, REDE ATRÁS ──────────────────────────────────
  // Se a URL EXATA (com `?v=`) já está no cache, responde na hora e revalida em
  // segundo plano. É isto que mata a tela branca: numa abertura fria o pedido
  // do index.html e o dos 7 CSS + scripts de <head> (todos render-blocking) não
  // esperam mais um round-trip cada.
  //
  // ⚠️ A comparação é por URL EXATA, COM a query, DE PROPÓSITO — o contrário do
  // fallback offline logo abaixo, que usa `ignoreSearch`. Aqui `ignoreSearch`
  // seria um BUG: um index.html novo (`?v=N+1`) receberia os js/css do cache
  // gravados sob `?v=N` — versões misturadas no mesmo carregamento. Com a URL
  // exata, `?v=` novo = miss = vai à rede; só serve do cache o que é exatamente
  // aquele arquivo naquela versão. Ver [[project_pwa_auto_update]].
  if (url.indexOf(self.location.origin) === 0) {
    var _isNavReq = (event.request.mode === 'navigate');
    event.respondWith(
      caches.match(event.request).then(function(hit) {
        // Navegação: o request é a raiz (`/`); o precache guarda `/` e
        // `/index.html`. Tenta os dois antes de desistir do cache.
        var pending = hit ? Promise.resolve(hit)
          : (_isNavReq ? caches.match('/index.html') : Promise.resolve(null));
        return pending.then(function(cached) {
          if (!cached) return null;
          // Revalida em segundo plano — o usuário já recebeu a resposta. Se a
          // versão mudou, quem aplica é o pipeline de update (SW novo →
          // skipWaiting → controllerchange → reload) e o `_checkForUpdate`
          // batendo em version.txt 1s depois do load. `cache:'reload'` na
          // navegação preserva o bypass do cache HTTP da v1.3.64.
          var refreshReq = _isNavReq
            ? new Request(event.request.url, { cache: 'reload', credentials: 'same-origin', redirect: 'follow' })
            : event.request;
          fetch(refreshReq).then(function(fresh) {
            if (fresh && fresh.status === 200) {
              var c = fresh.clone();
              caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, c); });
            }
          }).catch(function() {});
          return cached;
        });
      }).then(function(cached) {
        if (cached) return cached;
        return _networkFirst(event);
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
