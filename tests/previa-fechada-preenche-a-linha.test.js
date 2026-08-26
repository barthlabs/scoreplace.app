/* 📣 NOVIDADES + 🏅 SEUS ÚLTIMOS RESULTADOS — a prévia fechada PREENCHE A LINHA
 *   node tests/previa-fechada-preenche-a-linha.test.js
 *
 * PEDIDO DO DONO (19/ago/2026, com print da tela inicial):
 *   "quando a largura da tela permitir, podemos colocar 2 cards de jogo ou até 3 na sessão
 *    novidades e seus últimos resultados, em vez de deixar o buraco ali. e o botão 'ver os
 *    X jogos...' ajustado de acordo."
 *
 * O QUE ESTAVA ERRADO: as duas seções nascem FECHADAS mostrando UM card. A grade delas é
 * `repeat(auto-fill, minmax(280px,1fr))` — em tela larga ela abre 2, 3 ou 4 COLUNAS. O card
 * ficava sozinho na primeira coluna e o resto da linha era buraco. A seção ABERTA já fazia
 * o certo desde a 1.8.67 ("se cabe 1 jogo na largura da tela é 1 jogo, se cabem 3 são 3") —
 * fechada, não.
 *
 * POR QUE NÃO DEU PRA RESOLVER SÓ NO CSS: o corte era POSICIONAL (`[data-mr-card] ~ *` /
 * `[data-nov-card] ~ *`, "some do 2º card em diante") e seletor posicional não tem como ser
 * afrouxado depois. E, principalmente, a CONTAGEM DO CONVITE é TEXTO — CSS não conta. O
 * dono pediu o botão "ajustado de acordo", e botão que promete contagem errada é pior que
 * o buraco. Então quem decide quantos cards ficam à vista tem que ser QUEM ESCREVE O TEXTO:
 *   • o build marca `data-sp-extra` em tudo que não entra na prévia de 1 COLUNA
 *     (idêntico ao comportamento antigo — é o 1º paint e o fallback se a medição falhar);
 *   • `_spSyncCollapsePreview` mede as colunas REAIS (valor computado da grade, zero
 *     breakpoint escrito à mão), tira o atributo de quem couber e reescreve o convite.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. o corte é por ATRIBUTO (`data-sp-extra`) nas duas seções, com `!important`;
 *   B. o build entrega a prévia de 1 coluna: exatamente 1 card sem o atributo por grade,
 *      e o cabeçalho de grupo ANTES dele entra junto (o card à vista não fica sem contexto);
 *   C. `_spPreviewLen` (função PURA e REAL) enche a linha até o nº de colunas e PARA num
 *      elemento de linha inteira — um cabeçalho no meio parte a fileira em duas;
 *   D. rodando o `_spSyncCollapsePreview` REAL contra um DOM de mentira, o nº de cards à
 *      vista acompanha as colunas e o convite diz EXATAMENTE o que sobrou;
 *   E. sobrando ZERO, o convite some dos dois lugares (tag e rodapé) — "ver mais" que não
 *      mostra mais nada é ruído;
 *   F. o texto tem SINGULAR de verdade ("ver o jogo anterior") — com 2 cards o código
 *      antigo escrevia "ver os 1 jogos anteriores";
 *   G. a medição NÃO re-renderiza a dashboard e NÃO usa `content-visibility`
 *      ([[project_dashboard_no_rerender]]);
 *   H. quem observa a largura observa a SEÇÃO e só age quando a LARGURA muda — esconder
 *      card muda a ALTURA, e agir nisso seria laço (medir → esconder → medir).
 *
 * CONTROLE: contra a 1.9.63 (o código anterior) esta suíte fica VERMELHA — receita:
 *   git show HEAD:js/views/dashboard.js > /tmp/dash-antigo.js
 *   SP_DASHBOARD_SRC=/tmp/dash-antigo.js node tests/previa-fechada-preenche-a-linha.test.js
 */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');   // store.js + bracket.js REAIS
