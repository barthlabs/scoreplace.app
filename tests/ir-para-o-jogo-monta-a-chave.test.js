'use strict';
/* ⛔ "IR PARA O TORNEIO" TEM DE PARAR NO JOGO — E O CARD PODE NEM EXISTIR NO DOM AINDA.
 * Relato do dono (12/set/2026, no TestFlight): _"o ir para o torneio não está indo para o jogo
 * onde está esse botão… está indo para o topo da chave"_. E, logo depois: _"é isso que a pessoa
 * quer ver e não ter que procurar de novo"_.
 * O id do jogo já viajava (`sp_scrollToMatch`, 2.2.71) e a busca já existia — mas ela desistia
 * quando `#card-<id>` não estava no documento. E acima de `_CHAVE_LOTE_MIN` chaves/grupos o que
 * não é o SEU nasce como marcador e só é montado ao abrir (o Confra tem 35): o card pedido não
 * existia, o ramo do grupo também não resolvia (na eliminatória não há rótulo de grupo) e
 * sobrava o topo. Mesma causa, mesmo remédio do grupo: montar tudo AQUI, só para quem pediu.
 * [[project_lancar_placar_nao_move_a_chave]] · [[feedback_montagem_preguicosa_mata_o_clique]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const BRK = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const ini = BRK.indexOf('function _alvoDeEntrada() {');
const fim = BRK.indexOf("\n  var _p = null;", ini);
assert.ok(ini > 0 && fim > ini, 'âncoras do resolvedor de alvo');
/* recorte por ÂNCORA e fechado à mão: só o começo da função interessa aqui (o ramo do JOGO).
 * O resto — grupo, seu próprio jogo — tem teste próprio e traria meio arquivo junto. */
const trecho = BRK.slice(ini, fim) + '\n  return null;\n}';

// ── ① o caminho REAL: card ausente → monta a chave → acha ───────────────────
function rodar(montaCria) {
  const cards = {};                       // o DOM começa sem o card pedido (lote preguiçoso)
  let montou = 0;
  const ctx = {
    sessionStorage: { getItem: (k) => (k === 'sp_scrollToMatch' ? 'm-123' : null) },
    document: { getElementById: (id) => cards[id] || null },
    window: {
      _chaveMontaTudo: function () { montou++; if (montaCria) cards['card-m-123'] = { id: 'card-m-123' }; }
    },
    resultado: null
  };
  vm.runInNewContext(trecho + '\nresultado = _alvoDeEntrada();', ctx);
  return { alvo: ctx.resultado, montou: montou };
}
const comLote = rodar(true);
must(comLote.montou === 1, '① a chave é montada UMA vez quando o card pedido não está no DOM');
must(comLote.alvo && comLote.alvo.id === 'card-m-123',
  '① ⭐ e a tela para NO JOGO pedido — era isto que caía no topo da chave');

// ── ② e não insiste quando o jogo não existe mesmo ──────────────────────────
const semJogo = rodar(false);
must(semJogo.montou === 1, '② montou uma vez e parou — sem laço, sem custo repetido');
must(!semJogo.alvo, '② jogo inexistente (re-sorteio, fase trocada) não vira alvo inventado');

// ── ③ o remédio é o MESMO do grupo, escrito no mesmo lugar ──────────────────
must((BRK.match(/_chaveMontaTudo\(document\)/g) || []).length >= 2,
  '③ jogo e grupo usam a mesma montagem sob demanda (' + (BRK.match(/_chaveMontaTudo\(document\)/g) || []).length + ' pontos)');
must(trecho.indexOf('_chaveMontaTudo') < trecho.lastIndexOf('return _cardAlvo'),
  '③ ⛔ a montagem vem ANTES de desistir — depois não adiantaria nada');

// ── ④ e o id do jogo continua viajando de todos os cabeçalhos ───────────────
const DASH = fs.readFileSync(path.join(__dirname, '..', 'js/views/dashboard.js'), 'utf8');
must(/sessionStorage\.setItem\(\\'sp_scrollToMatch\\'/.test(DASH), '④ o botão guarda o id do jogo clicado');
must((DASH.match(/_grupoHeadHtml\(/g) || []).length >= 4,
  '④ e os cabeçalhos que o emitem seguem passando por uma função só');

console.log('✅ ' + ok + ' asserções — o botão leva ao jogo, montando a chave se precisar');
