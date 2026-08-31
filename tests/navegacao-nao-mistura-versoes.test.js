/* NAVEGAÇÃO NÃO MISTURA VERSÕES — rede primeiro; cache só quando a rede falha
 *   node tests/navegacao-nao-mistura-versoes.test.js
 *
 * O RELATO (Codex, produção, 31/ago/2026): `version.txt` respondia 2.1.69 e uma sessão
 * recebeu o shell da 2.1.63 junto com scripts da 2.1.67–2.1.69. Com o dado canônico
 * intacto no banco, `inscritos`, "📣 Novidades" e "🏅 Seus últimos resultados"
 * apareciam vazios ou antigos.
 *
 * A MECÂNICA, e por que ninguém via:
 *   ① a requisição de NAVEGAÇÃO é `/` — SEM `?v=`. O precache guarda `/` e
 *      `/index.html` desde o install de qualquer versão anterior, então o cache-first
 *      dava HIT quase sempre e o SW respondia com o index VELHO;
 *   ② o `?v=` NÃO protegia: cache-buster é QUERY. `/js/store.js?v=2.1.63` e
 *      `?v=2.1.69` são o MESMO arquivo no Hosting — o shell velho pedia a URL velha e a
 *      rede devolvia o código NOVO;
 *   ③ `_checkForUpdate` compara version.txt com o JS RODANDO, e o JS rodando estava em
 *      dia. O árbitro dizia "atualizado" com a tela híbrida na frente.
 *
 * ⛔ ESTA SUÍTE RODA O sw.js REAL, dentro de um `vm` com `caches`/`fetch`/`Request`/
 * `Response` de mentira. Réplica do handler certificaria a minha imaginação, não o
 * arquivo publicado.
 *
 * ⭐ O DIAGNÓSTICO (§0) implementa o comportamento ANTIGO com os MESMOS dublês e prova
 * que ele serve o shell velho. Sem ele, "§1 está verde" não distingue "consertei" de
 * "meu dublê nunca reproduziu o bug".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const SW_SRC = fs.readFileSync(process.env.SP_SW_SRC || path.join(RAIZ, 'sw.js'), 'utf8');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; fails.push(m); console.log('  ✗ ' + m); } }

const ORIGEM = 'https://scoreplace.app';

/* ── Shells de duas builds. O <head> é o que importa: é dele que sai a lista de
 * arquivos render-blocking que `_versionedShellUrls` confere. ─────────────────── */
const SHELL_VELHO = '<!doctype html><html><head><meta name="sp-shell" content="2.1.63">' +
  '<link rel="stylesheet" href="/css/style.css?v=2.1.63">' +
  '<script src="/js/store.js?v=2.1.63"></script></head><body>VELHO</body></html>';
const SHELL_NOVO = '<!doctype html><html><head><meta name="sp-shell" content="2.1.70">' +
  '<link rel="stylesheet" href="/css/style.css?v=2.1.70">' +
  '<script src="/js/store.js?v=2.1.70"></script></head><body>NOVO</body></html>';

/* ── Dublês ─────────────────────────────────────────────────────────────────── */
function FakeResponse(corpo, init) {
  init = init || {};
  this._corpo = String(corpo == null ? '' : corpo);
  this.status = (typeof init.status === 'number') ? init.status : 200;
  this.headers = init.headers || {};
  this.type = init.type || 'basic';
}
FakeResponse.prototype.clone = function () { return new FakeResponse(this._corpo, { status: this.status }); };
FakeResponse.prototype.text = function () { return Promise.resolve(this._corpo); };
FakeResponse.error = function () { return new FakeResponse('', { status: 0 }); };

function FakeRequest(url, init) {
  init = init || {};
  this.url = (url && url.url) ? url.url : String(url);
  this.mode = init.mode || ((url && url.mode) || 'no-cors');
  this.method = init.method || 'GET';
  this.cache = init.cache || 'default';
}

