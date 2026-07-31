/* A EXTENSÃO DE VERDADE, num Chromium de verdade — node tests/lz-extensao-real.test.js
 *
 * POR QUE ESTE TESTE EXISTE (31/jul/2026): o harness simulado carrega os arquivos da
 * extensão numa página e injeta um stub de `chrome.*`. Ele prova a LÓGICA, e provou — mas
 * não prova o CAMINHO: service worker MV3, mensagens entre abas, content script declarado.
 * E era justamente aí que estava o problema real do dono: a mesma requisição levou 0,4s às
 * 16h e estourou 40s às 18h, com a aba do letzplay aberta e navegável, sem nenhum
 * rate-limit. Um teste que não sobe o service worker nunca veria isso.
 *
 * Aqui a extensão é INSTALADA (--load-extension), o letzplay é servido por interceptação de
 * rede com a MESMA fixture do outro harness, e a leitura roda ponta a ponta.
 */
const { chromium } = require('@playwright/test');
const path = require('path'), fs = require('fs'), os = require('os');
const { FIXTURE } = require('./_letzplay-fixture.js');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
let pass = 0, fail = 0;
function ok(c, m, extra) { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.error('  ❌ ' + m + (extra ? ('\n       → ' + extra) : '')); } }

// A página do scoreplace: mínima, só o que a extensão precisa encontrar + o driver que
// dispara a leitura e escuta o resultado (o mesmo protocolo que o app usa).
const APP_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>scoreplace</title></head>
<body><div id="app">scoreplace</div><script>
window.__R = { progresso: 0, feeds: [], done: false, ok: null, erro: null, imp: null, cursor: null, rodadas: 0 };
window.addEventListener('message', function (e) {
  var d = e.data; if (!d || !d.__sp_lp) return;
  if (d.__sp_lp === 'extension-present') { window.__R.ext = d.version; return; }
  if (d.__sp_lp === 'athlete-import-progress') {
    window.__R.progresso++; if (d.feed) window.__R.feeds.push(d.feed);
    if (d.cursor) window.__R.cursor = d.cursor; return;
  }
  if (d.__sp_lp === 'athlete-import-partial') { if (d.fullImport) window.__R.imp = d.fullImport; return; }
  if (d.__sp_lp === 'athlete-import-result') {
    if (d.fullImport) window.__R.imp = d.fullImport;
    if (d.cursor) window.__R.cursor = d.cursor;
    if (!d.ok) { window.__R.done = true; window.__R.ok = false; window.__R.erro = d.error; return; }
    if (d.done !== true && window.__R.rodadas < 30) { window.__R.rodadas++; window.__R.iniciar(); return; }
    window.__R.done = true; window.__R.ok = true; return;
  }
});
window.__R.iniciar = function () {
  window.postMessage({ __sp_lp: 'run-athlete-import', handle: 'CamilaExemplo', uid: 'uid-1',
    tournamentId: 't1', prior: window.__R.imp || null, cursor: window.__R.cursor || null }, '*');
};
</script></body></html>`;

async function abrirContexto(cfg) {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-ext-'));
  const ctx = await chromium.launchPersistentContext(perfil, {
    // `--headless=new` carrega extensão MV3 (o headless clássico não carregava). Sem isto
    // o teste abre janelas do Chrome na cara de quem está trabalhando.
    headless: false,
    args: ['--headless=new', '--disable-extensions-except=' + EXT, '--load-extension=' + EXT,
           '--no-first-run', '--disable-gpu'],
  });
  // letzplay sintético — a MESMA fixture do harness simulado
  await ctx.addInitScript({ content: FIXTURE });
  await ctx.route('https://letzplay.me/**', async (route) => {
    const u = route.request().url();
    // a fixture vive no contexto da página; aqui reproduzimos o serve() em Node
    const body = servir(u, cfg);
    if (body == null) return route.fulfill({ status: 500, body: '' });
    const json = /\/matches\.json/.test(u);
    await route.fulfill({ status: 200, contentType: json ? 'application/json' : 'text/html; charset=utf-8', body: body });
  });
  await ctx.route('https://scoreplace.app/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: APP_HTML }));
  return { ctx, perfil };
}

// serve() em Node, usando a fixture avaliada uma vez
let _srv = null;
function servir(url, cfg) {
  if (!_srv) {
    const vm = require('vm');
    const s = { console, JSON, Math, String, Array, Object, Number, window: {} };
    s.window = s; vm.createContext(s);
    vm.runInContext(FIXTURE, s);
    _srv = s.__LZ;
  }
  if (!_srv.cfg || _srv.cfg !== cfg) _srv.init(cfg);
  return _srv.serve(url);
}

(async function () {
  const CENARIOS = [
    { nome: 'perfil pequeno', cfg: { games: 81, ranks: 3, tours: 4 } },
    { nome: 'Camila (472 jogos)', cfg: { games: 472, ranks: 29, tours: 35 } },
    { nome: 'monstro (2000 jogos)', cfg: { games: 2000, ranks: 60, tours: 120 } },
  ];

  for (const c of CENARIOS) {
    console.log('\n🧪 EXTENSÃO REAL — ' + c.nome);
    const { ctx } = await abrirContexto(c.cfg);
    try {
      // uma aba do letzplay ABERTA, como na máquina do dono
      const lz = await ctx.newPage();
      await lz.goto('https://letzplay.me/CamilaExemplo');

      const app = await ctx.newPage();
      await app.goto('https://scoreplace.app/');
      await app.waitForFunction(() => !!window.__R && !!window.__R.ext, null, { timeout: 20000 })
        .catch(() => {});
      const ver = await app.evaluate(() => window.__R.ext || null);
      ok(!!ver, 'a extensão anunciou presença na página do scoreplace (v' + ver + ')');

      const sw = ctx.serviceWorkers();
      ok(sw.length > 0, 'o service worker MV3 subiu (' + sw.length + ')');

      const t0 = Date.now();
      await app.evaluate(() => window.__R.iniciar());
      await app.waitForFunction(() => window.__R.done === true, null, { timeout: 300000 });
      const r = await app.evaluate(() => ({ ok: window.__R.ok, erro: window.__R.erro,
        jogos: (window.__R.imp && (window.__R.imp.gamesTotal || (window.__R.imp.games || []).length)) || 0,
        declarados: (window.__R.imp && window.__R.imp.declaredGames) || 0,
        rodadas: window.__R.rodadas, progresso: window.__R.progresso }));
      const seg = ((Date.now() - t0) / 1000).toFixed(1);
      console.log('     jogos=' + r.jogos + '/' + r.declarados + ' · rodadas=' + r.rodadas +
        ' · eventos=' + r.progresso + ' · ' + seg + 's');
      ok(r.ok === true, 'a leitura terminou sem erro', r.erro);
      ok(r.jogos === c.cfg.games, 'trouxe os ' + c.cfg.games + ' jogos (veio ' + r.jogos + ')');
      ok(r.jogos <= r.declarados || r.declarados === 0, 'e nunca acima do declarado');
    } finally { await ctx.close(); }
  }

  // ── O TESTE QUE FALTAVA: matar o service worker NO MEIO da leitura ──
  console.log('\n💀 EXTENSÃO REAL — service worker morto no meio da leitura');
  {
    const { ctx } = await abrirContexto({ games: 472, ranks: 29, tours: 35 });
    try {
      const lz = await ctx.newPage();
      await lz.goto('https://letzplay.me/CamilaExemplo');
      const app = await ctx.newPage();
      await app.goto('https://scoreplace.app/');
      await app.waitForFunction(() => !!window.__R && !!window.__R.ext, null, { timeout: 20000 }).catch(() => {});

      await app.evaluate(() => window.__R.iniciar());
      await app.waitForFunction(() => window.__R.progresso > 8, null, { timeout: 120000 });

      // mata o worker pelo CDP — é o que o Chrome faz sozinho, sem avisar
      const cdp = await ctx.newCDPSession(app);
      await cdp.send('ServiceWorker.enable').catch(() => {});
      const antes = ctx.serviceWorkers().length;
      let matou = false;
      try {
        const alvo = ctx.serviceWorkers()[0];
        if (alvo) { await cdp.send('ServiceWorker.stopAllWorkers'); matou = true; }
      } catch (e) { matou = false; }
      ok(matou, 'consegui parar o service worker no meio (worker(s) antes: ' + antes + ')');

      const terminou = await app.waitForFunction(() => window.__R.done === true, null, { timeout: 300000 })
        .then(() => true).catch(() => false);
      const r = await app.evaluate(() => ({ ok: window.__R.ok, erro: window.__R.erro,
        jogos: (window.__R.imp && (window.__R.imp.gamesTotal || (window.__R.imp.games || []).length)) || 0 }));
      console.log('     terminou=' + terminou + ' · jogos=' + r.jogos + ' · erro=' + r.erro);
      ok(terminou, 'a leitura TERMINOU mesmo com o worker morto no meio');
      ok(r.jogos === 472, 'e trouxe os 472 jogos (veio ' + r.jogos + ')');
    } finally { await ctx.close(); }
  }

  console.log('\n' + (fail ? '❌ ' + fail + ' de ' + (pass + fail) + ' falharam'
                           : '✅ ' + pass + ' verificações passaram (extensão real)'));
  process.exit(fail ? 1 : 0);
})();
