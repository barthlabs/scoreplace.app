/* 🏅 SEUS ÚLTIMOS RESULTADOS — fechada mostra o último, não mostra NADA
 *   node tests/ultimos-resultados-mostra-o-ultimo.test.js
 *
 * PEDIDO DO DONO (14/ago/2026, olhando a tela inicial logo depois da 1.8.67):
 *   "nos meus ultimos resultados vamos fazer igual so novidades no seu torneio. apresenta
 *    o ultimo com os outros colapsados. assim chama mais a atencao sem ocupar muito espaco
 *    e fica mais chamativo para a pessoa abrir e verificar. como esta esta discreto demais."
 *
 * O QUE ESTAVA ERRADO (medido no HTML gerado pela 1.8.68): a seção colapsava o CORPO
 * INTEIRO — `<div id="meus-resultados-body" style="...display:none;">`. Fechada, ela não
 * mostrava nada: só o título e uma seta. A vizinha "📣 Novidades no seu torneio" já fazia
 * o certo desde a 1.8.67 (o card mais recente sempre à vista, os anteriores escondidos por
 * CSS via `data-nov-collapsed`), e era essa diferença que deixava a de resultados apagada.
 *
 * POR QUE NÃO DEU PRA COPIAR A SOLUÇÃO DAS NOVIDADES LINHA A LINHA: Novidades é UMA grade
 * plana de cards irmãos, então `nth-child(n+2)` resolve. "Seus últimos resultados" tem até
 * QUATRO blocos (aguardando você → aguardando o adversário → em disputa → confirmados),
 * cada um com cabeçalho e grade próprios, e o bloco dos confirmados ainda intercala
 * cabeçalho de GRUPO entre os cards. Daí o mecanismo daqui:
 *   • o primeiro bloco renderizado ganha `data-mr-first` (a ordem do corpo já é a de
 *     urgência, então a prioridade sai de graça: havendo pendência é ela que fica à vista,
 *     porque é a que pede ação; não havendo, aparece o último resultado);
 *   • fechada, o CSS esconde todo bloco que não seja o primeiro, e dentro dele tudo que vem
 *     DEPOIS do primeiro card (`[data-mr-card] ~ *`) — o `~` pega também o cabeçalho do 2º
 *     grupo, que senão ficaria órfão anunciando cards invisíveis.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. o corpo NUNCA mais é escondido inteiro — fechada ≠ vazia;
 *   B. exatamente UM bloco leva `data-mr-first`, e é o PRIMEIRO do corpo;
 *   C. havendo pendência pra mim, o bloco à vista é o dela (ação não fica escondida);
 *   D. todo card é marcado (`data-mr-card`), senão o CSS não sabe onde cortar;
 *   E. as duas regras de CSS existem, e a grade é a MESMA das Novidades;
 *   F. o convite "▾ ver os N anteriores" existe com 2+ cards e some com 1 (não há
 *      "anteriores" de um card só, e a linha viraria ruído);
 *   G. o alternador mexe no ATRIBUTO, nunca mais em `body.style.display` — se alguém
 *      voltar a esconder o corpo, o pedido do dono morre em silêncio.
 *
 * CONTROLE: contra a 1.8.68 (o código anterior a este fix) esta suíte acusa 24 das 30
 * asserções, a do relato entre elas (A1: o corpo saía com `display:none`). Rodar com
 * `SP_DASHBOARD_SRC` apontando pra versão antiga — receita no comentário do `SRC`.
 */
const fs = require('fs');
const path = require('path');
const H = require('./render-harness');   // store.js + bracket.js REAIS
const W = H.sandbox;

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const AGORA = Date.now();

// ═══════════════════════════════════════════════════════════════════════════
// Fixture — a FORMA medida no doc real do Confra (Pontos Corridos · Rei/Rainha,
// jogos em rounds[0].matches, `resultAt` em ms, pendência em `pendingResult`).
// ═══════════════════════════════════════════════════════════════════════════
function jogo(id, label, a1, a2, b1, b2, extra) {
  return Object.assign({
    id: id, label: label, isMonarch: true, round: 0,
    p1: a1 + ' / ' + a2, p2: b1 + ' / ' + b2,
    team1: [a1, a2], team2: [b1, b2]
  }, extra || {});
}

