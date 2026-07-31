/* Leitura de um perfil GRANDE do letzplay — ponta a ponta, com o código REAL da extensão
 * (extension/content.js + libs) rodando num Chromium de verdade contra um letzplay
 * sintético. Nada de mock do que está sendo testado: o que roda aqui é o mesmo
 * `_runAthleteImport` que roda no navegador do organizador.
 *
 * O QUE ESTE TESTE EXISTE PRA IMPEDIR (falha real, jul/2026 — perfil da Camila: 472
 * jogos, 35 torneios, 29 rankings): a leitura era time-boxed em 240s, mas o trabalho
 * são ~140 requisições e o espaçamento humano da fila dá ~4s cada → 9,2 min. A rodada
 * morria SEMPRE em 43% do trabalho, dentro da etapa dos torneios, e a etapa do
 * histórico geral — onde vivem ~400 dos 472 jogos — nunca era alcançada. Perfil pequeno
 * (81 jogos, 37 requisições) cabia: daí "funciona com o meu e não com o da Camila".
 *
 * Os invariantes travados aqui:
 *   1. um perfil grande chega ao FIM (todos os jogos declarados), encadeando rodadas;
 *   2. nenhuma página é lida duas vezes — o cursor é o que faz a retomada custar zero;
 *   3. os parciais gravam DELTA: o total de escritas canônicas é ~o nº de jogos, não
 *      nº de jogos × nº de parciais (era 24.656 numa leitura);
 *   4. o doc resumo cabe no limite de 1MiB do Firestore, inclusive num perfil monstro.
 *
 * Roda com: node tests/letzplay-big-profile.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const read = (p) => fs.readFileSync(p, 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg, detalhe) {
  testes++;
  if (cond) { console.log('  ✅ ' + msg); return; }
  falhas++;
  console.log('  ❌ ' + msg + (detalhe != null ? ('\n       → ' + detalhe) : ''));
}

// ── letzplay sintético ────────────────────────────────────────────────────
// HTML fiel aos seletores que o extrator usa (.row.match, .col-xs-12,
// .row.match-player, .match-players-double, .table-group, .table-ranking).
const { FIXTURE } = require('./_letzplay-fixture.js');

// Stub do chrome.* — o mínimo que o content.js usa. `lp-fetch` serve o letzplay
// sintético SEM espaçamento (o espaçamento é da fila do background e não é o que
// está sob teste; o que está sob teste é a lógica de rodada/cursor/delta).
const CHROME_STUB = `
window.chrome = {
  runtime: {
    id: 'test',
    lastError: null,
    sendMessage(msg, cb) {
      let r = { ok: true };
      if (msg && msg.type === 'lp-fetch') {
        // Modo "letzplay pediu pra esperar": a partir da requisição N, devolve desafio do
        // Cloudflare até o orçamento de paciência estourar. É a situação real em que a
        // leitura da Camila morria — aqui ela tem que PAUSAR, gravar e o app continuar.
        const b = window.__LZ.bloqueio;
        if (b && ++window.__LZ.nReq >= b.apos && window.__LZ.nBloqueios < b.quantos) {
          window.__LZ.nBloqueios++;
          setTimeout(() => cb && cb({ ok: false, blocked: true, status: 403, retryAfter: '1' }), 0);
          return true;
        }
        try { r = { ok: true, html: window.__LZ.serve(msg.url), status: 200 }; }
        catch (e) { r = { ok: false, error: String(e) }; }
      }
      setTimeout(() => cb && cb(r), 0);
    },
    onMessage: { addListener() {} }
  }
};
`;

// O LADO APP: reimplementa exatamente o encadeamento que
// js/views/tournaments-enrollment-report.js faz (dispara rodada → ao receber
// done:false, dispara de novo com o cursor) e acumula as escritas canônicas com o
// modelo REAL (js/letzplay-model.js).
const APP_DRIVER = `
window.__APP = {
  rodadas: 0, parciais: 0, cursor: null, imp: null, done: false, erro: null,
  escritasCanonicas: 0, docsPorGid: {}, tamanhoDoc: 0, deltasVazios: 0,
  pausas: 0, throttles: 0, violacoesTeto: [], violacoesLidos: [],
  jogosAntesDosRankings: 0, jogosAntesDosTorneios: 0, notasSemSujeito: [],
  faseJogosComeçou: 0, torneiosDepoisDosJogos: 0, rankingsDepoisDosJogos: 0, totaisVistos: {}, rotuloAtrasado: [],
  gravar(imp, delta) {
    const M = window._spLzModel;
    const fonte = Array.isArray(delta) ? { games: delta, handle: imp.handle } : imp;
    const docs = M.historyDocs(fonte, imp.handle);
    this.escritasCanonicas += docs.comps.length + docs.matches.length;
    docs.matches.forEach(m => { this.docsPorGid[m.gid] = (this.docsPorGid[m.gid] || 0) + 1; });
    if (Array.isArray(delta) && !delta.length) this.deltasVazios++;
  },
  start(handle, uid, prior, cursor) {
    this.cursor = cursor || null; this.imp = prior || null;
    const self = this;
    window.addEventListener('message', function (e) {
      const d = e.data; if (!d) return;
      if (d.__sp_lp === 'lz-throttle') { self.throttles++; return; }
      if (d.__sp_lp === 'athlete-import-progress') {
        if (d.feed) { self.feeds = self.feeds || []; self.feeds.push(d.feed); }
        var _f=(d.current&&d.current.phase)||'';
        if(_f==='jogos'&&(d.counts||{}).g>0){ if(self.faseJogosComeçou===0) self.faseJogosComeçou=1; }
        if(_f==='torneios'&&self.faseJogosComeçou) self.torneiosDepoisDosJogos++;
        if(_f==='rankings'&&self.faseJogosComeçou) self.rankingsDepoisDosJogos++;
        // ORDEM DE CONCLUSÃO: os JOGOS têm que ser a última barra a fechar. O dono viu
        // "Jogos 478 de 478 (100%)" com "Rankings 20 de 29" e reclamou com razão — as
        // competições ficavam se resolvendo DEPOIS dos jogos acabarem.
        var _c = d.counts || {};
        // TOTAIS FIXOS: guarda cada valor distinto visto por barra — se mudar no meio,
        // aparece aqui. Era o "nasce 478 e vira 569" que o dono viu.
        ['t','r','g'].forEach(function (k) {
          if (_c[k+'Y'] == null) return;
          self.totaisVistos[k] = self.totaisVistos[k] || [];
          if (self.totaisVistos[k].indexOf(_c[k+'Y']) < 0) self.totaisVistos[k].push(_c[k+'Y']);
        });
        if (_c.gY && _c.g >= _c.gY) {
          if (_c.rY && _c.r < _c.rY) self.jogosAntesDosRankings++;
          if (_c.tY && _c.t < _c.tY) self.jogosAntesDosTorneios++;
        }
        // TEXTO SEM SUJEITO: "2 de 41" não informa nada a quem está olhando.
        var _n = (d.current && d.current.note) || '';
        if (/^\s*\d+\s+de\s+\d+\s*$/.test(_n)) self.notasSemSujeito.push(_n);
        // RÓTULO x BARRA: "torneio 1 de 35" embaixo de "30 de 35" são dois contadores
        // diferentes na mesma tela. O do rótulo nunca pode ficar ATRÁS do da barra.
        var _mt = _n.match(/^torneio (\d+) de (\d+)/);
        if (_mt && _c.t != null && +_mt[1] < _c.t) self.rotuloAtrasado.push(_n + ' (barra: ' + _c.t + ')');
        if (_mt && +_mt[1] > +_mt[2]) self.rotuloAtrasado.push('PASSOU DO TOTAL: ' + _n);
        var _mr = _n.match(/^ranking (\d+) de (\d+)/);
        if (_mr && _c.r != null && +_mr[1] < _c.r) self.rotuloAtrasado.push(_n + ' (barra: ' + _c.r + ')');
        if (_mr && +_mr[1] > +_mr[2]) self.rotuloAtrasado.push('PASSOU DO TOTAL: ' + _n);
      }
      if (d.__sp_lp === 'athlete-import-progress') {
        // AUDITORIA DAS BARRAS: guarda toda violação de "x nunca passa de y" e todo caso de
        // "torneios lidos" maior que o nº do torneio que está sendo processado agora.
        const c = d.counts || {};
        ['t', 'r', 'g'].forEach(k => {
          const y = c[k + 'Y'];
          if (y != null && y > 0 && c[k] != null && c[k] > y) {
            self.violacoesTeto.push(k + '=' + c[k] + ' de ' + y + ' · ' + ((d.current && d.current.note) || ''));
          }
        });
        const nota = (d.current && d.current.note) || '';
        const m = nota.match(/torneio (\\d+) de (\\d+)/);
        if (m && c.t != null && c.t > +m[1]) {
          self.violacoesLidos.push('lidos=' + c.t + ' mas está no torneio ' + m[1] + ' de ' + m[2]);
        }
        return;
      }
      if (d.__sp_lp === 'athlete-import-partial') {
        self.parciais++;
        if (d.cursor) self.cursor = d.cursor;
        if (d.fullImport) self.imp = d.fullImport;
        if (d.fullImport) self.gravar(d.fullImport, d.gamesDelta);
        return;
      }
      if (d.__sp_lp === 'athlete-import-result') {
        if (!d.ok) { self.done = true; self.erro = d.error; return; }
        if (d.cursor) self.cursor = d.cursor;
        if (d.fullImport) { self.imp = d.fullImport; self.gravar(d.fullImport, d.gamesDelta); }
        if (d.done !== true && self.rodadas < 40) { self.pausas++; self.proxima(handle, uid); return; }
        self.tamanhoDoc = new TextEncoder().encode(JSON.stringify(self.imp)).length;
        self.done = true;
        return;
      }
    });
    this.proxima(handle, uid);
  },
  proxima(handle, uid) {
    this.rodadas++;
    window.postMessage({ __sp_lp: 'run-athlete-import', handle, uid, tournamentId: 't1',
      prior: this.imp, cursor: this.cursor }, window.location.origin);
  }
};
`;

// Cada cenário roda numa PÁGINA NOVA: o content.js guarda o acumulado de jogos por
// handle em escopo de módulo (é o que faz rodadas encadeadas não relerem nada), então
// reaproveitar a página misturaria os cenários.
async function novaPagina(browser) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => { console.log('  ⚠️  erro na página: ' + e.message); });
  // Precisa de um ORIGIN real: o content.js posta com window.location.origin, e
  // setContent() deixa a página em origin "null" (postMessage recusa).
  await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('http://scoreplace.test/');
  await page.addScriptTag({ content: FIXTURE });
  await page.addScriptTag({ content: CHROME_STUB });
  for (const f of ['lib/letzplay-api.js', 'lib/letzplay-rating.js', 'lib/letzplay-import.js', 'lib/letzplay-extract.js', 'lib/letzplay-flow.js']) {
    await page.addScriptTag({ content: read(path.join(EXT, f)) });
  }
  await page.addScriptTag({ content: read(path.join(ROOT, 'js/letzplay-model.js')) });
  await page.addScriptTag({ content: read(path.join(EXT, 'content.js')) });
  await page.addScriptTag({ content: APP_DRIVER });
  return page;
}

async function rodarCenario(page, cfg, rotulo, bloqueio) {
  await page.evaluate((a) => { window.__LZ.init(a.c, a.b); }, { c: cfg, b: bloqueio || null });
  await page.evaluate(() => {
    window.__APP.rodadas = 0; window.__APP.parciais = 0; window.__APP.cursor = null;
    window.__APP.imp = null; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {}; window.__APP.tamanhoDoc = 0;
    window.__APP.pausas = 0; window.__APP.throttles = 0;
    window.__APP.violacoesTeto = []; window.__APP.violacoesLidos = [];
    window.__APP.jogosAntesDosRankings = 0; window.__APP.jogosAntesDosTorneios = 0; window.__APP.notasSemSujeito = [];
    window.__APP.faseJogosComeçou = 0; window.__APP.torneiosDepoisDosJogos = 0; window.__APP.rankingsDepoisDosJogos = 0; window.__APP.totaisVistos = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', null, null);
  });
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 120000 });
  return await page.evaluate(() => ({
    rodadas: window.__APP.rodadas, parciais: window.__APP.parciais, erro: window.__APP.erro,
    escritas: window.__APP.escritasCanonicas,
    gidsDuplicados: Object.keys(window.__APP.docsPorGid).filter(k => window.__APP.docsPorGid[k] > 1).length,
    gidsUnicos: Object.keys(window.__APP.docsPorGid).length,
    tamanhoDoc: window.__APP.tamanhoDoc,
    jogosNoDoc: (window.__APP.imp && (window.__APP.imp.games || []).length) || 0,
    jogosTotal: (window.__APP.imp && window.__APP.imp.gamesTotal) || 0,
    declarados: (window.__APP.imp && window.__APP.imp.declaredGames) || 0,
    truncado: !!(window.__APP.imp && window.__APP.imp.gamesTruncated),
    pausas: window.__APP.pausas, throttles: window.__APP.throttles,
    violacoesTeto: window.__APP.violacoesTeto.slice(0, 5), nViolTeto: window.__APP.violacoesTeto.length,
    violacoesLidos: window.__APP.violacoesLidos.slice(0, 5), nViolLidos: window.__APP.violacoesLidos.length,
    jogosAntesDosRankings: window.__APP.jogosAntesDosRankings, jogosAntesDosTorneios: window.__APP.jogosAntesDosTorneios,
    torneiosDepoisDosJogos: window.__APP.torneiosDepoisDosJogos, rankingsDepoisDosJogos: window.__APP.rankingsDepoisDosJogos,
    totaisVistos: window.__APP.totaisVistos,
    rotuloAtrasado: window.__APP.rotuloAtrasado.slice(0,4), nRotulo: window.__APP.rotuloAtrasado.length,
    notasSemSujeito: window.__APP.notasSemSujeito.slice(0, 4), nSemSujeito: window.__APP.notasSemSujeito.length,
    observacoes: (window.__APP.imp && (window.__APP.imp.observations || []).length),
    footprint: (window.__APP.imp && (window.__APP.imp.footprint || []).length) || 0,
    cursor: window.__APP.cursor,
    hits: window.__LZ.hits,
    parcialMotivo: (window.__APP.imp && window.__APP.imp.partialReason) || null
  }));
}

(async () => {
  const browser = await chromium.launch();

  // ── CENÁRIO 1: o perfil da Camila ────────────────────────────────────────
  console.log('\n📚 CENÁRIO 1 — perfil grande (Camila: 472 jogos, 35 torneios, 29 rankings)');
  const camila = { games: 472, tours: 35, ranks: 29, gamesPerTour: 4 };
  let page = await novaPagina(browser);
  let r = await rodarCenario(page, camila, 'camila');
  console.log('     rodadas=' + r.rodadas + ' parciais=' + r.parciais +
    ' jogos=' + r.jogosTotal + '/' + r.declarados + ' footprint=' + r.footprint +
    ' doc=' + (r.tamanhoDoc / 1024).toFixed(0) + 'KB escritas=' + r.escritas);

  ok(!r.erro, 'a leitura não falhou', r.erro);
  ok(r.jogosTotal >= 472, 'trouxe os 472 jogos declarados (veio ' + r.jogosTotal + ')');
  ok(r.declarados === 472, 'leu o total declarado do perfil (472)', 'declarados=' + r.declarados);
  ok(r.footprint === 64, 'montou as 64 competições (35 torneios + 29 rankings)', 'footprint=' + r.footprint);
  ok(!r.parcialMotivo, 'terminou COMPLETA (sem motivo de parcial)', r.parcialMotivo);
  ok(r.cursor && r.cursor.complete === true, 'o cursor terminou marcado como completo');

  // 2. nenhuma página lida duas vezes
  const repetidas = Object.keys(r.hits).filter(u => r.hits[u] > 1);
  ok(repetidas.length === 0, 'nenhuma URL foi buscada duas vezes',
    repetidas.slice(0, 6).map(u => u + '×' + r.hits[u]).join(', '));
  const totalReq = Object.values(r.hits).reduce((a, b) => a + b, 0);
  console.log('     requisições totais: ' + totalReq);

  // 3. delta: cada partida gravada uma vez só
  ok(r.gidsDuplicados === 0, 'nenhuma partida foi regravada (parciais mandam DELTA)',
    r.gidsDuplicados + ' gids gravados mais de uma vez');
  ok(r.escritas < 1200, 'escritas canônicas na ordem do nº de jogos, não jogos×parciais (' + r.escritas + ')',
    'antes eram ' + (472 * 46) + ' — 472 partidas × 46 parciais');

  // 4. doc cabe no Firestore
  ok(r.tamanhoDoc < 1048576, 'o doc resumo cabe no limite de 1MiB (' + (r.tamanhoDoc / 1024).toFixed(0) + 'KB)');
  ok(r.observacoes === 0, 'observations não vai mais no doc (eram 41% do peso e ninguém lia)');

  // 5. as BARRAS têm que ser um número, não um absurdo. Bug real visto pelo dono
  // (30/jul): "🏆 38 de 35 (100%)" e "35 de 35" enquanto o rodapé dizia "torneio 16 de 35".
  // Regra dele: "se são 35 torneios, são 35 torneios e não mais que isso. 35 é 100%".
  ok(r.nViolTeto === 0, 'nenhuma barra passou do total declarado (x <= y sempre)',
    r.nViolTeto + ' violações, ex: ' + (r.violacoesTeto || []).join(' | '));
  ok(r.nViolLidos === 0, '"torneios lidos" nunca é maior que o torneio em processamento',
    r.nViolLidos + ' violações, ex: ' + (r.violacoesLidos || []).join(' | '));
  // 6. os JOGOS fecham por ÚLTIMO — competições resolvem junto, não depois
  ok(r.jogosAntesDosRankings === 0, 'Jogos nunca chega a 100% com Rankings ainda incompleto',
    r.jogosAntesDosRankings + ' momentos com jogos cheios e rankings pela metade');
  ok(r.jogosAntesDosTorneios === 0, 'Jogos nunca chega a 100% com Torneios ainda incompleto',
    r.jogosAntesDosTorneios + ' momentos');
  // 6b. ORDEM torneios → rankings → JOGOS (especificação do dono)
  ok(r.torneiosDepoisDosJogos === 0, 'nenhum torneio é lido DEPOIS dos jogos começarem', r.torneiosDepoisDosJogos + 'x');
  ok(r.rankingsDepoisDosJogos === 0, 'nenhum ranking é lido DEPOIS dos jogos começarem', r.rankingsDepoisDosJogos + 'x');
  // 6c. TOTAIS vistos "de cara" e FIXOS — nunca mudam no meio
  var _tv = r.totaisVistos || {};
  ok((_tv.t || []).length <= 1, 'total de TORNEIOS não muda durante a leitura', 'vistos: ' + JSON.stringify(_tv.t));
  ok((_tv.r || []).length <= 1, 'total de RANKINGS não muda durante a leitura', 'vistos: ' + JSON.stringify(_tv.r));
  ok((_tv.g || []).length <= 1, 'total de JOGOS não muda (nascia 478 e virava 569)', 'vistos: ' + JSON.stringify(_tv.g));
  // 6d. ZERO DUPLICATA
  ok(r.jogosTotal === r.declarados, 'jogos guardados == declarados, sem duplicata (' + r.jogosTotal + ' × ' + r.declarados + ')');
  // 7. nenhum texto de progresso é um número solto ("2 de 41")
  ok(r.nRotulo === 0, 'o número do rótulo nunca fica ATRÁS do da barra ("torneio 1 de 35" com "30 de 35")',
    r.nRotulo + ' vezes, ex: ' + (r.rotuloAtrasado || []).join(' | '));
  ok(r.nSemSujeito === 0, 'nenhuma nota de progresso é um número sem sujeito ("2 de 41")',
    r.nSemSujeito + ' notas assim, ex: ' + (r.notasSemSujeito || []).join(' | '));

  // ── CENÁRIO 2: retomada — cursor pela metade ─────────────────────────────
  console.log('\n⏸️  CENÁRIO 2 — retomada de um cursor pela metade (não relê o que já leu)');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate(async (cfg) => {
    window.__LZ.init(cfg);
    // cursor fingindo: torneios todos lidos, histórico geral parado na página 20
    // cursor MODERNO (v4): é este que promete retomada sem releitura. Cursor v3 é o do
    // pipeline velho e DEVE reler — isso é o cenário 2b, logo abaixo.
    const cur = { v: 4, handle: 'CamilaExemplo', toursDone: {}, ranksDone: {}, pageDone: 20, pagesTotal: 34, complete: false };
    for (let t = 0; t < cfg.tours; t++) cur.toursDone['t/paineiras-bt/' + (300000 + t)] = 1;
    // prior com footprint dos torneios (nome+classificação já resolvidos)
    const fp = [];
    for (let t = 0; t < cfg.tours; t++) {
      fp.push({ official: true, club: 'paineiras-bt', tourneyId: String(300000 + t),
        name: 'Interno Ciclo ' + (300000 + t) + ' - Feminina C', categoryRaw: 'Feminina C',
        standings: [{ group: 'Grupo 1', rows: [{ pos: 1, players: ['Camila Exemplo'], handles: ['CamilaExemplo'], wins: 3, losses: 1 }] }] });
    }
    const prior = { source: 'letzplay', handle: 'CamilaExemplo', games: [], footprint: fp,
      categories: [], pairs: [], observations: [], declaredGames: 472, lzCursor: cur,
      tournamentsList: Array.from({ length: cfg.tours }, (_, t) => ({ club: 'paineiras-bt', tid: String(300000 + t), title: 'Interno Ciclo ' + t })) };
    window.__APP.rodadas = 0; window.__APP.parciais = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {};
    window.__LZ.hits = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', prior, cur);
    return true;
  }, camila);
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 120000 });
  const r2 = await page.evaluate(() => ({
    hits: window.__LZ.hits, erro: window.__APP.erro,
    cursor: window.__APP.cursor,
    jogos: (window.__APP.imp && window.__APP.imp.gamesTotal) || 0
  }));
  const urls2 = Object.keys(r2.hits);
  const pediuTorneio = urls2.filter(u => /\/tournaments\/\d+/.test(u));
  // ÍNDICE (JSON) e PÁGINA (HTML) são coisas diferentes e o teste tem que separá-las.
  // O índice é a lista de ids que o letzplay serve em .json — barato, e é ele que torna o
  // total e a completude VERIFICÁVEIS em vez de inferidos. A página de HTML é a cara,
  // porque é de onde saem placar e jogadores. "Não reler" vale pra segunda.
  const indice = urls2.filter(u => /matches\.json/.test(u));
  const paginasLidas = urls2.filter(u => /^\/CamilaExemplo\/matches(?!\.json)/.test(u));
  console.log('     requisições na retomada: ' + urls2.length +
    ' (índice: ' + indice.length + ' · páginas de HTML: ' + paginasLidas.length + ')');
  ok(!r2.erro, 'a retomada não falhou', r2.erro);
  ok(pediuTorneio.length === 0, 'NÃO reabriu nenhum torneio já lido (cursor)', pediuTorneio.slice(0, 4).join(', '));
  ok(indice.length > 0, 'o índice JSON foi consultado — é ele que diz o que existe');
  const antesDe20 = paginasLidas.filter(u => {
    const m = u.match(/page=(\d+)/); return m ? (+m[1] <= 20) : true;
  });
  ok(antesDe20.length === 0, 'NÃO releu nenhuma PÁGINA DE HTML anterior à do cursor (página 20)', antesDe20.join(', '));
  ok(r2.cursor && r2.cursor.complete === true, 'a retomada chegou ao fim');

  // ── CENÁRIO 2b: dado SUJO do pipeline velho tem que sair na próxima leitura ──
  // Caso real: o doc da Camila tinha 569 jogos para 478 reais — 24 duplicatas puras
  // (mesma partida por dois caminhos, chave antiga incluía a categoria) mais jogos vindos
  // das páginas de torneio. Semear a leitura nova com isso carregaria o erro pra sempre.
  console.log('\n🧹 CENÁRIO 2b — import velho com DUPLICATAS é limpo na próxima leitura');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate((cfg) => {
    window.__LZ.init(cfg);
    // prior do pipeline VELHO: cursor v3 e jogos inflados (cada um repetido)
    const sujos = [];
    for (let i = 0; i < 60; i++) {
      const g = { date: 'Sábado, 0' + (1 + i % 9) + '/0' + (1 + i % 9) + '/26 às 08:00hs', official: false,
        club: 'paineiras-bt', rankingId: '90000', competition: 'Social Fem C / B',
        oppHandles: ['AdvUm' + i, 'AdvDois' + i], oppNames: ['A', 'B'], partnerHandle: 'P' + i,
        myScore: 6, oppScore: 3, won: true };
      sujos.push(g);
      sujos.push(Object.assign({}, g, { competition: 'Ver trilha de X/Y' }));  // a MESMA partida
    }
    const prior = { source: 'letzplay', handle: 'CamilaExemplo', games: sujos, footprint: [],
      categories: [], pairs: [], observations: [], declaredGames: cfg.games,
      lzCursor: { v: 3, handle: 'CamilaExemplo', toursDone: {}, pageDone: 12, pagesTotal: 34, complete: false } };
    window.__APP.rodadas = 0; window.__APP.parciais = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {}; window.__APP.tamanhoDoc = 0;
    window.__APP.pausas = 0; window.__APP.throttles = 0; window.__APP.violacoesTeto = []; window.__APP.violacoesLidos = [];
    window.__APP.faseJogosComeçou = 0; window.__APP.torneiosDepoisDosJogos = 0; window.__APP.rankingsDepoisDosJogos = 0;
    window.__APP.notasSemSujeito = []; window.__APP.totaisVistos = {}; window.__APP.rotuloAtrasado = [];
    window.__LZ.hits = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', prior, prior.lzCursor);
  }, camila);
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 180000 });
  const r2b = await page.evaluate(() => ({
    erro: window.__APP.erro, jogos: (window.__APP.imp && window.__APP.imp.gamesTotal) || 0,
    declarados: (window.__APP.imp && window.__APP.imp.declaredGames) || 0,
    cursorV: (window.__APP.cursor || {}).v,
    hits: Object.keys(window.__LZ.hits).filter(u => /^\/CamilaExemplo\/matches/.test(u)).length,
    rodadas: window.__APP.rodadas, motivo: (window.__APP.imp && window.__APP.imp.partialReason) || null,
    urlsMatches: Object.keys(window.__LZ.hits).filter(u => /matches/.test(u)).sort().slice(0,60),
    pageDone: (window.__APP.cursor || {}).pageDone, pagesTotal: (window.__APP.cursor || {}).pagesTotal,
    completo: (window.__APP.cursor || {}).complete
  }));
  console.log('     jogos=' + r2b.jogos + '/' + r2b.declarados + ' · páginas=' + r2b.hits + ' · cursor v' + r2b.cursorV +
    ' · rodadas=' + r2b.rodadas + ' · pageDone=' + r2b.pageDone + '/' + r2b.pagesTotal + ' · completo=' + r2b.completo + ' · motivo=' + r2b.motivo);
  ok(!r2b.erro, 'a leitura de migração não falhou', r2b.erro);
  ok(r2b.jogos === r2b.declarados, 'os 120 registros sujos (60 duplicados) SUMIRAM — ficou ' +
    r2b.jogos + ' = declarado ' + r2b.declarados);
  ok(r2b.cursorV === 4, 'o cursor foi promovido pra v4');
  ok(r2b.hits > 1, 'releu o histórico do começo em vez de confiar no cursor velho (' + r2b.hits + ' páginas)');

  // ── CENÁRIO 2c: cursor JÁ v4 com jogo sujo — o estado REAL de produção ──────
  // Este é o caso que passou pelo 2b e chegou na tela do dono: "Jogos 569 de 569 (100%)"
  // com o perfil declarando 478. O carimbo `v` é posto no INÍCIO da rodada e salvo no
  // primeiro parcial — então uma rodada que começou, gravou parcial e foi suspensa deixa
  // carimbo NOVO com dado VELHO, e a migração-por-carimbo nunca mais roda. A prova de que
  // o jogo é bom tem que estar NELE: o pipeline novo carrega o id do letzplay (`lzId`).
  console.log('\n🩹 CENÁRIO 2c — cursor já v4 mas jogos SEM lzId (estado real da Camila)');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate((cfg) => {
    window.__LZ.init(cfg);
    const sujos = [];
    for (let i = 0; i < 40; i++) {
      const g = { date: 'Sábado, 0' + (1 + i % 9) + '/0' + (1 + i % 9) + '/26 às 08:00hs', official: false,
        club: 'paineiras-bt', rankingId: '90000', competition: 'Social Fem C / B',
        oppHandles: ['AdvUm' + i, 'AdvDois' + i], oppNames: ['A', 'B'], partnerHandle: 'P' + i,
        myScore: 6, oppScore: 3, won: true };           // ← repare: SEM lzId
      sujos.push(g); sujos.push(Object.assign({}, g, { competition: 'Ver trilha de X/Y' }));
    }
    const prior = { source: 'letzplay', handle: 'CamilaExemplo', games: sujos, footprint: [],
      categories: [], pairs: [], observations: [], declaredGames: cfg.games,
      // carimbo NOVO (v4) em cima de dado VELHO — exatamente o doc de produção
      lzCursor: { v: 4, handle: 'CamilaExemplo', toursDone: {}, ranksDone: {},
        pageDone: 24, pagesTotal: 24, complete: false } };
    window.__APP.rodadas = 0; window.__APP.parciais = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {}; window.__APP.tamanhoDoc = 0;
    window.__APP.pausas = 0; window.__APP.throttles = 0; window.__APP.violacoesTeto = []; window.__APP.violacoesLidos = [];
    window.__APP.faseJogosComeçou = 0; window.__APP.torneiosDepoisDosJogos = 0; window.__APP.rankingsDepoisDosJogos = 0;
    window.__APP.notasSemSujeito = []; window.__APP.totaisVistos = {}; window.__APP.rotuloAtrasado = [];
    window.__LZ.hits = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', prior, prior.lzCursor);
  }, camila);
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 180000 });
  const r2c = await page.evaluate(() => ({
    erro: window.__APP.erro, jogos: (window.__APP.imp && window.__APP.imp.gamesTotal) || 0,
    declarados: (window.__APP.imp && window.__APP.imp.declaredGames) || 0,
    semId: ((window.__APP.imp && window.__APP.imp.games) || []).filter(g => !g.lzId).length,
    paginas: Object.keys(window.__LZ.hits).filter(u => /^\/CamilaExemplo\/matches/.test(u)).length
  }));
  console.log('     jogos=' + r2c.jogos + '/' + r2c.declarados + ' · sem lzId=' + r2c.semId +
    ' · páginas relidas=' + r2c.paginas);
  ok(!r2c.erro, 'a limpeza por evidência não falhou', r2c.erro);
  ok(r2c.jogos === r2c.declarados, 'o total fechou no DECLARADO (' + r2c.declarados +
    '), não no inflado — era o "569 de 569" da tela', 'ficou ' + r2c.jogos);
  ok(r2c.semId === 0, 'nenhum jogo sobrou sem o id do letzplay', r2c.semId + ' sem lzId');
  ok(r2c.paginas > 1, 'releu o histórico apesar do carimbo dizer que estava em dia');

  // ── CENÁRIO 2d: a limpeza NÃO PODE ENCOLHER O DOC se a rodada parar no meio ──
  // Caso real da Kelly (31/jul): 158 jogos viraram 20 — o conteúdo de UMA página. A
  // migração jogava os velhos fora ANTES de ler os novos, e a rodada terminou no meio.
  // Perda de dado causada pela limpeza. Agora os velhos ficam até a varredura FECHAR.
  console.log('\n🛟 CENÁRIO 2d — rodada interrompida no meio da limpeza não pode perder jogos');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate((cfg) => {
    window.__LZ.init(cfg);
    window.__LZ.pararApos = 1;            // deixa UMA página passar e derruba o resto
    const velhos = [];
    for (let i = 0; i < 157; i++) {
      velhos.push({ date: 'Sábado, 0' + (1 + i % 9) + '/0' + (1 + i % 9) + '/26 às 08:00hs',
        official: false, club: 'paineiras-bt', rankingId: '90000', competition: 'Fem C',
        oppHandles: ['a' + i], oppNames: ['A'], myScore: 6, oppScore: 3, won: true });  // sem lzId
    }
    const prior = { source: 'letzplay', handle: 'CamilaExemplo', games: velhos, footprint: [],
      categories: [], pairs: [], observations: [], declaredGames: cfg.games,
      lzCursor: { v: 4, handle: 'CamilaExemplo', toursDone: {}, ranksDone: {},
        pageDone: 24, pagesTotal: 24, complete: true } };
    window.__APP.rodadas = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {}; window.__APP.tamanhoDoc = 0;
    window.__APP.pausas = 0; window.__APP.throttles = 0; window.__APP.violacoesTeto = []; window.__APP.violacoesLidos = [];
    window.__APP.faseJogosComeçou = 0; window.__APP.torneiosDepoisDosJogos = 0; window.__APP.rankingsDepoisDosJogos = 0;
    window.__APP.notasSemSujeito = []; window.__APP.totaisVistos = {}; window.__APP.rotuloAtrasado = [];
    window.__LZ.hits = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', prior, prior.lzCursor);
  }, camila);
  await page.waitForFunction(() => window.__APP.done === true || window.__APP.erro, null, { timeout: 180000 })
    .catch(() => {});
  const r2d = await page.evaluate(() => ({
    _dbgRodadas: window.__APP.rodadas, _dbgErro: window.__APP.erro,
    _dbgParciais: window.__APP.parciais,
    _dbgPrimeiraChamada: (window.__APP.ultimoPrior || {}).games ? (window.__APP.ultimoPrior.games || []).length : 'sem prior',
    jogos: (window.__APP.imp && (window.__APP.imp.gamesTotal || (window.__APP.imp.games || []).length)) || 0,
    completo: !!((window.__APP.cursor || {}).complete)
  }));
  console.log('     jogos no doc após a interrupção: ' + r2d.jogos + ' · completo=' + r2d.completo +
    ' · rodadas=' + r2d._dbgRodadas + ' · erro=' + r2d._dbgErro);
  ok(r2d.jogos >= 157, 'o doc NÃO encolheu: os 157 velhos seguem lá até a varredura fechar (ficou ' +
    r2d.jogos + ')');
  // E NÃO INFLOU. Preservar não pode virar acrescentar o que já estava lá — foi assim que
  // os 478 da Camila viraram 1038.
  ok(r2d.jogos <= 157 + 20, 'e NÃO inflou: no máximo os 157 + a página que deu tempo de ler (ficou ' +
    r2d.jogos + ')');
  await page.evaluate(() => { window.__LZ.pararApos = 0; });

  // ── CENÁRIO 2e: doc INFLADO (acima do declarado) não pode se perpetuar ──────
  // Caso real da Camila (31/jul): um bug meu inflou o histórico pra 1038 com 478 declarados.
  // A partir daí o lixo entrava como SEMENTE de cada leitura nova e, por ser MAIOR que o
  // resultado limpo, a regra do "não encolher" impedia a limpeza — cada tentativa de
  // consertar aumentava o número (1038 → 791 → …). Acima do declarado é lixo, ponto.
  console.log('\n🧨 CENÁRIO 2e — histórico inflado acima do declarado é descartado, não semeado');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate((cfg) => {
    window.__LZ.init(cfg);
    const inflado = [];
    for (let i = 0; i < cfg.games + 500; i++) {          // MUITO acima do declarado
      inflado.push({ date: 'Sábado, 0' + (1 + i % 9) + '/0' + (1 + i % 9) + '/26 às 08:00hs',
        official: false, club: 'x', rankingId: '1', competition: 'c',
        oppHandles: ['o' + i], oppNames: ['O'], myScore: 6, oppScore: 1, won: true });
    }
    const prior = { source: 'letzplay', handle: 'CamilaExemplo', games: inflado, footprint: [],
      categories: [], pairs: [], observations: [], declaredGames: cfg.games,
      lzCursor: { v: 4, handle: 'CamilaExemplo', toursDone: {}, ranksDone: {},
        pageDone: 24, pagesTotal: 24, pagesRead: {}, complete: true } };
    window.__APP.rodadas = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {}; window.__APP.tamanhoDoc = 0;
    window.__APP.pausas = 0; window.__APP.throttles = 0; window.__APP.violacoesTeto = []; window.__APP.violacoesLidos = [];
    window.__APP.faseJogosComeçou = 0; window.__APP.torneiosDepoisDosJogos = 0; window.__APP.rankingsDepoisDosJogos = 0;
    window.__APP.notasSemSujeito = []; window.__APP.totaisVistos = {}; window.__APP.rotuloAtrasado = [];
    window.__LZ.hits = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', prior, prior.lzCursor);
  }, camila);
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 180000 });
  const r2e = await page.evaluate(() => ({
    jogos: (window.__APP.imp && (window.__APP.imp.gamesTotal || (window.__APP.imp.games || []).length)) || 0,
    declarados: (window.__APP.imp && window.__APP.imp.declaredGames) || 0
  }));
  console.log('     jogos=' + r2e.jogos + ' · declarados=' + r2e.declarados);
  ok(r2e.jogos === r2e.declarados, 'o inflado foi descartado e o histórico voltou ao real (' +
    r2e.jogos + ' = ' + r2e.declarados + ')');
  ok(r2e.jogos <= r2e.declarados, 'e nunca fica acima do declarado');

  // ── CENÁRIO 3: perfil MONSTRO — o doc tem que continuar cabendo ──────────
  console.log('\n🐘 CENÁRIO 3 — perfil monstro (2.000 jogos, 120 torneios, 60 rankings)');
  await page.close();
  page = await novaPagina(browser);
  const monstro = { games: 2000, tours: 120, ranks: 60, gamesPerTour: 5 };
  const r3 = await rodarCenario(page, monstro, 'monstro');
  console.log('     rodadas=' + r3.rodadas + ' jogos=' + r3.jogosTotal + '/' + r3.declarados +
    ' doc=' + (r3.tamanhoDoc / 1024).toFixed(0) + 'KB truncado=' + r3.truncado + ' escritas=' + r3.escritas);
  ok(!r3.erro, 'perfil monstro não falhou', r3.erro);
  ok(r3.jogosTotal >= 2000, 'trouxe os 2.000 jogos (veio ' + r3.jogosTotal + ')');
  ok(r3.tamanhoDoc < 1048576, 'doc do monstro AINDA cabe em 1MiB (' + (r3.tamanhoDoc / 1024).toFixed(0) + 'KB)',
    'sem o teto de jogos + corte das observações, este é o tamanho que fazia o Firestore recusar a gravação inteira');
  ok(r3.truncado === true, 'o doc guardou só os jogos recentes (o acervo completo está no canônico)');
  ok(r3.gidsUnicos >= 2000, 'o acervo canônico recebeu todas as 2.000 partidas (' + r3.gidsUnicos + ')');
  // O VEREDITO DE COMPLETUDE lê o total REPRESENTADO, nunca o tamanho do array. Se ler o
  // array, um perfil truncado fica eternamente "incompleto": barra travada em "600 de
  // 2000" e botão preso em "▶️ Continuar de onde parou" com tudo já lido.
  ok(r3.jogosNoDoc < r3.jogosTotal, 'o array do doc é MENOR que o total (é o caso que arma a pegadinha): ' +
    r3.jogosNoDoc + ' no doc vs ' + r3.jogosTotal + ' representados');
  ok(r3.jogosTotal >= r3.declarados, 'gamesTotal >= declaredGames → a completude fecha (é o que _lzImportComplete consome)',
    'gamesTotal=' + r3.jogosTotal + ' declaredGames=' + r3.declarados);

  // ── CENÁRIO 4: perfil pequeno não regrediu ──────────────────────────────
  console.log('\n🙋 CENÁRIO 4 — perfil pequeno (81 jogos) continua funcionando');
  await page.close();
  page = await novaPagina(browser);
  const pequeno = { games: 81, tours: 11, ranks: 6, gamesPerTour: 3 };
  const r4 = await rodarCenario(page, pequeno, 'pequeno');
  console.log('     rodadas=' + r4.rodadas + ' jogos=' + r4.jogosTotal + '/' + r4.declarados +
    ' doc=' + (r4.tamanhoDoc / 1024).toFixed(0) + 'KB');
  ok(!r4.erro, 'perfil pequeno não falhou', r4.erro);
  ok(r4.jogosTotal >= 81, 'trouxe os 81 jogos (veio ' + r4.jogosTotal + ')');
  ok(r4.rodadas === 1, 'perfil pequeno resolve em UMA rodada (nada de encadeamento à toa)', 'rodadas=' + r4.rodadas);
  ok(r4.truncado !== true, 'doc do perfil pequeno guarda o histórico inteiro (sem truncar)');

  // ── CENÁRIO 5: letzplay pede pausa no meio → tem que CONTINUAR sozinho ──
  // Este é o caso REAL que quebrava (14/jul: "no 11º de 20 o letzplay pediu pra esperar e
  // ficou em 'a busca continua…' pra sempre"). O orçamento de paciência estoura de
  // propósito aqui: a rodada tem que checkpointar e o APP tem que disparar a próxima
  // sozinho, sem clique, até terminar.
  console.log('\n🐢 CENÁRIO 5 — letzplay pede pausa no meio (leitura tem que continuar sozinha)');
  await page.close();
  page = await novaPagina(browser);
  // `quantos` = quantas recusas seguidas o letzplay dá. 16 é o bastante pra estourar o
  // orçamento (7 esperas por rodada neste tamanho) duas vezes e provar o encadeamento,
  // sem fazer a suíte dormir minutos.
  const r5 = await rodarCenario(page, pequeno, 'throttle', { apos: 12, quantos: 16 });
  console.log('     rodadas=' + r5.rodadas + ' pausas=' + r5.pausas + ' esperas=' + r5.throttles +
    ' jogos=' + r5.jogosTotal + '/' + r5.declarados);
  ok(!r5.erro, 'a leitura não falhou apesar da pausa do letzplay', r5.erro);
  ok(r5.throttles > 0, 'o orçamento de paciência foi realmente exercitado (' + r5.throttles + ' esperas)');
  ok(r5.pausas > 0, 'a rodada CHECKPOINTOU e o app encadeou a seguinte sozinho (' + r5.pausas + '×)');
  ok(r5.rodadas > 1, 'houve mais de uma rodada, sem clique do usuário (' + r5.rodadas + ')');
  ok(r5.jogosTotal >= 81, 'terminou com os 81 jogos mesmo assim (veio ' + r5.jogosTotal + ')');
  ok(r5.cursor && r5.cursor.complete === true, 'o cursor terminou completo');

  // ── CENÁRIO 6: 2ª leitura em cima do RESULTADO REAL da 1ª — não pode reler NADA ──
  // O teste que faltava e que teria pego o bug na hora: em vez de um `prior` escrito à mão,
  // usa o fullImport que a própria leitura produziu. Foi assim que "repassando todos os
  // torneios de novo" passou despercebido — o prior de laboratório tinha
  // `name !== categoryRaw`, e o import REAL passou a gravar categoryRaw = nome.
  console.log('\n🔁 CENÁRIO 6 — segunda leitura sobre o resultado REAL da primeira');
  await page.close();
  page = await novaPagina(browser);
  const r6a = await rodarCenario(page, pequeno, 'primeira');
  const r6 = await page.evaluate(() => {
    const imp = window.__APP.imp;                    // o que a 1ª leitura REALMENTE gravou
    window.__LZ.hits = {};
    window.__APP.rodadas = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.escritasCanonicas = 0; window.__APP.docsPorGid = {};
    window.__APP.start('CamilaExemplo', 'uid-camila', imp, imp.lzCursor);
    return true;
  });
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 120000 });
  const r6b = await page.evaluate(() => {
    const u = Object.keys(window.__LZ.hits);
    return { erro: window.__APP.erro, total: u.length,
      torneios: u.filter(x => /\/tournaments\/\d+$/.test(x)).length,
      rankings: u.filter(x => /\/rankings\/\d+$/.test(x)).length,
      paginas: u.filter(x => /\/CamilaExemplo\/matches/.test(x)).length };
  });
  console.log('     requisições na 2ª: ' + r6b.total + ' (torneios ' + r6b.torneios +
    ' · rankings ' + r6b.rankings + ' · páginas ' + r6b.paginas + ')');
  ok(!r6b.erro, 'a segunda leitura não falhou', r6b.erro);
  ok(r6b.torneios === 0, 'NENHUM torneio foi lido de novo (era isto que refazia os 35 um a um)',
    r6b.torneios + ' torneios re-buscados');
  ok(r6b.rankings === 0, 'NENHUM ranking foi lido de novo', r6b.rankings + ' rankings re-buscados');
  ok(r6b.paginas <= 1, 'não repaginou o histórico (no máximo a página de conferência)',
    r6b.paginas + ' páginas relidas');

  // ── CENÁRIO 6b: cursor SOZINHO basta pra pular ─────────────────────────────
  // 3 dos 35 torneios da Camila não publicam classificação; sem classificação eles não
  // entram no footprint, e a regra antiga ("cursor E detalhe") os tratava como não-lidos
  // e os rebuscava em TODA rodada — "32 de 35" que nunca fecha. O cursor só é marcado
  // depois de uma leitura que deu certo; ele é prova suficiente de "esta página foi aberta".
  console.log('\n🕳️  CENÁRIO 6b — competição sem classificação não é rebuscada pra sempre');
  const r6c = await page.evaluate(() => {
    const imp = window.__APP.imp;
    // apaga TODO o detalhe conhecido: sobra só o cursor
    const magro = Object.assign({}, imp, { footprint: [] });
    window.__LZ.hits = {};
    window.__APP.rodadas = 0; window.__APP.done = false; window.__APP.erro = null;
    window.__APP.start('CamilaExemplo', 'uid-camila', magro, imp.lzCursor);
    return { tours: Object.keys((imp.lzCursor || {}).toursDone || {}).length,
             ranks: Object.keys((imp.lzCursor || {}).ranksDone || {}).length };
  });
  await page.waitForFunction(() => window.__APP.done === true, null, { timeout: 120000 });
  const r6d = await page.evaluate(() => {
    const u = Object.keys(window.__LZ.hits);
    return { erro: window.__APP.erro,
      torneios: u.filter(x => /\/tournaments\/\d+$/.test(x)).length,
      rankings: u.filter(x => /\/rankings\/\d+$/.test(x)).length,
      lidosT: window._lzTournamentsRead ? window._lzTournamentsRead(window.__APP.imp) : null };
  });
  console.log('     cursor tinha ' + r6c.tours + ' torneios · re-buscados agora: ' + r6d.torneios);
  ok(!r6d.erro, 'a leitura sem footprint não falhou', r6d.erro);
  ok(r6d.torneios === 0, 'sem footprint nenhum, o cursor sozinho segurou os torneios',
    r6d.torneios + ' rebuscados');
  ok(r6d.rankings === 0, 'idem rankings', r6d.rankings + ' rebuscados');

  await page.close();
  await browser.close();
  console.log('\n' + (falhas ? '❌ ' + falhas + ' de ' + testes + ' falharam' : '✅ ' + testes + ' verificações passaram'));
  process.exit(falhas ? 1 : 0);
})();