const W = H.sandbox;

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
function contar(s, needle) { let n = 0, i = 0; while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; }

const SRC = fs.readFileSync(process.env.SP_DASHBOARD_SRC || path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

/* ⚠️ A pílula "ver mais/ver menos" foi IÇADA pra fora de `renderDashboard` (26/ago) — presa
 * lá dentro, ela só existia depois de a dashboard renderizar, e quem abria um TORNEIO
 * direto ficava sem botão. Este harness recorta o corpo de `renderDashboard`, então o
 * recorte deixou de conter a definição. Pegamos a REAL do fonte — stub falsificaria o
 * teste, que afirma a marcação dela. Ver tests/pilula-ver-mais.js. */
W._verMaisTag = require('./pilula-ver-mais.js')(SRC);

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 1 — o HTML que o build entrega (prévia de 1 coluna + regras de CSS)
// ═══════════════════════════════════════════════════════════════════════════
const AGORA = Date.now();
function jogo(id, label, a1, a2, b1, b2, extra) {
  return Object.assign({
    id: id, label: label, isMonarch: true, round: 0,
    p1: a1 + ' / ' + a2, p2: b1 + ' / ' + b2, team1: [a1, a2], team2: [b1, b2]
  }, extra || {});
}
// 3 jogos MEUS do mesmo grupo (bloco dos confirmados agrupa: cabeçalho + 3 cards) e
// 3 de OUTRAS pessoas em DOIS grupos (Novidades: cabeçalho + 2 cards, cabeçalho + 1 card).
const MATCHES = [
  jogo('m-Q1', 'R1 Grupo Q • Jogo 1', 'Erika de Paula', 'Rodrigo Barth', 'Livia Morais', 'Loraine Soares',
    { scoreP1: 6, scoreP2: 5, resultAt: AGORA - 3600000, winner: 'Erika de Paula / Rodrigo Barth' }),
  jogo('m-Q2', 'R1 Grupo Q • Jogo 2', 'Erika de Paula', 'Loraine Soares', 'Livia Morais', 'Rodrigo Barth',
    { scoreP1: 6, scoreP2: 3, resultAt: AGORA - 7200000, winner: 'Erika de Paula / Loraine Soares' }),
  jogo('m-Q3', 'R1 Grupo Q • Jogo 3', 'Erika de Paula', 'Livia Morais', 'Loraine Soares', 'Rodrigo Barth',
    { scoreP1: 1, scoreP2: 0, resultAt: AGORA - 10800000, winner: 'Erika de Paula / Livia Morais' }),
  jogo('m-S1', 'R1 Grupo S • Jogo 1', 'Vanessa Bianchini', 'Bruna Arilla', 'Luciana Marinho', 'Adriana Zalaf',
    { scoreP1: 6, scoreP2: 3, resultAt: AGORA - 5400000, winner: 'Vanessa Bianchini / Bruna Arilla' }),
  jogo('m-S2', 'R1 Grupo S • Jogo 2', 'Vanessa Bianchini', 'Luciana Marinho', 'Bruna Arilla', 'Adriana Zalaf',
    { scoreP1: 5, scoreP2: 6, resultAt: AGORA - 9000000, winner: 'Bruna Arilla / Adriana Zalaf' }),
  jogo('m-T1', 'R1 Grupo T • Jogo 1', 'Luiza Ruic', 'Lucely Lustre', 'Elide Luccas', 'Moreno',
    { scoreP1: 6, scoreP2: 4, resultAt: AGORA - 12600000, winner: 'Luiza Ruic / Lucely Lustre' })
];
const TOUR = {
  id: 'tour_confra', name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
  ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
  resultEntry: 'players', creatorUid: 'u-rb',
  participants: [{ uid: 'u-rb', displayName: 'Rodrigo Barth' }],
  rounds: [{ matches: MATCHES }]
};

const _store = {};
W.localStorage = W.localStorage || {
  getItem: function (k) { return (k in _store) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};
function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  if (i < 0) throw new Error('_buildMyResultsHtml não encontrada em dashboard.js');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  if (j < 0) throw new Error('fim de _buildMyResultsHtml não encontrado (o return mudou?)');
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}
function render(tours) {
  W.AppStore.tournaments = tours;
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };
  W.AppStore.isOrganizer = function (t) { return !!(t && t.creatorUid === 'u-rb'); };
  W.localStorage.setItem('scoreplace_collapse_novidades', '1');
  W.localStorage.setItem('scoreplace_collapse_myresults', '1');
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + extraiBuildMyResults(SRC) + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, tours);
  const _h = fn();
  // ⭐ 2.0.82 — o extra da seção de novidades passou a nascer só no clique
  // (ordem do dono: "não carregar tudo antes que alguém clicasse no mostrar
  // mais"). Ele fica em `window._novExtraPend`. Este teste confere ORDEM e
  // MARCAÇÃO do conteúdo COMPLETO, então devolve o guardado pra dentro da
  // seção — mesma coisa que o usuário vê ao abrir. ⛔ A seção segue FECHADA:
  // a asserção F1 mede o texto do convite, que só existe fechada.
  const _pend = W._novExtraPend || '';
  if (!_pend) return _h;
  const _iMr = _h.indexOf('id="meus-resultados-section"');
  const _iNov = _h.indexOf('id="novidades-section"');
  if (_iMr > _iNov && _iNov >= 0) return _h.slice(0, _iMr) + _pend + _h.slice(_iMr);
  return _h + _pend;
}
const HTML = render([TOUR]);
function secaoNov(h) { const i = h.indexOf('id="novidades-section"'); const j = h.indexOf('id="meus-resultados-section"'); return i < 0 ? '' : (j > i ? h.slice(i, j) : h.slice(i)); }
function secaoMr(h) { const i = h.indexOf('id="meus-resultados-section"'); const j = h.indexOf('id="novidades-section"'); return i < 0 ? '' : (j > i ? h.slice(i, j) : h.slice(i)); }
const NOV = secaoNov(HTML);
const MR = secaoMr(HTML);

