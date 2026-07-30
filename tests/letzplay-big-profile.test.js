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
const FIXTURE = `
const CLUB = 'paineiras-bt';
const PER_PAGE = 14;

function mkCard(g) {
  const href = g.tid ? ('/' + CLUB + '/tournaments/' + g.tid) : ('/' + CLUB + '/rankings/' + g.rid);
  const catText = g.tid
    ? ('Grupos • Finals ' + g.tid + ' - Feminina C')
    : ('Social Fem C / B | 2026 Rodada: ' + ((g.i % 9) + 1));
  const meWin = g.i % 3 !== 0;
  const s1 = meWin ? 6 : 4, s2 = meWin ? 3 : 6;
  return \`<div class="row match">
    <div>\${g.date}</div>
    <div><a href="\${href}">\${catText}</a></div>
    <div class="col-xs-12">
      <div class="row match-player">
        <div class="match-player-info"><a href="/CamilaExemplo">av</a><a href="/Parceira\${g.i % 40}">av</a></div>
        <span class="match-players-double">Camila Exemplo Parceira\${g.i % 40} Sobrenome</span>
        <div>\${s1}</div>
      </div>
      <div class="row match-player">
        <div class="match-player-info"><a href="/AdvUm\${g.i % 90}">av</a><a href="/AdvDois\${g.i % 77}">av</a></div>
        <span class="match-players-double">AdvUm\${g.i % 90} Sobrenome AdvDois\${g.i % 77} Sobrenome</span>
        <div>\${s2}</div>
      </div>
    </div>
  </div>\`;
}
function pager(page, max) {
  let h = '';
  for (let p = 1; p <= max; p++) h += '<a href="?page=' + p + '">' + p + '</a>';
  return h;
}
// O universo: N_GAMES jogos, N_TOUR torneios (4 jogos cada), resto em N_RANK rankings.
function build(cfg) {
  const games = [];
  let i = 0;
  for (let t = 0; t < cfg.tours && i < cfg.games; t++) {
    for (let k = 0; k < cfg.gamesPerTour && i < cfg.games; k++, i++) {
      games.push({ i, date: 'Sábado, ' + String(1 + (i % 28)).padStart(2,'0') + '/' + String(1 + (i % 12)).padStart(2,'0') + '/26 às 08:00hs', tid: 300000 + t });
    }
  }
  for (let r = 0; i < cfg.games; i++, r++) {
    games.push({ i, date: 'Sábado, ' + String(1 + (i % 28)).padStart(2,'0') + '/' + String(1 + (i % 12)).padStart(2,'0') + '/26 às 08:00hs', rid: 90000 + (r % cfg.ranks) });
  }
  return games;
}

window.__LZ = {
  hits: {},          // url → quantas vezes foi pedida
  cfg: null,
  games: null,
  bloqueio: null, nReq: 0, nBloqueios: 0,
  init(cfg, bloqueio) {
    this.cfg = cfg; this.games = build(cfg); this.hits = {};
    this.bloqueio = bloqueio || null; this.nReq = 0; this.nBloqueios = 0;
  },
  serve(url) {
    const u = url.replace('https://letzplay.me', '');
    this.hits[u] = (this.hits[u] || 0) + 1;
    const m = {};
    // perfil: /{handle}
    if (/^\\/CamilaExemplo$/.test(u)) {
      return '<html><head><title>Camila Exemplo - Letzplay</title></head><body>' +
        this.cfg.games + ' Jogos ' + this.cfg.ranks + ' Rankings ' + this.cfg.tours + ' Torneios' +
        '</body></html>';
    }
    // lista de torneios: /{handle}/tournaments[?page=]
    let mm = u.match(/^\\/CamilaExemplo\\/tournaments(?:\\?page=(\\d+))?$/);
    if (mm) {
      const page = +(mm[1] || 1), perPage = 12;
      const maxPage = Math.ceil(this.cfg.tours / perPage);
      let h = '<html><body>';
      for (let t = (page-1)*perPage; t < Math.min(this.cfg.tours, page*perPage); t++) {
        h += '<a href="/' + CLUB + '/tournaments/' + (300000+t) + '">Interno Ciclo ' + t + ' - Feminina C</a>';
      }
      h += pager(page, maxPage) + '</body></html>';
      return h;
    }
    // histórico geral: /{handle}/matches[?page=]
    mm = u.match(/^\\/CamilaExemplo\\/matches(?:\\?page=(\\d+))?$/);
    if (mm) {
      const page = +(mm[1] || 1);
      const maxPage = Math.ceil(this.games.length / PER_PAGE);
      const slice = this.games.slice((page-1)*PER_PAGE, page*PER_PAGE);
      return '<html><body>' + slice.map(mkCard).join('') + pager(page, maxPage) + '</body></html>';
    }
    // página do torneio: /{club}/tournaments/{id}  → nome + classificação + logo
    mm = u.match(/^\\/([^\\/]+)\\/tournaments\\/(\\d+)$/);
    if (mm) {
      const tid = mm[2];
      const mine = this.games.filter(g => String(g.tid) === tid);
      const v = mine.filter(g => g.i % 3 !== 0).length, d = mine.length - v;
      let rows = '<div class="row"><div class="points">1º</div><div class="break-line">Camila Exemplo<br>Parceira 1</div>' +
        '<a href="/CamilaExemplo">c</a><a href="/Parceira1">p</a><span>' + v + ' Vitórias ' + d + ' Derrotas</span></div>';
      for (let p = 2; p <= 4; p++) {
        rows += '<div class="row"><div class="points">' + p + 'º</div><div class="break-line">Outra ' + p + '<br>Dupla ' + p + '</div>' +
          '<a href="/Outra' + p + '">o</a><a href="/Dupla' + p + '">d</a><span>1 Vitórias 2 Derrotas</span></div>';
      }
      return '<html><body><h2 class="title with-avatar">Interno Ciclo ' + tid + ' - Feminina C</h2>' +
        '<div><img src="https://res.cloudinary.com/lptennis/x.jpg"></div>' +
        '<div class="table-group"><div class="table-field-title"><b>Grupo 1</b></div>' + rows + '</div>' +
        '</body></html>';
    }
    // jogos do torneio: /{club}/tournaments/{id}/matches[?page=]
    mm = u.match(/^\\/([^\\/]+)\\/tournaments\\/(\\d+)\\/matches(?:\\?page=(\\d+))?$/);
    if (mm) {
      const tid = mm[2], page = +(mm[3] || 1), per = 3;
      const mine = this.games.filter(g => String(g.tid) === tid);
      const maxPage = Math.max(1, Math.ceil(mine.length / per));
      const slice = mine.slice((page-1)*per, page*per);
      return '<html><body>' + slice.map(mkCard).join('') + pager(page, maxPage) + '</body></html>';
    }
    // página do ranking: /{club}/rankings/{id} → nome + classificação (110 duplas)
    mm = u.match(/^\\/([^\\/]+)\\/rankings\\/(\\d+)$/);
    if (mm) {
      let rows = '';
      for (let p = 1; p <= 110; p++) {
        const nome = (p === 40) ? 'Camila Exemplo' : ('Atleta ' + p);
        const h = (p === 40) ? 'CamilaExemplo' : ('Atleta' + p);
        rows += '<div class="row"><a href="/' + h + '">' + nome + '</a>' +
          '<div class="break-line">' + nome + '<br>Dupla ' + p + '</div>' +
          '<div class="points">' + (2000 - p*7) + '</div></div>';
      }
      return '<html><body><h2 class="title with-avatar">Competitivo Fem B | 2026 Etapa ' + mm[2] + '</h2>' +
        '<div><img src="https://res.cloudinary.com/lptennis/y.jpg"></div>' +
        '<div class="table-ranking">' + rows + '</div></body></html>';
    }
    return '<html><body></body></html>';
  }
};
`;

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
        // ORDEM DE CONCLUSÃO: os JOGOS têm que ser a última barra a fechar. O dono viu
        // "Jogos 478 de 478 (100%)" com "Rankings 20 de 29" e reclamou com razão — as
        // competições ficavam se resolvendo DEPOIS dos jogos acabarem.
        var _c = d.counts || {};
        if (_c.gY && _c.g >= _c.gY) {
          if (_c.rY && _c.r < _c.rY) self.jogosAntesDosRankings++;
          if (_c.tY && _c.t < _c.tY) self.jogosAntesDosTorneios++;
        }
        // TEXTO SEM SUJEITO: "2 de 41" não informa nada a quem está olhando.
        var _n = (d.current && d.current.note) || '';
        if (/^\s*\d+\s+de\s+\d+\s*$/.test(_n)) self.notasSemSujeito.push(_n);
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
  for (const f of ['lib/letzplay-rating.js', 'lib/letzplay-import.js', 'lib/letzplay-extract.js', 'lib/letzplay-flow.js']) {
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
  // 7. nenhum texto de progresso é um número solto ("2 de 41")
  ok(r.nSemSujeito === 0, 'nenhuma nota de progresso é um número sem sujeito ("2 de 41")',
    r.nSemSujeito + ' notas assim, ex: ' + (r.notasSemSujeito || []).join(' | '));

  // ── CENÁRIO 2: retomada — cursor pela metade ─────────────────────────────
  console.log('\n⏸️  CENÁRIO 2 — retomada de um cursor pela metade (não relê o que já leu)');
  await page.close();
  page = await novaPagina(browser);
  await page.evaluate(async (cfg) => {
    window.__LZ.init(cfg);
    // cursor fingindo: torneios todos lidos, histórico geral parado na página 20
    const cur = { v: 3, handle: 'CamilaExemplo', toursDone: {}, pageDone: 20, pagesTotal: 34, complete: false };
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
  const paginasLidas = urls2.filter(u => /^\/CamilaExemplo\/matches/.test(u));
  console.log('     requisições na retomada: ' + urls2.length + ' (páginas de histórico: ' + paginasLidas.length + ')');
  ok(!r2.erro, 'a retomada não falhou', r2.erro);
  ok(pediuTorneio.length === 0, 'NÃO reabriu nenhum torneio já lido (cursor)', pediuTorneio.slice(0, 4).join(', '));
  const antesDe20 = paginasLidas.filter(u => {
    const m = u.match(/page=(\d+)/); return m ? (+m[1] <= 20) : true;
  });
  ok(antesDe20.length === 0, 'NÃO releu nenhuma página anterior à do cursor (página 20)', antesDe20.join(', '));
  ok(r2.cursor && r2.cursor.complete === true, 'a retomada chegou ao fim');

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

  await page.close();
  await browser.close();
  console.log('\n' + (falhas ? '❌ ' + falhas + ' de ' + testes + ' falharam' : '✅ ' + testes + ' verificações passaram'));
  process.exit(falhas ? 1 : 0);
})();