// 3 jogos MEUS já confirmados, todos do mesmo grupo → o bloco dos confirmados agrupa
// (cabeçalho compartilhado + 3 cards), que é justamente o caso com cabeçalho no meio.
const MEUS_CONFIRMADOS = [
  jogo('m-Q1', 'R1 Grupo Q • Jogo 1', 'Erika de Paula', 'Rodrigo Barth', 'Livia Morais', 'Loraine Soares',
    { scoreP1: 6, scoreP2: 5, resultAt: AGORA - 2 * 3600000, winner: 'Erika de Paula / Rodrigo Barth' }),
  jogo('m-Q2', 'R1 Grupo Q • Jogo 2', 'Erika de Paula', 'Loraine Soares', 'Livia Morais', 'Rodrigo Barth',
    { scoreP1: 6, scoreP2: 3, resultAt: AGORA - 5 * 3600000, winner: 'Erika de Paula / Loraine Soares' }),
  jogo('m-Q3', 'R1 Grupo Q • Jogo 3', 'Erika de Paula', 'Livia Morais', 'Loraine Soares', 'Rodrigo Barth',
    { scoreP1: 1, scoreP2: 0, resultAt: AGORA - 8 * 3600000, winner: 'Erika de Paula / Livia Morais' })
];

// Pendência AGUARDANDO MINHA aprovação: o outro lado propôs, eu preciso agir.
const PENDENTE_PRA_MIM = jogo('m-P1', 'R1 Grupo Q • Jogo 4', 'Erika de Paula', 'Rodrigo Barth', 'Nadia', 'Carol', {
  pendingResult: {
    scoreP1: 3, scoreP2: 6, winner: 'Nadia / Carol', draw: false, kind: 'inline',
    proposedByName: 'Nadia', proposedBy: 'u-nadia', proposedByEmail: 'nadia@x.com',
    proposedAt: AGORA - 10 * 60000
  }
});