ok(NOV.length > 0 && MR.length > 0, 'as duas seções são renderizadas');

// ── A. o corte é por ATRIBUTO, nas duas seções ──────────────────────────────
ok(NOV.indexOf('#novidades-grid > [data-sp-extra]{display:none !important;}') !== -1,
  'A1 — Novidades corta por [data-sp-extra] (não mais pelo posicional [data-nov-card] ~ *)');
ok(MR.indexOf('[data-mr-first] [data-sp-extra]{display:none !important;}') !== -1,
  'A2 — "Seus últimos resultados" idem, dentro do bloco à vista');
ok(NOV.indexOf('[data-nov-card] ~ *') === -1 && MR.indexOf('[data-mr-card] ~ *') === -1,
  'A3 — nenhum resquício do corte posicional (ele impediria reabrir os cards que couberem)');
// o card dos confirmados nasce com display:flex INLINE — sem !important o corte não pega
ok(contar(NOV + MR, 'display:none !important') >= 3,
  'A4 — as regras de corte usam !important (o card tem display inline, que venceria)');

// ── B. o build entrega a prévia de 1 COLUNA (1º paint + fallback) ───────────
(function () {
  // Em cada grade: exatamente UM card sem `data-sp-extra`, e é o primeiro.
  const cardsNov = NOV.split('data-nov-card="1"').slice(1);
  const semAtrNov = cardsNov.filter(function (c) { return c.slice(0, 30).indexOf('data-sp-extra') === -1; });
  ok(cardsNov.length === 3 && semAtrNov.length === 1,
    'B1 — Novidades: 3 cards, só o 1º sem data-sp-extra (prévia de 1 coluna) — vi ' + cardsNov.length + '/' + semAtrNov.length);
  const cardsMr = MR.split('data-mr-card="1"').slice(1);
  const semAtrMr = cardsMr.filter(function (c) { return c.slice(0, 30).indexOf('data-sp-extra') === -1; });
  ok(cardsMr.length === 3 && semAtrMr.length === 1,
    'B2 — "Seus últimos resultados": 3 cards, só o 1º sem data-sp-extra — vi ' + cardsMr.length + '/' + semAtrMr.length);
})();
(function () {
  // O cabeçalho do 1º grupo vem ANTES do 1º card → entra na prévia (contexto do card à
  // vista). O do 2º grupo vem depois → sai. Se o 1º entrasse marcado, a seção fechada
  // mostraria um card sem dizer de que grupo/torneio ele é.
  const heads = NOV.split('data-nov-head="1"').slice(1);
  ok(heads.length === 2, 'B3 — Novidades tem 2 cabeçalhos de grupo (Grupo S e Grupo T) — vi ' + heads.length);
  ok(heads[0].slice(0, 30).indexOf('data-sp-extra') === -1,
    'B4 — o cabeçalho do 1º grupo ENTRA na prévia (o card à vista não fica sem contexto)');
  ok(heads[1].slice(0, 30).indexOf('data-sp-extra') !== -1,
    'B5 — o cabeçalho do 2º grupo fica de fora (senão anunciaria cards escondidos)');
})();

