/* ⛔ ABRIR O TORNEIO CAI NO MEU JOGO — na chave, onde não há grupo.
 *
 * Ordem do dono (12/set/2026): _"quando o usuário clica no card do torneio para ver os
 * detalhes do torneio, deve ir para o ponto em que vê o seu próprio nome no próximo (ou no
 * último jogo seu, caso ainda não tenha próximo jogo, no caso de perdedor com possibilidade
 * de repescagem)"_ · _"o próximo, o último ou seu card antes do sorteio"_.
 *
 * TRÊS ALVOS, nesta ordem, e cada um faltava alguma coisa:
 *   ① o PRÓXIMO jogo — já funcionava;
 *   ② o ÚLTIMO jogo quando não há próximo: existia `[data-my-match="1"]`, mas
 *      `querySelector` devolve o PRIMEIRO do documento — o jogo mais ANTIGO. Quem perdeu na
 *      2ª rodada e espera repescagem caía na 1ª;
 *   ③ antes do sorteio não há jogo: o alvo é o card da própria pessoa (`#sp-meu-card`).
 *
 * E a rede embaixo dos três: acima de `_CHAVE_LOTE_MIN` a chave nasce em LOTES ADIADOS, e o
 * card da pessoa pode ser um deles — `querySelector` não acha e a tela fica no topo. Montar
 * tudo é caro, então só se paga quando há o que achar, e quem responde isso é o MODELO
 * (`_chaveTenhoJogoNaFase`), não o DOM.
 */
const H = require('./render-harness');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('\n──── abrir-o-torneio-cai-no-meu-jogo ────');
ok(typeof W._bracketEntryTarget === 'function', 'window._bracketEntryTarget existe');

function el(id, attrs) {
  const a = attrs || {};
  return {
    _id: id,
    getAttribute: function (k) { return (k in a) ? a[k] : null; },
    querySelector: function () { return null; },
    closest: function () { return null; }
  };
}
// DOM de mentira: `mapa` casa seletor → elemento(s). Devolve a função que restaura tudo.
function comDom(mapa, opts) {
  opts = opts || {};
  const docAntigo = W.document, ssAntigo = W.sessionStorage, flagAntiga = W._chaveTenhoJogoNaFase;
  const montaAntiga = W._chaveMontaTudo;
  const estado = { montou: 0 };
  W.document = {
    getElementById: function (id) { return mapa['#' + id] || null; },
    querySelector: function (sel) { const v = mapa[sel]; return Array.isArray(v) ? (v[0] || null) : (v || null); },
    querySelectorAll: function (sel) { const v = mapa[sel]; return Array.isArray(v) ? v : (v ? [v] : []); }
  };
  W.sessionStorage = { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} };
  W._chaveTenhoJogoNaFase = !!opts.tenhoJogo;
  W._chaveMontaTudo = function () { estado.montou++; if (opts.aoMontar) opts.aoMontar(mapa); };
  estado.restaurar = function () {
    W.document = docAntigo; W.sessionStorage = ssAntigo;
    W._chaveTenhoJogoNaFase = flagAntiga; W._chaveMontaTudo = montaAntiga;
  };
  return estado;
}

// ── ① o PRÓXIMO jogo ganha de tudo ──────────────────────────────────────────
(function () {
  const prox = el('proximo'), velho = el('antigo', { 'data-match-num': '3' });
  const st = comDom({ '[data-my-pending="1"]': prox, '[data-my-match="1"][data-match-num]': [velho] });
  const alvo = W._bracketEntryTarget();
  st.restaurar();
  ok(alvo && alvo._id === 'proximo', '① com jogo pendente, o alvo é o PRÓXIMO jogo');
})();

// ── ② sem pendente: o ÚLTIMO jogo dele, não o primeiro ──────────────────────
(function () {
  const r1 = el('jogo-r1', { 'data-match-num': '5' });
  const r2 = el('jogo-r2', { 'data-match-num': '40' });
  const r3 = el('jogo-r3', { 'data-match-num': '106' });
  const st = comDom({ '[data-my-match="1"][data-match-num]': [r1, r2, r3], '#sp-meu-card': el('meu-card') });
  const alvo = W._bracketEntryTarget();
  st.restaurar();
  ok(alvo && alvo._id === 'jogo-r3',
    '② ⭐ sem próximo jogo, cai no ÚLTIMO dele (antes caía no PRIMEIRO — o mais antigo)');
})();

// ── ③ pílula não é jogo ─────────────────────────────────────────────────────
(function () {
  // a pílula de W.O. também carrega data-my-match="1", mas NÃO tem data-match-num
  const st = comDom({ '[data-my-match="1"]': [el('pilula-wo')], '#sp-meu-card': el('meu-card') });
  const alvo = W._bracketEntryTarget();
  st.restaurar();
  ok(alvo && alvo._id === 'meu-card',
    '③ ⛔ pílula de W.O./pontuação não é jogo e não vira alvo — cai no card dele');
})();

// ── ④ antes do sorteio: o card da própria pessoa ────────────────────────────
(function () {
  const st = comDom({ '#sp-meu-card': el('meu-card') });
  const alvo = W._bracketEntryTarget();
  st.restaurar();
  ok(alvo && alvo._id === 'meu-card', '④ sem jogo nenhum (antes do sorteio), o alvo é o card dele');
})();

// ── ⑤ quem não está no torneio não tem alvo ─────────────────────────────────
(function () {
  const st = comDom({});
  const alvo = W._bracketEntryTarget();
  st.restaurar();
  ok(alvo === null, '⑤ visitante sem jogo e sem card: nenhum alvo (segue no topo)');
})();

// ── ⑥ card ainda não montado: monta e acha ──────────────────────────────────
(function () {
  const escondido = el('jogo-adiado');
  const st = comDom({}, {
    tenhoJogo: true,
    aoMontar: function (mapa) { mapa['[data-my-pending="1"]'] = escondido; }
  });
  const alvo = W._bracketEntryTarget();
  const montou = st.montou;
  st.restaurar();
  ok(montou === 1, '⑥ com jogo na fase e card ausente, os lotes adiados são montados');
  ok(alvo && alvo._id === 'jogo-adiado', '⑥ ⭐ e aí o jogo aparece (antes a tela ficava no topo)');
})();

// ── ⑦ quem não tem jogo na fase NÃO paga o custo ────────────────────────────
(function () {
  const st = comDom({ '#sp-meu-card': el('meu-card') }, { tenhoJogo: false });
  W._bracketEntryTarget();
  const montou = st.montou;
  st.restaurar();
  ok(montou === 0,
    '⑦ ⛔ sem jogo na fase, NÃO monta a chave inteira — o custo só se paga quando há o que achar');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail) process.exit(1);
console.log('✅ abrir-o-torneio-cai-no-meu-jogo: OK');