function novoCache(entradas) {
  const mapa = new Map();
  Object.keys(entradas || {}).forEach(function (k) { mapa.set(k, entradas[k]); });
  const chave = function (req, opts) {
    const u = (req && req.url) ? req.url : String(req);
    const rel = u.indexOf(ORIGEM) === 0 ? u.slice(ORIGEM.length) : u;
    if (mapa.has(rel)) return rel;
    if (opts && opts.ignoreSearch) {
      const semQ = rel.split('?')[0];
      for (const k of mapa.keys()) { if (k.split('?')[0] === semQ) return k; }
    }
    return null;
  };
  return {
    _mapa: mapa,
    match: function (req, opts) { const k = chave(req, opts); return Promise.resolve(k ? mapa.get(k) : undefined); },
    put: function (req, resp) { const u = (req && req.url) ? req.url : String(req);
      mapa.set(u.indexOf(ORIGEM) === 0 ? u.slice(ORIGEM.length) : u, resp); return Promise.resolve(); },
    add: function () { return Promise.resolve(); },
    keys: function () { return Promise.resolve([]); }
  };
}

/* Carrega o sw.js REAL e devolve { fetchHandler, ctx }. `rede` é a função que
 * responde a cada fetch — é ela que a gente derruba pra simular offline. */
function carregaSW(cache, rede, prazoMs) {
  const ouvintes = {};
  const ctx = {
    console: console, Promise: Promise, Map: Map, Set: Set, Array: Array, Object: Object,
    JSON: JSON, String: String, Number: Number, Date: Date, URL: URL, RegExp: RegExp,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    Request: FakeRequest, Response: FakeResponse,
    caches: {
      open: function () { return Promise.resolve(cache); },
      match: function (req, opts) { return cache.match(req, opts); },
      keys: function () { return Promise.resolve([]); },
      delete: function () { return Promise.resolve(true); }
    },
    clients: { matchAll: function () { return Promise.resolve([]); }, claim: function () { return Promise.resolve(); }, openWindow: function () { return Promise.resolve(); } },
    fetch: rede,
    registration: { showNotification: function () { return Promise.resolve(); } }
  };
  ctx.self = {
    addEventListener: function (t, f) { ouvintes[t] = f; },
    location: { origin: ORIGEM },
    skipWaiting: function () { return Promise.resolve(); },
    clients: ctx.clients,
    registration: ctx.registration
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  /* O PRAZO é constante no arquivo; encurtá-lo mantém a suíte rápida sem criar um
   * segundo caminho — o código executado é o do sw.js. */
  const fonte = (typeof prazoMs === 'number')
    ? SW_SRC.replace(/var PRAZO_NAVEGACAO_MS = \d+;/, 'var PRAZO_NAVEGACAO_MS = ' + prazoMs + ';')
    : SW_SRC;
  vm.runInContext(fonte, ctx, { filename: 'sw.js' });
  return { ouvintes: ouvintes, ctx: ctx };
}

/* Dispara um fetch de navegação e devolve o corpo servido. */
function navega(cache, rede, url, prazoMs) {
  const sw = carregaSW(cache, rede, prazoMs);
  if (!sw.ouvintes.fetch) return Promise.reject(new Error('sw.js não registrou ouvinte de fetch'));
  let servido = null;
  const ev = {
    request: new FakeRequest(url || (ORIGEM + '/'), { mode: 'navigate' }),
    respondWith: function (p) { servido = Promise.resolve(p); }
  };
  sw.ouvintes.fetch(ev);
  if (!servido) return Promise.resolve({ semRespondWith: true });
  return servido.then(function (r) { return r.text().then(function (t) { return { status: r.status, corpo: t }; }); });
}

const redeCom = function (mapa) {
  return function (req) {
    const u = (req && req.url) ? req.url : String(req);
    const rel = u.indexOf(ORIGEM) === 0 ? u.slice(ORIGEM.length) : u;
    if (Object.prototype.hasOwnProperty.call(mapa, rel)) return Promise.resolve(new FakeResponse(mapa[rel], { status: 200 }));
    return Promise.resolve(new FakeResponse('', { status: 404 }));
  };
};
const redeMorta = function () { return Promise.reject(new Error('offline')); };

const CACHE_COERENTE_VELHO = {
  '/': new FakeResponse(SHELL_VELHO),
  '/index.html': new FakeResponse(SHELL_VELHO),
  '/css/style.css?v=2.1.63': new FakeResponse('css velho'),
  '/js/store.js?v=2.1.63': new FakeResponse('js velho')
};

(async function () {
  console.log('\n§0 DIAGNÓSTICO — o comportamento ANTIGO (cache-first) serve o shell VELHO');
  {
    /* A navegação como era antes da R1.0: `caches.match(request)` primeiro e revalidação
     * em segundo plano. Mesmos dublês do §1. Se ISTO passar despercebido, o §1 não prova
     * nada. */
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const rede = redeCom({ '/': SHELL_NOVO });
    const req = new FakeRequest(ORIGEM + '/', { mode: 'navigate' });
    const antigo = await cache.match(req).then(function (hit) {
      return hit || cache.match('/index.html');
    }).then(function (c) {
      if (c) { rede(req); return c; }                       // revalida em segundo plano
      return rede(req);
    });
    const corpo = await antigo.text();
    ok(corpo.indexOf('2.1.63') !== -1,
      'o caminho ANTIGO serve o shell 2.1.63 mesmo com a rede oferecendo o 2.1.70 (é o bug relatado)');
  }

  console.log('\n§1 ONLINE — navegação vem da REDE, não do cache');
  {
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const r = await navega(cache, redeCom({ '/': SHELL_NOVO }));
    ok(r.corpo && r.corpo.indexOf('2.1.70') !== -1,
      'com cache do 2.1.63 e rede oferecendo 2.1.70, a navegação serve o 2.1.70');
    ok(r.corpo && r.corpo.indexOf('2.1.63') === -1,
      'nenhum resquício do shell 2.1.63 na resposta');
    ok(r.status === 200, 'status 200');
  }
  {
    /* O caso do relato de ponta a ponta: o `<meta sp-shell>` servido tem que ser o
     * MESMO da build cujos scripts a rede está entregando. */
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const r = await navega(cache, redeCom({ '/': SHELL_NOVO }));
    const m = /<meta name="sp-shell" content="([^"]*)">/.exec(r.corpo || '');
    ok(m && m[1] === '2.1.70', 'o shell servido carimba a versão nova (' + (m && m[1]) + ')');
    ok((r.corpo || '').indexOf('?v=2.1.70') !== -1 && (r.corpo || '').indexOf('?v=2.1.63') === -1,
      'as URLs de script do shell servido são todas da MESMA build');
  }
  {
    /* Cache VAZIO e rede boa: continua funcionando (é a primeira visita). */
    const r = await navega(novoCache({}), redeCom({ '/': SHELL_NOVO }));
    ok(r.corpo && r.corpo.indexOf('2.1.70') !== -1, 'primeira visita (cache vazio) serve o shell da rede');
  }

  console.log('\n§2 OFFLINE — cache é fallback, e só quando é COERENTE');
  {
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const r = await navega(cache, redeMorta);
    ok(r.corpo && r.corpo.indexOf('2.1.63') !== -1,
      'rede caiu: serve o shell 2.1.63 do cache — versão antiga, mas INTEIRA');
    ok(r.status === 200, 'e com status 200 (é uma página de verdade, não a de erro)');
  }
  {
    /* O shell velho está no cache, mas o CSS render-blocking dele NÃO. Servi-lo faria o
     * `ignoreSearch` de `_networkFirst` entregar o CSS de OUTRA build — mistura. */
    const parcial = Object.assign({}, CACHE_COERENTE_VELHO);
    delete parcial['/css/style.css?v=2.1.63'];
    parcial['/css/style.css?v=2.1.70'] = new FakeResponse('css NOVO');
    const r = await navega(novoCache(parcial), redeMorta);
    ok(r.corpo && r.corpo.indexOf('2.1.63') === -1,
      'shell velho com <head> incompleto NÃO é servido (serviria misturado com o css 2.1.70)');
    ok(r.status === 503 && /Sem conexão/.test(r.corpo || ''),
      'no lugar dele vem a página honesta de "sem conexão" (503), nunca undefined/tela preta');
  }
  {
    const r = await navega(novoCache({}), redeMorta);
    ok(r.status === 503 && /Tentar de novo/.test(r.corpo || ''),
      'offline com cache vazio: página de "sem conexão" com botão — nunca respondWith(undefined)');
  }

  console.log('\n§3 REDE RESPONDE MAL (5xx) — não é offline, mas também não serve lixo');
  {
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const r = await navega(cache, function () { return Promise.resolve(new FakeResponse('erro do servidor', { status: 503 })); });
    ok(r.corpo && r.corpo.indexOf('2.1.63') !== -1,
      'com 5xx a navegação cai no shell coerente do cache em vez de pintar a página de erro');
  }

  console.log('\n§4 ASSET continua casando por URL EXATA (é o que impede a mistura online)');
  {
    const cache = novoCache(CACHE_COERENTE_VELHO);
    const sw = carregaSW(cache, redeCom({ '/js/store.js?v=2.1.70': 'js NOVO' }));
    let servido = null;
    sw.ouvintes.fetch({
      request: new FakeRequest(ORIGEM + '/js/store.js?v=2.1.70', { mode: 'no-cors' }),
      respondWith: function (p) { servido = Promise.resolve(p); }
    });
    const corpo = await servido.then(function (r) { return r.text(); });
    ok(corpo === 'js NOVO',
      '`?v=` novo dá MISS no cache (que só tem o 2.1.63) e vai à rede — nunca serve o velho');
  }

  console.log('\n§4b REDE PENDURADA — prazo de parede, e o que se serve é COERENTE');
  {
    /* ⚠️ `fetch` numa conexão que aceita e nunca responde NÃO REJEITA. Sem prazo,
     * rede-primeiro é a tela branca de 1.8.35 por um caminho novo — e é justamente o
     * invariante que tests/sw-abre-sem-tela-branca.test.js guarda. */
    const pendurada = function () { return new Promise(function () {}); };
    const t0 = Date.now();
    const r = await navega(novoCache(CACHE_COERENTE_VELHO), pendurada, null, 40);
    ok(Date.now() - t0 < 2000, 'a navegação não espera pra sempre: respondeu em ' + (Date.now() - t0) + 'ms');
    ok(r.corpo && r.corpo.indexOf('2.1.63') !== -1,
      'estourado o prazo, serve o shell do cache — INTEIRO, da mesma build');
    ok(r.corpo && r.corpo.indexOf('?v=2.1.70') === -1,
      '⛔ e sem nenhuma URL de outra build junto (o prazo não reabre a mistura)');
  }
  {
    /* Prazo estourado E cache incoerente: não inventa mistura pra "salvar" a tela. */
    const parcial = Object.assign({}, CACHE_COERENTE_VELHO);
    delete parcial['/js/store.js?v=2.1.63'];
    const r = await navega(novoCache(parcial), function () { return Promise.reject(new Error('offline')); }, null, 40);
    ok(r.status === 503, 'prazo/rede fora + cache incoerente = página de "sem conexão", nunca shell misturado');
  }

  console.log('\n§5 version.txt NUNCA passa pelo SW (é o árbitro da atualização)');
  {
    const cache = novoCache({ '/version.txt': new FakeResponse('2.1.63') });
    const sw = carregaSW(cache, redeCom({ '/version.txt': '2.1.70' }));
    let chamou = false;
    sw.ouvintes.fetch({
      request: new FakeRequest(ORIGEM + '/version.txt', { mode: 'no-cors' }),
      respondWith: function () { chamou = true; }
    });
    ok(chamou === false, 'o SW não intercepta /version.txt — vai direto à rede, sem cache');
  }

  console.log('\n' + (fail ? '✗' : '✅') + ' navegação/versões: ' + pass + ' ok, ' + fail + ' falharam');
  if (fail) { fails.forEach(function (f) { console.log('   ✗ ' + f); }); process.exitCode = 1; }
})().catch(function (e) { console.error('EXPLODIU:', e && e.stack || e); process.exitCode = 1; });