// ── F. singular de verdade no convite ──────────────────────────────────────
ok(NOV.indexOf('ver os 2 jogos anteriores') !== -1,
  'F1 — 3 cards e 1 na prévia → "ver os 2 jogos anteriores"');
ok(MR.indexOf('ver os 2 anteriores') !== -1,
  'F2 — "Seus últimos resultados" idem, sem a palavra "jogos"');

// ═══════════════════════════════════════════════════════════════════════════
// PARTE 2 — a MEDIÇÃO: as funções REAIS, extraídas do dashboard.js
// ═══════════════════════════════════════════════════════════════════════════
// Não há jsdom no projeto, então o DOM é de mentira — mas o CÓDIGO é o real. Réplica de
// lógica já deixou suíte verde sobre código revertido neste repo; aqui só o DOM é stub.
function extraiMedicao(src) {
  const i = src.indexOf('window._spPreviewLen = function');
  const j = src.indexOf('window._spWatchPreviewWidth = function');
  if (i < 0 || j < 0) throw new Error('bloco de medição (_spPreviewLen … _spWatchPreviewWidth) não encontrado');
  return src.slice(i, j);
}
function extraiVerMaisTexto(src) {
  const i = src.indexOf('function _spVerMaisTexto(');
  if (i < 0) throw new Error('_spVerMaisTexto não encontrada');
  return src.slice(i, src.indexOf('\n    }', i) + 6);
}

function El(attrs) { this._a = Object.assign({}, attrs || {}); this.children = []; this.style = {}; this.textContent = ''; this.parentNode = null; }
El.prototype.hasAttribute = function (n) { return this._a[n] != null; };
El.prototype.getAttribute = function (n) { return this._a[n] == null ? null : this._a[n]; };
El.prototype.setAttribute = function (n, v) { this._a[n] = String(v); };
El.prototype.removeAttribute = function (n) { delete this._a[n]; };
El.prototype.add = function (kid) { kid.parentNode = this; this.children.push(kid); return kid; };
El.prototype.querySelectorAll = function (sel) {
  const nome = /^\[([a-z-]+)\]$/.exec(sel);
  if (!nome) throw new Error('seletor não suportado pelo DOM de mentira: ' + sel);
  const out = [];
  (function walk(n) { n.children.forEach(function (k) { if (k.hasAttribute(nome[1])) out.push(k); walk(k); }); })(this);
  return out;
};
El.prototype.querySelector = function (sel) { return this.querySelectorAll(sel)[0] || null; };