function confra(matches) {
  return {
    id: 'tour_confra', name: 'Confra BT Alta da Clínica 2026', format: 'Liga',
    ligaRoundFormat: 'rei_rainha', status: 'active', sport: 'Beach Tennis',
    resultEntry: 'players', creatorUid: 'u-rb',
    participants: [{ uid: 'u-rb', displayName: 'Rodrigo Barth' }],
    rounds: [{ matches: matches }]
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Roda o _buildMyResultsHtml REAL, extraído do dashboard.js (não uma réplica).
// ═══════════════════════════════════════════════════════════════════════════
// `SP_DASHBOARD_SRC` existe pro CONTROLE: aponta pra uma versão ANTERIOR do arquivo e a
// suíte tem que ficar VERMELHA. Sem isso, "o teste passa" não prova que ele pegaria o bug.
//   git show HEAD:js/views/dashboard.js > /tmp/dash-antigo.js
//   SP_DASHBOARD_SRC=/tmp/dash-antigo.js node tests/ultimos-resultados-mostra-o-ultimo.test.js
const SRC = fs.readFileSync(process.env.SP_DASHBOARD_SRC || path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

function extraiBuildMyResults(src) {
  const i = src.indexOf('function _buildMyResultsHtml() {');
  if (i < 0) throw new Error('_buildMyResultsHtml não encontrada em dashboard.js');
  const marca = 'return _upHtml + _novHtml + html;';
  const j = src.indexOf(marca, i);
  if (j < 0) throw new Error('fim de _buildMyResultsHtml não encontrado (o return mudou?)');
  return src.slice(i, src.indexOf('}', j + marca.length) + 1);
}

const _store = {};
W.localStorage = W.localStorage || {
  getItem: function (k) { return (k in _store) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};

function render(tours, opts) {
  opts = opts || {};
  W.AppStore.tournaments = tours;
  W.AppStore.currentUser = { uid: 'u-rb', displayName: 'Rodrigo Barth', email: 'rb@x.com' };
  W.AppStore.isOrganizer = function (t) { return !!(t && t.creatorUid === 'u-rb'); };
  W.localStorage.setItem('scoreplace_collapse_novidades', '1');
  W.localStorage.setItem('scoreplace_collapse_myresults', opts.aberta ? '0' : '1');
  const body = extraiBuildMyResults(opts.src || SRC);
  const fn = new Function('window', 'document', 'localStorage', 'participacoes',
    'with (window) { ' + body + ' return _buildMyResultsHtml; }'
  )(W, W.document, W.localStorage, tours);
  return fn();
}

// A seção vem DEPOIS das Novidades no retorno (`_upHtml + _novHtml + html`), então basta
// cortar do id dela em diante — não há seção nossa depois.
function secao(html) {
  const i = html.indexOf('id="meus-resultados-section"');
  return i < 0 ? '' : html.slice(i);
}
function contar(s, needle) {
  let n = 0, i = 0;
  while ((i = s.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
// Abertura da tag `<div id="meus-resultados-body" ...>` — é nela que morava o display:none.
function tagCorpo(sec) {
  const i = sec.indexOf('id="meus-resultados-body"');
  if (i < 0) return '';
  const ini = sec.lastIndexOf('<', i);
  return sec.slice(ini, sec.indexOf('>', i) + 1);
}

const SO_CONFIRMADOS = secao(render([confra(MEUS_CONFIRMADOS)]));
const COM_PENDENCIA = secao(render([confra(MEUS_CONFIRMADOS.concat([PENDENTE_PRA_MIM]))]));
const UM_SO = secao(render([confra([MEUS_CONFIRMADOS[0]])]));

ok(SO_CONFIRMADOS.length > 0, 'a seção 🏅 Seus últimos resultados é renderizada');

// ═══════════════════════════════════════════════════════════════════════════
// A. FECHADA NÃO É VAZIA — o corpo não some mais inteiro
// ═══════════════════════════════════════════════════════════════════════════
ok(tagCorpo(SO_CONFIRMADOS).indexOf('display:none') === -1,
  'A1 — o corpo NÃO sai com display:none (fechada, a seção mostra o último card)');
ok(/id="meus-resultados-section"[^>]*data-mr-collapsed="1"/.test(SO_CONFIRMADOS),
  'A2 — o estado fechado vive no atributo data-mr-collapsed da seção');
ok(/id="meus-resultados-section"[^>]*data-mr-collapsed="0"/.test(secao(render([confra(MEUS_CONFIRMADOS)], { aberta: true }))),
  'A3 — a preferência do usuário (aberta) chega no atributo');

// ═══════════════════════════════════════════════════════════════════════════
// B. UM bloco à vista, e é o PRIMEIRO
// ═══════════════════════════════════════════════════════════════════════════
ok(contar(SO_CONFIRMADOS, 'data-mr-first="1"') === 1,
  'B1 — exatamente UM bloco leva data-mr-first');
ok(contar(COM_PENDENCIA, 'data-mr-first="1"') === 1,
  'B2 — com pendência também: um só bloco à vista');
(function () {
  // O primeiro bloco sai com os dois atributos juntos; se um bloco não-marcado viesse
  // antes, a 1ª ocorrência de `data-mr-block` não seria a do par.
  const par = SO_CONFIRMADOS.indexOf('data-mr-block="1" data-mr-first="1"');
  const qualquer = SO_CONFIRMADOS.indexOf('data-mr-block="1"');
  ok(par >= 0 && par === qualquer,
    'B3 — o bloco marcado é o PRIMEIRO do corpo (nenhum bloco vem antes dele)');
  const parP = COM_PENDENCIA.indexOf('data-mr-block="1" data-mr-first="1"');
  const qualquerP = COM_PENDENCIA.indexOf('data-mr-block="1"');
  ok(parP >= 0 && parP === qualquerP,
    'B4 — com pendência idem: quem leva a marca é o primeiro bloco do corpo');
})();

// ═══════════════════════════════════════════════════════════════════════════
// C. PRIORIDADE — pendência pede ação, então é ela que fica à vista
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const i = COM_PENDENCIA.indexOf('data-mr-first="1"');
  const trecho = COM_PENDENCIA.slice(i, i + 400);
  ok(trecho.indexOf('Aguardando sua aprovação') !== -1,
    'C1 — havendo pendência pra mim, o bloco à vista é o "⏳ Aguardando sua aprovação"');
})();
(function () {
  // sem pendência, o primeiro bloco é o dos confirmados — ele não tem cabeçalho próprio,
  // então a prova é que NENHUM dos três cabeçalhos de pendência aparece antes dele.
  const i = SO_CONFIRMADOS.indexOf('data-mr-first="1"');
  const antes = i < 0 ? 'BLOCO NÃO MARCADO' : SO_CONFIRMADOS.slice(0, i);
  ok(i >= 0 &&
     antes.indexOf('Aguardando sua aprovação') === -1 &&
     antes.indexOf('Aguardando confirmação do adversário') === -1 &&
     antes.indexOf('Em disputa') === -1,
    'C2 — sem pendência, o bloco à vista é o dos resultados confirmados');
})();
ok(COM_PENDENCIA.indexOf('data-has-pending="1"') !== -1,
  'C3 — a marca data-has-pending (usada pelo auto-scroll) continua saindo');

// ═══════════════════════════════════════════════════════════════════════════
// D. TODO card é marcado — sem isso o CSS não sabe onde cortar
// ═══════════════════════════════════════════════════════════════════════════
ok(contar(SO_CONFIRMADOS, 'data-mr-card="1"') === 3,
  'D1 — os 3 resultados confirmados viram 3 cards marcados');
ok(contar(COM_PENDENCIA, 'data-mr-card="1"') === 4,
  'D2 — com a pendência somam 4 cards marcados (a pendência também é card)');
ok(contar(UM_SO, 'data-mr-card="1"') === 1,
  'D3 — um resultado só vira um card marcado');

// ═══════════════════════════════════════════════════════════════════════════
// E. AS REGRAS DE CSS + a grade é a MESMA das Novidades
// ═══════════════════════════════════════════════════════════════════════════
ok(SO_CONFIRMADOS.indexOf('#meus-resultados-body > *:not([data-mr-first]){display:none !important;}') !== -1,
  'E1 — fechada, todo bloco que não é o primeiro fica escondido');
ok(SO_CONFIRMADOS.indexOf('[data-mr-first] [data-mr-card] ~ *{display:none !important;}') !== -1,
  'E2 — dentro do bloco à vista, some tudo DEPOIS do primeiro card (inclusive cabeçalho de grupo órfão)');
// ⚠️ E2b existe por um defeito MEDIDO no navegador, não por gosto: os cards dos resultados
// confirmados trazem `display:flex` INLINE, que vence a folha de estilo. Sem `!important` o
// seletor casava e os três cards continuavam à vista — este arquivo passava verde com a
// tela errada. Se alguém "limpar" o !important, o card volta a não sumir.
(function () {
  const i = SO_CONFIRMADOS.indexOf('<style>');
  const css = SO_CONFIRMADOS.slice(i, SO_CONFIRMADOS.indexOf('</style>', i));
  ok(contar(css, 'display:none !important') === 2 && contar(css, 'display:none;') === 0,
    'E2b — as duas regras usam !important (o card tem display:flex inline, que venceria)');
})();
(function () {
  // A régua do próprio card: se ele deixar de nascer com display inline, o !important vira
  // desnecessário — mas enquanto nascer, a regra tem que existir.
  ok(/data-mr-card="1" style="min-width:0;display:flex/.test(SO_CONFIRMADOS),
    'E2c — o card confirmado realmente traz display inline (é o motivo do !important)');
})();
(function () {
  // A régua sai do próprio fonte: se uma seção mudar de grade sem a outra, fica vermelho.
  const gradeNov = /id="novidades-grid"[^']*?(repeat\(auto-fill,minmax\(\d+px,1fr\)\))/.exec(SRC);
  ok(!!gradeNov, 'E3 — a grade das Novidades é legível no fonte');
  if (gradeNov) {
    ok(contar(SO_CONFIRMADOS, gradeNov[1]) >= 1,
      'E4 — "Seus últimos resultados" usa a MESMA grade responsiva das Novidades');
  } else { fail++; fails.push('E4 — não deu pra comparar a grade'); }
})();

// ═══════════════════════════════════════════════════════════════════════════
// F. O CONVITE pra abrir — existe com 2+, some com 1
// ═══════════════════════════════════════════════════════════════════════════
ok(SO_CONFIRMADOS.indexOf('id="meus-resultados-hint"') !== -1,
  'F1 — com 3 cards, a seção convida a abrir');
ok(SO_CONFIRMADOS.indexOf('ver os 2 anteriores') !== -1,
  'F2 — o convite diz quantos ficaram escondidos (3 cards → 2 anteriores)');
ok(COM_PENDENCIA.indexOf('ver os 3 anteriores') !== -1,
  'F3 — com 4 cards → 3 anteriores');
ok(UM_SO.indexOf('id="meus-resultados-hint"') === -1,
  'F4 — com UM card não há "anteriores": o convite some (seria ruído)');
// ⚠️ SONDA REVISADA DE PROPÓSITO em v1.8.78 — o texto mudou por pedido do dono (15/ago):
// "a setinha de expandir ou colapsar está muito discreta; substituir essas setas na
// esquerda por uma tag na direita 'ver mais' e 'ver menos'". As setinhas ▾/▴ saíram e
// "ocultar anteriores" virou "ver menos", o mesmo par do cabeçalho. O invariante — aberta,
// o convite passa a OFERECER FECHAR — é o mesmo.
const ABERTA = secao(render([confra(MEUS_CONFIRMADOS)], { aberta: true }));
ok(ABERTA.indexOf('ver menos') !== -1,
  'F5 — aberta, o convite vira "ver menos"');
ok(ABERTA.indexOf('▾') === -1 && ABERTA.indexOf('▴') === -1 && ABERTA.indexOf('▸') === -1,
  'F6 — nenhuma setinha sobrou na seção (o dono achou o glifo discreto demais)');
ok(/id="mr-toggle-tag"[^>]*color:#7dd3fc/.test(ABERTA),
  'F7 — a tag de abrir/fechar mora à DIREITA do título, em azul-claro');

// ═══════════════════════════════════════════════════════════════════════════
// G. O ALTERNADOR mexe no ATRIBUTO — nunca mais esconde o corpo
// ═══════════════════════════════════════════════════════════════════════════
(function () {
  const i = SRC.indexOf('window._toggleMyResultsCollapse = function');
  ok(i > 0, 'G1 — _toggleMyResultsCollapse existe');
  const corpo = SRC.slice(i, SRC.indexOf('\n};', i));
  ok(corpo.indexOf("setAttribute('data-mr-collapsed'") !== -1,
    'G2 — o alternador escreve o atributo data-mr-collapsed');
  ok(!/body\.style\.display/.test(corpo),
    'G3 — o alternador NUNCA volta a esconder o corpo inteiro (era o bug do relato)');
  ok(corpo.indexOf('meus-resultados-hint') !== -1,
    'G4 — o alternador atualiza o texto do convite');
})();
(function () {
  // O auto-expand da pendência (roda no load quando há ação pra mim) tem que falar a
  // MESMA língua; se continuasse mexendo em display, brigaria com o CSS.
  const i = SRC.indexOf("var _mrSec = document.getElementById('meus-resultados-section')");
  ok(i > 0, 'G5 — o auto-expand da pendência foi migrado pro atributo');
  const trecho = SRC.slice(i, i + 600);
  ok(trecho.indexOf("setAttribute('data-mr-collapsed', '0')") !== -1,
    'G6 — havendo pendência, o auto-expand abre pelo atributo');
  ok(!/_mrBody\.style\.display/.test(SRC),
    'G7 — não sobrou ninguém escondendo #meus-resultados-body por display');
})();

console.log('\n🏅 SEUS ÚLTIMOS RESULTADOS — fechada mostra o último');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(function (f) { console.log('   ❌ ' + f); }); process.exit(1); }
console.log('   ✅ tudo verde');
