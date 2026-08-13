'use strict';
/* O PWA ABRE SEM TELA BRANCA — node tests/sw-abre-sem-tela-branca.test.js
 *
 * Relato do dono (12/ago/2026, v1.8.34): "abre o PWA → tela branca por ~7 segundos →
 * daí entra na tela de carregamento normal. Na segunda abertura o tempo é menor."
 *
 * CAUSA MEDIDA (não deduzida): o sw.js fazia, NO TOPO do arquivo, dois
 * `importScripts('https://www.gstatic.com/firebasejs/…')` SÍNCRONOS + initializeApp()
 * + messaging(). O service worker morre junto com o app, então TODA abertura fria o
 * reavalia do zero — e o spec não despacha NENHUM evento `fetch` antes de o topo
 * terminar. Ou seja: antes de o pedido do próprio index.html começar a ser
 * respondido, era preciso DNS + TLS + baixar ~20KB gzip de OUTRO domínio. Atrás
 * disso vinham os 7 CSS e os 3 scripts de <head>, todos render-blocking — e todos
 * em rede-primeiro, então cada um pagava um round-trip. Enquanto isso a tela fica
 * branca: o splash inline do index.html nem chegou a ser parseado. A 2ª abertura era
 * mais rápida porque o gstatic já estava no cache HTTP.
 *
 * Estas asserções RODAM O sw.js DE VERDADE contra Cache API / fetch falsos. As duas
 * que mais importam provam comportamento, não texto:
 *   - com o shell no cache, a resposta sai mesmo que a REDE NUNCA RESPONDA;
 *   - o push continua exibindo a notificação com o payload EXATO que a CF manda.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) pass++; else { fail++; console.error('  ✗ ' + n); } };

const ROOT = path.join(__dirname, '..');
const swSrc = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const shell = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

console.log('\n📋 O PWA abre sem tela branca (service worker)');

// ─────────────────────────────────────────────────────────────────────────────
// Harness: um service worker de mentira, com Cache API e fetch controlados.
// ─────────────────────────────────────────────────────────────────────────────
function makeSW(opts) {
  opts = opts || {};
  const listeners = {};
  const netCalls = [];
  const notifications = [];
  const importCalls = [];

  class FakeResponse {
    constructor(body, init) {
      init = init || {};
      this.body = body;
      this.status = init.status === undefined ? 200 : init.status;
      this._tag = init._tag || null;
    }
    clone() { return new FakeResponse(this.body, { status: this.status, _tag: this._tag }); }
    text() { return Promise.resolve(this.body); }
    get ok() { return this.status >= 200 && this.status < 300; }
  }
  class FakeRequest {
    constructor(url, init) {
      init = init || {};
      this.url = typeof url === 'string' ? url : url.url;
      this.method = init.method || 'GET';
      this.mode = init.mode || (typeof url === 'object' ? url.mode : 'no-cors');
      this.cache = init.cache;
    }
  }

  // Cache API mínima, com a semântica que importa: match por URL EXATA por
  // padrão, e por URL-sem-query quando ignoreSearch:true.
  const store = new Map(Object.entries(opts.cached || {}));
  const strip = (u) => String(u).split('?')[0];
  // `caches.match('/index.html')` no SW real resolve relativo ao escopo — o
  // harness precisa fazer o mesmo, senão a chave não casa com o cache.
  const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, 'https://scoreplace.app').href;
  const cacheObj = {
    match(req, o) {
      const k = keyOf(req);
      if (store.has(k)) return Promise.resolve(new FakeResponse(store.get(k), { _tag: 'cache' }));
      if (o && o.ignoreSearch) {
        for (const [sk, sv] of store) {
          if (strip(sk) === strip(k)) return Promise.resolve(new FakeResponse(sv, { _tag: 'cache' }));
        }
      }
      return Promise.resolve(undefined);
    },
    put(req, res) { store.set(keyOf(req), res.body); return Promise.resolve(); },
    add(u) { store.set(String(u), 'added'); return Promise.resolve(); },
    addAll() { return Promise.resolve(); },
    keys() { return Promise.resolve([...store.keys()]); }
  };

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    URL, Promise, Map, Set, Date, JSON,
    Request: FakeRequest,
    Response: FakeResponse,
    caches: {
      open: () => Promise.resolve(cacheObj),
      match: (r, o) => cacheObj.match(r, o),
      keys: () => Promise.resolve(['scoreplace-antigo']),
      delete: () => Promise.resolve(true)
    },
    fetch(req) {
      const url = typeof req === 'string' ? req : req.url;
      netCalls.push(url);
      if (opts.netHangs) return new Promise(() => {});     // rede que NUNCA responde
      if (opts.netFails) return Promise.reject(new Error('offline'));
      return Promise.resolve(new FakeResponse('DA-REDE:' + url, { _tag: 'net' }));
    },
    clients: {
      matchAll: () => Promise.resolve(opts.clientes || []),
      openWindow: () => Promise.resolve(),
      claim: () => Promise.resolve()
    },
    // REGISTRA em vez de lançar: assim o sw.js ANTIGO (o que tem a tela branca)
    // roda até o fim e o teste LISTA todas as falhas, em vez de morrer na
    // primeira com um stack trace.
    importScripts(...urls) { importCalls.push(...urls); },
    // Stub do SDK, pelo mesmo motivo — o código antigo chamava estes no topo.
    firebase: {
      initializeApp() {},
      messaging: () => ({ onBackgroundMessage(fn) { (listeners['push'] = listeners['push'] || []).push(
        // adapta a assinatura do SDK pra do handler nativo, pra que as asserções
        // de push abaixo avaliem os DOIS desenhos pelo mesmo caminho.
        (ev) => { let p = {}; try { p = ev.data.json(); } catch (e) { p = {}; } fn(p.data || p.notification ? p : {}); }
      ); } })
    }
  };
  sandbox.self = sandbox;
  sandbox.self.location = { origin: 'https://scoreplace.app' };
  sandbox.self.registration = {
    showNotification(title, o) { notifications.push({ title, options: o }); return Promise.resolve(); }
  };
  sandbox.self.skipWaiting = () => Promise.resolve();
  sandbox.self.addEventListener = (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); };

  vm.createContext(sandbox);
  vm.runInContext(swSrc, sandbox, { filename: 'sw.js' });

  return { listeners, netCalls, notifications, importCalls, store, FakeRequest, FakeResponse };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1) O TOPO DO ARQUIVO NÃO PODE DEPENDER DA REDE — é o defeito, virado teste.
//    O harness lança se `importScripts` for chamado: se voltar, morre aqui.
// ─────────────────────────────────────────────────────────────────────────────
let checaPush = Promise.resolve();
let sw = null, bootErr = null;
try { sw = makeSW(); } catch (e) { bootErr = e; }
ok('o sw.js avalia o topo sem estourar', !bootErr);
if (bootErr) console.error('     →', bootErr.message);
ok('o topo NÃO baixa script de outra origem (era a tela branca de ~7s)',
  !!sw && sw.importCalls.length === 0);
if (sw && sw.importCalls.length) console.error('     → importScripts:', sw.importCalls.join(' , '));
ok('  → e o topo não faz nenhum fetch antes de registrar os handlers',
  !!sw && sw.netCalls.length === 0);
ok('  → o motivo fica escrito no lugar onde o defeito morava',
  /NUNCA voltar a fazer `importScripts\(\)` do Firebase aqui/.test(swSrc));
// Varre só CÓDIGO (linhas de comentário ficam de fora — o aviso de "nunca voltar
// a fazer isto" cita `importScripts(` de propósito e não pode reprovar o teste).
const swCodigo = swSrc.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
ok('  → e nenhum SDK do Firebase sobrou no CÓDIGO do arquivo',
  !/importScripts\s*\(/.test(swCodigo) && !/firebase\.(initializeApp|messaging)\s*\(/.test(swCodigo));

// ─────────────────────────────────────────────────────────────────────────────
// 2) A NOTIFICAÇÃO DE PUSH CONTINUA FUNCIONANDO — com o payload EXATO que a CF
//    `sendPushNotification` (functions-autodraw/index.js) manda pra web: DATA-ONLY.
//    Tirar o SDK do SW não pode custar a notificação de quem está com o app fechado.
// ─────────────────────────────────────────────────────────────────────────────
if (sw) {
  const pushHandlers = sw.listeners['push'] || [];
  ok('existe um handler de `push` registrado no topo', pushHandlers.length === 1);

  const payloadDaCF = {
    data: {
      title: 'Confra BT Alta da Clínica 2026',
      body: 'Sorteio realizado! Veja o seu confronto.',
      link: 'https://scoreplace.app/#tournaments/tour_1780009816637',
      type: 'draw',
      tournamentId: 'tour_1780009816637',
      tag: 'scoreplace|draw|tour_1780009816637|notif_abc'
    },
    from: '382268772878',
    fcmMessageId: 'msg-1'
  };
  const waits = [];
  if (pushHandlers[0]) {
    pushHandlers[0]({ data: { json: () => payloadDaCF }, waitUntil: (p) => waits.push(p) });
  }
  ok('  → o handler segura o evento com waitUntil (senão o SW morre antes de exibir)',
    waits.length === 1);

  // Payload malformado não pode derrubar o handler nem exibir lixo.
  const sw2 = makeSW();
  const waits2 = [];
  (sw2.listeners['push'] || [])[0]({ data: { json: () => { throw new Error('json inválido'); } }, waitUntil: (p) => waits2.push(p) });

  checaPush = Promise.all([...waits, ...waits2]).then(() => {
    const n = sw.notifications[0];
    ok('  → exibe UMA notificação (nunca duas: o contrato data-only depende disso)',
      sw.notifications.length === 1);
    ok('  → título vem de data.title', !!n && n.title === payloadDaCF.data.title);
    ok('  → corpo vem de data.body', !!n && n.options.body === payloadDaCF.data.body);
    ok('  → o toque abre o link do torneio', !!n && n.options.data.url === payloadDaCF.data.link);
    ok('  → `tag` estável preservada (entrega repetida colapsa em vez de empilhar)',
      !!n && n.options.tag === payloadDaCF.data.tag);
    ok('  → payload ilegível não estoura: cai no título padrão do app',
      sw2.notifications.length === 1 && sw2.notifications[0].title === 'scoreplace.app');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2b) COM O APP ABERTO NA FRENTE: TOAST, NUNCA OS DOIS.
//     Quem fazia esta separação era o SDK do Firebase dentro do SW (com aba
//     visível ele não disparava o onBackgroundMessage e repassava pra página).
//     O SDK saiu — se o SW passar a exibir incondicionalmente, o usuário com o
//     app aberto vê a notificação do sistema E o toast: a duplicata que a
//     v2.1.92 já teve de consertar uma vez. Ver [[project_notification_dedup]].
// ─────────────────────────────────────────────────────────────────────────────
let checaForeground = Promise.resolve();
{
  const payload = { data: { title: 'T', body: 'B', link: '/x', tag: 'tg' } };
  const disparar = (swx) => {
    const waits = [];
    (swx.listeners['push'] || [])[0]({ data: { json: () => payload }, waitUntil: (p) => waits.push(p) });
    return Promise.all(waits);
  };

  const paraFrente = [];
  const swVisivel = makeSW({ clientes: [{ visibilityState: 'visible', postMessage: (m) => paraFrente.push(m) }] });
  const swOculto = makeSW({ clientes: [{ visibilityState: 'hidden', postMessage: () => {} }] });

  checaForeground = Promise.all([disparar(swVisivel), disparar(swOculto)]).then(() => {
    ok('app ABERTO na frente: manda pra página (toast) e NÃO exibe notificação do sistema',
      paraFrente.length === 1 && swVisivel.notifications.length === 0);
    ok('  → e o que chega na página tem o conteúdo do push',
      paraFrente[0] && paraFrente[0].type === 'SP_PUSH' && paraFrente[0].data.body === 'B');
    ok('app em SEGUNDO PLANO: exibe a notificação do sistema',
      swOculto.notifications.length === 1 && swOculto.notifications[0].options.body === 'B');
    // O outro lado da ponte tem que existir, senão o toast some em vez de duplicar.
    const notif = fs.readFileSync(path.join(ROOT, 'js', 'notifications.js'), 'utf8');
    ok('  → a página escuta o SP_PUSH que o SW manda (senão o toast simplesmente some)',
      /addEventListener\(\s*['"]message['"]/.test(notif) && /SP_PUSH/.test(notif));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3) O SHELL SAI DO CACHE — A ASSERÇÃO QUE REPRODUZ A TELA BRANCA.
//    A rede aqui NUNCA responde. Se a resposta ainda assim chega, o usuário
//    pinta na hora; se travar, é exatamente a tela branca do relato.
// ─────────────────────────────────────────────────────────────────────────────
function fetchVia(swx, req) {
  const h = (swx.listeners['fetch'] || [])[0];
  let resp = null;
  h({ request: req, respondWith: (p) => { resp = p; } });
  return resp;
}

const CACHE_QUENTE = {
  'https://scoreplace.app/': '<html>SHELL</html>',
  'https://scoreplace.app/index.html': '<html>SHELL</html>',
  'https://scoreplace.app/css/style.css?v=1.2.28': 'CSS',
  'https://scoreplace.app/js/store.js?v=1.8.34': 'JS'
};

(async () => {
  await checaPush;
  await checaForeground;

  // 3a) Navegação com a rede pendurada → tem que responder do cache.
  const swNav = makeSW({ cached: CACHE_QUENTE, netHangs: true });
  const navReq = new swNav.FakeRequest('https://scoreplace.app/', { mode: 'navigate' });
  const corrida = await Promise.race([
    fetchVia(swNav, navReq).then((r) => ({ quem: 'cache', body: r && r.body })),
    new Promise((r) => setTimeout(() => r({ quem: 'TRAVOU' }), 300))
  ]);
  ok('navegação responde do cache mesmo com a rede pendurada (a tela branca do relato)',
    corrida.quem === 'cache' && corrida.body === '<html>SHELL</html>');

  // 3b) CSS/JS render-blocking do <head>: idem.
  const swCss = makeSW({ cached: CACHE_QUENTE, netHangs: true });
  const cssReq = new swCss.FakeRequest('https://scoreplace.app/css/style.css?v=1.2.28', { mode: 'no-cors' });
  const cssRace = await Promise.race([
    fetchVia(swCss, cssReq).then((r) => ({ quem: 'cache', body: r && r.body })),
    new Promise((r) => setTimeout(() => r({ quem: 'TRAVOU' }), 300))
  ]);
  ok('  → CSS do <head> também sai do cache sem esperar a rede', cssRace.quem === 'cache');

  // 3c) Navegação para uma rota que o cache não tem sob a URL exata cai no
  //     /index.html precacheado (o app é SPA: toda rota é o mesmo shell).
  const swDeep = makeSW({ cached: CACHE_QUENTE, netHangs: true });
  const deepReq = new swDeep.FakeRequest('https://scoreplace.app/invite/abc', { mode: 'navigate' });
  const deepRace = await Promise.race([
    fetchVia(swDeep, deepReq).then((r) => ({ quem: 'cache', body: r && r.body })),
    new Promise((r) => setTimeout(() => r({ quem: 'TRAVOU' }), 300))
  ]);
  ok('  → rota profunda cai no /index.html precacheado', deepRace.quem === 'cache');

  // 3d) ⚠️ VERSÃO NOVA NUNCA É SERVIDA DA ANTIGA. O cache-first casa a URL
  //     EXATA (com `?v=`) de propósito — se usasse ignoreSearch (como o
  //     fallback offline usa), um index.html novo receberia o js da versão
  //     anterior e o carregamento sairia com versões MISTURADAS.
  const swVer = makeSW({ cached: CACHE_QUENTE });
  const novoReq = new swVer.FakeRequest('https://scoreplace.app/js/store.js?v=1.8.35', { mode: 'no-cors' });
  const novoResp = await fetchVia(swVer, novoReq);
  ok('`?v=` novo NÃO é servido da cópia antiga do cache — vai à rede',
    novoResp && novoResp.body === 'DA-REDE:https://scoreplace.app/js/store.js?v=1.8.35');
  ok('  → e a resposta nova é gravada no cache pra próxima abertura fria',
    swVer.store.get('https://scoreplace.app/js/store.js?v=1.8.35') !== undefined);

  // 3e) Offline sem a URL exata: aí SIM o ignoreSearch entra (v1.7.94 — evita a
  //     landing em chaves cruas). Só quando a rede JÁ falhou.
  const swOff = makeSW({ cached: CACHE_QUENTE, netFails: true });
  const offReq = new swOff.FakeRequest('https://scoreplace.app/js/store.js?v=1.8.35', { mode: 'no-cors' });
  const offResp = await fetchVia(swOff, offReq);
  ok('offline com `?v=` novo cai na última cópia boa (ignoreSearch preservado)',
    offResp && offResp.body === 'JS');

  // ───────────────────────────────────────────────────────────────────────────
  // 4) version.txt É O ÁRBITRO DO AUTO-UPDATE — nunca pode sair do cache, senão
  //    o app responde "estou atualizado" com a cópia velha e fica preso.
  // ───────────────────────────────────────────────────────────────────────────
  const swVtxt = makeSW({ cached: { 'https://scoreplace.app/version.txt': '1.0.0-velha' } });
  const vReq = new swVtxt.FakeRequest('https://scoreplace.app/version.txt', { mode: 'no-cors' });
  ok('version.txt não é interceptado pelo SW (vai sempre à rede)',
    fetchVia(swVtxt, vReq) === null);
  const swPing = makeSW({ cached: {} });
  const pingReq = new swPing.FakeRequest('https://scoreplace.app/version.txt?_swcheck=123', { mode: 'no-cors' });
  ok('  → e o ping `_swcheck` continua fora do cache (não incha a cada checagem)',
    fetchVia(swPing, pingReq) === null);

  // ───────────────────────────────────────────────────────────────────────────
  // 5) O install precacheia as URLs VERSIONADAS que a página realmente pede —
  //    senão a 1ª abertura depois de cada deploy voltaria a ser 100% rede.
  // ───────────────────────────────────────────────────────────────────────────
  ok('o install lê o index.html e precacheia as URLs com `?v=`',
    /_versionedShellUrls/.test(swSrc) && /cache\.add\(u\)/.test(swSrc));

  // ───────────────────────────────────────────────────────────────────────────
  // 6) O <head> não pode ter folha de OUTRA ORIGEM bloqueando a pintura — o SW
  //    não consegue cachear resposta opaque, então ela iria à rede TODA vez.
  // ───────────────────────────────────────────────────────────────────────────
  // O <noscript> não conta: ele só é ativado quando não há JS pra promover a
  // folha, e aí bloquear a pintura é o comportamento certo (é o fallback).
  const shellSemNoscript = shell.replace(/<noscript>[\s\S]*?<\/noscript>/g, '');
  const linksExternos = (shellSemNoscript.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/g) || [])
    .filter((l) => /https?:\/\//.test(l) && !/scoreplace\.app/.test(l));
  const bloqueantes = linksExternos.filter((l) => !/media\s*=\s*["']print["']/.test(l));
  ok('nenhuma folha de estilo de outra origem bloqueia a pintura ('
    + linksExternos.length + ' externa(s), ' + bloqueantes.length + ' bloqueante(s))',
    bloqueantes.length === 0);
  if (bloqueantes.length) console.error('     →', bloqueantes.join('\n       '));
  ok('  → e ela é promovida pra `all` no onload', /this\.media\s*=\s*['"]all['"]/.test(shell));

  console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' asserções ok, ' + fail + ' falha(s)');
  process.exit(fail === 0 ? 0 : 1);
})();