// Monta o DOM das duas seções e roda o _spSyncCollapsePreview REAL com N colunas.
// grupos = [nº de cards do grupo 1, do grupo 2, ...]; grupo com cabeçalho de linha inteira.
function cenario(cols, gruposNov, cardsMr, colapsada) {
  const byId = {};
  const novSec = new El({ 'data-nov-collapsed': colapsada === false ? '0' : '1' });
  const novGrid = new El({});
  novSec.add(novGrid);
  gruposNov.forEach(function (n) {
    novGrid.add(new El({ 'data-nov-head': '1' }));
    for (let i = 0; i < n; i++) novGrid.add(new El({ 'data-nov-card': '1' }));
  });
  const mrSec = new El({ 'data-mr-collapsed': colapsada === false ? '0' : '1' });
  const mrBody = new El({});
  const mrBloco = new El({ 'data-mr-first': '1' });
  const mrGrid = new El({});
  mrSec.add(mrBody); mrBody.add(mrBloco); mrBloco.add(mrGrid);
  for (let i = 0; i < cardsMr; i++) mrGrid.add(new El({ 'data-mr-card': '1' }));

  const novTag = new El({}), novHintP = new El({}), novHint = new El({});
  novHintP.add(novHint);
  const mrTag = new El({}), mrHintP = new El({}), mrHint = new El({});
  mrHintP.add(mrHint);

  byId['novidades-section'] = novSec; byId['novidades-grid'] = novGrid;
  byId['nov-toggle-tag'] = novTag; byId['novidades-hint'] = novHint;
  byId['meus-resultados-section'] = mrSec; byId['meus-resultados-body'] = mrBody;
  byId['mr-toggle-tag'] = mrTag; byId['meus-resultados-hint'] = mrHint;

  novGrid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(280px,1fr))';
  mrGrid.style.gridTemplateColumns = 'repeat(auto-fill,minmax(280px,1fr))';
  const win = {
    // A régua REAL é sempre lida da grade original (o código restaura `__spBase` antes de
    // medir); aqui o stub devolve as `cols` do cenário, que é o que o navegador diria.
    getComputedStyle: function () { return { gridTemplateColumns: new Array(cols).fill('280px').join(' ') }; }
  };
  const doc = { getElementById: function (id) { return byId[id] || null; } };
  new Function('window', 'document',
    extraiVerMaisTexto(SRC).replace(/^\s*function/, 'window._spVerMaisTexto = function') + ';\n' + extraiMedicao(SRC)
  )(win, doc);
  win._spSyncCollapsePreview();

  const vistos = function (grid, attr) {
    return grid.children.filter(function (k) { return k.hasAttribute(attr) && !k.hasAttribute('data-sp-extra'); }).length;
  };
  return {
    novTpl: novGrid.style.gridTemplateColumns, novJustify: novGrid.style.justifyContent,
    novCards: vistos(novGrid, 'data-nov-card'), novHint: novHint.textContent,
    novHintVisivel: novHintP.style.display !== 'none', novTagVisivel: novTag.style.display !== 'none',
    novTag: novTag.textContent,
    mrCards: vistos(mrGrid, 'data-mr-card'), mrHint: mrHint.textContent,
    mrHintVisivel: mrHintP.style.display !== 'none',
    // o cabeçalho do 1º grupo tem que continuar à vista; o do 2º, não
    heads: novGrid.children.filter(function (k) { return k.hasAttribute('data-nov-head'); })
      .map(function (k) { return !k.hasAttribute('data-sp-extra'); })
  };
}

// Existindo a medição, roda tudo; não existindo (controle contra a versão antiga), acusa
// UMA vez e segue — assim as falhas da PARTE 1 aparecem em vez de morrerem numa exceção.
let TEM_MEDICAO = true;
try { extraiMedicao(SRC); extraiVerMaisTexto(SRC); }
catch (e) { TEM_MEDICAO = false; ok(false, 'a medição da prévia existe no dashboard.js — ' + e.message); }

// ── C. a função PURA enche a linha e para no cabeçalho ──────────────────────
if (TEM_MEDICAO) (function () {
  const win = {};
  new Function('window', 'document', extraiMedicao(SRC))(win, { getElementById: function () { return null; } });
  const K = ['full', 'card', 'card', 'card', 'full', 'card'];
  ok(win._spPreviewLen(K, 1).cards === 1, 'C1 — 1 coluna → 1 card (o de sempre)');
  ok(win._spPreviewLen(K, 2).cards === 2, 'C2 — 2 colunas → 2 cards');
  ok(win._spPreviewLen(K, 3).cards === 3, 'C3 — 3 colunas → 3 cards');
  ok(win._spPreviewLen(K, 4).cards === 3,
    'C4 — 4 colunas mas o grupo só tem 3: PARA no cabeçalho seguinte (ele parte a fileira em duas)');
  ok(win._spPreviewLen(K, 3).els === 4,
    'C5 — a prévia leva o cabeçalho do 1º grupo junto (4 elementos para 3 cards)');
  ok(win._spPreviewLen(['card', 'card', 'card'], 2).cards === 2,
    'C6 — grade plana (sem cabeçalho): 2 colunas → 2 cards');
  ok(win._spPreviewLen(K, 0).cards === 1 && win._spPreviewLen(K, -3).cards === 1,
    'C7 — medição inválida cai em 1 coluna (errar mostrando de menos, nunca de mais)');
})();

// ── D. o convite diz EXATAMENTE o que sobrou ────────────────────────────────
if (TEM_MEDICAO) (function () {
  const c1 = cenario(1, [3, 2], 3);
  ok(c1.novCards === 1 && c1.novHint === 'ver os 4 jogos anteriores',
    'D1 — 1 coluna: 1 card à vista e "ver os 4 jogos anteriores" — vi ' + c1.novCards + ' / "' + c1.novHint + '"');
  const c2 = cenario(2, [3, 2], 3);
  ok(c2.novCards === 2 && c2.novHint === 'ver os 3 jogos anteriores',
    'D2 — 2 colunas: 2 cards e o botão desce pra 3 — vi ' + c2.novCards + ' / "' + c2.novHint + '"');
  const c3 = cenario(3, [3, 2], 3);
  ok(c3.novCards === 3 && c3.novHint === 'ver os 2 jogos anteriores',
    'D3 — 3 colunas: 3 cards e o botão desce pra 2 — vi ' + c3.novCards + ' / "' + c3.novHint + '"');
  const c4 = cenario(4, [3, 2], 3);
  ok(c4.novCards === 3 && c4.novHint === 'ver os 2 jogos anteriores',
    'D4 — 4 colunas com grupo de 3: para no cabeçalho, e o botão acompanha — vi ' + c4.novCards + ' / "' + c4.novHint + '"');
  ok(c3.heads[0] === true && c3.heads[1] === false,
    'D5 — o cabeçalho do 1º grupo fica à vista; o do 2º sai junto com os cards dele');
  ok(c2.mrCards === 2 && c2.mrHint === 'ver o anterior',
    'D6 — "Seus últimos resultados" (3 cards, 2 colunas): sobra 1 → SINGULAR "ver o anterior" — vi "' + c2.mrHint + '"');
  ok(c1.mrHint === 'ver os 2 anteriores', 'D7 — 1 coluna: "ver os 2 anteriores"');
  const um = cenario(2, [1], 1);
  ok(um.novHint === 'ver o jogo anterior' || um.novHintVisivel === false,
    'D8 — nunca escreve "ver os 1 jogos anteriores" (era o que saía com 2 cards)');
})();

// ── D2. os cards da prévia DIVIDEM a linha (o resto do buraco) ─────────────
// Um grupo de 3 jogos numa tela de 4 colunas deixava 1/4 de linha vazio — a queixa do
// print, de novo. Fechada, os N cards passam a dividir a linha, até um teto de largura;
// batendo no teto a fileira fica CENTRADA (sobra igual dos dois lados). Aberta, a grade
// volta a ser a régua canônica `auto-fill minmax(280px,1fr)` — que não pode ser apagada
// por engano, porque ela mora no style INLINE da grade.
if (TEM_MEDICAO) (function () {
  const c = cenario(4, [3, 2], 3);
  ok(c.novTpl === 'repeat(3,minmax(0,460px))' && c.novJustify === 'center',
    'D9 — fechada com 3 cards na prévia: os 3 dividem a linha (teto 460px, centrada) — vi "' + c.novTpl + '"');
  const aberta = cenario(4, [3, 2], 3, false);
  ok(aberta.novTpl === 'repeat(auto-fill,minmax(280px,1fr))' && !aberta.novJustify,
    'D10 — aberta, a grade volta à régua canônica auto-fill (a original NÃO é apagada) — vi "' + aberta.novTpl + '"');
})();

// ── E. sobrando ZERO, o convite some ───────────────────────────────────────
if (TEM_MEDICAO) (function () {
  const cheio = cenario(3, [3], 3);
  ok(cheio.novCards === 3 && cheio.novHintVisivel === false && cheio.novTagVisivel === false,
    'E1 — cabendo TODOS na linha, o convite some da tag e do rodapé (não há "anteriores")');
  ok(cheio.mrCards === 3 && cheio.mrHintVisivel === false,
    'E2 — idem em "Seus últimos resultados"');
  const sobra = cenario(2, [3], 3);
  ok(sobra.novHintVisivel === true && sobra.novTagVisivel === true && sobra.novTag === 'ver mais',
    'E3 — sobrando card, o convite volta e a tag diz "ver mais"');
  const aberta = cenario(2, [3, 2], 3, false);
  ok(aberta.novHint === 'ver menos' && aberta.novTag === 'ver menos',
    'E4 — aberta, os dois oferecem FECHAR');
})();

// ── G/H. sem re-render, sem content-visibility, e o observador é de LARGURA ─
if (TEM_MEDICAO) (function () {
  // Comentários fora: este arquivo EXPLICA por que não re-renderiza e por que não usa
  // content-visibility — procurar a palavra crua acusaria a própria explicação.
  function semComentarios(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }
  const bloco = semComentarios(extraiMedicao(SRC) + SRC.slice(SRC.indexOf('window._spWatchPreviewWidth = function'),
    SRC.indexOf('window._toggleNovidadesCollapse = function')));
  ok(bloco.indexOf('renderDashboard') === -1 && bloco.indexOf('innerHTML') === -1,
    'G1 — a medição NÃO re-renderiza nem reescreve HTML (project_dashboard_no_rerender)');
  ok(semComentarios(SRC).indexOf('content-visibility') === -1,
    'G2 — nenhum content-visibility no dashboard (entregava tela vazia ao rolar e comia o 1º toque)');
  ok(bloco.indexOf("getElementById(id)") !== -1 && /observe\(el\)/.test(bloco),
    'H1 — o ResizeObserver observa a SEÇÃO (largura independe de quantos cards estão à vista)');
  ok(/__spW !== w/.test(bloco),
    'H2 — só age quando a LARGURA muda: esconder card muda a ALTURA, e agir nisso seria laço');
})();
(function () {
  // O render tem que chamar a medição no MESMO task do innerHTML — senão o usuário chega
  // a ver o estado de 1 coluna piscando antes de a linha encher.
  const i = SRC.indexOf('container.innerHTML = html;');
  ok(i > 0 && SRC.slice(i, i + 500).indexOf('_spSyncCollapsePreview()') !== -1,
    'H3 — a medição roda logo depois do innerHTML (sem piscar o estado de 1 coluna)');
  ok(i > 0 && SRC.slice(i, i + 500).indexOf('_spWatchPreviewWidth()') !== -1,
    'H4 — e o observador de largura é (re)ligado a cada render');
})();

console.log('\n📐 PRÉVIA FECHADA — preenche a linha e o convite conta certo');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(function (f) { console.log('   ❌ ' + f); }); process.exit(1); }
console.log('   ✅ tudo verde');
