/* ⛔ QUEM CAI NUMA RODADA FICA NO FIM DA CHAVE, E SÓ QUANDO A RODADA FECHA.
 *
 * Relato do dono (12/set/2026, Confra BT Alta da Clínica, chave Ouro, 36 duplas):
 * _"não tem como com 36 duplas na r2 ter do 9º ao 5º definido com algumas derrotas.
 * primeiro que seria 36º"_.
 *
 * MEDIDO no documento real (tour_1780009816637, fase 2 remontada do banco): com 5 dos 18
 * jogos da rodada decididos, a função devolvia CINCO posições — 5º, 6º, 7º, 8º e 9º. A
 * chave Prata, com 34 duplas, devolvia a mesma coisa. Causa: o contador de posições começava
 * em 3 (ou 5, havendo disputa de 3º) e andava da FINAL para trás; como as rodadas de cima
 * ainda não tinham vencedor, o contador não andava e a primeira rodada com resultado pegava
 * as posições logo abaixo do pódio. Só fechava certo com o torneio TERMINADO.
 *
 * A REGRA, na palavra do dono:
 *   _"temos que esperar o fim de cada rodada para saber quem não pode mais melhorar seu
 *   resultado e aí definir as posições ali com base nos critérios de desempate"_;
 *   _"ao final da r2, quem não for repescado não tem como melhorar seu resultado — antes
 *   mesmo do sorteio da repescagem: os repescados serão definidos por performance"_;
 *   _"o pior perdedor da r2 é o 36º na Ouro ou 34 na Prata e por aí vai subindo"_;
 *   _"para definir quem é o melhor perdedor e quem é o pior tem que aplicar os critérios de
 *   desempate na ordem"_.
 */
const { window: W, load } = require('./headless');
load('bracket-logic.js');
const E = W._phasesEngine;
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

const ehGente = (n) => { const s = String(n == null ? '' : n).trim(); return !!s && s !== 'TBD' && !/^\s*bye/i.test(s); };

function chave(N) {
  const teams = []; for (let i = 1; i <= N; i++) teams.push({ displayName: 'T' + i, uid: 'u' + i });
  const res = E.genTierBracket(teams, 'main', 'g', 'playin', true, 'seed');
  return { id: 'X', format: 'Eliminatórias Simples', matches: res.matches.map((m) => Object.assign({}, m)) };
}
function classificar(t) {
  const all = W._collectAllMatches(t);
  const third = all.filter((m) => m.isThirdPlace)[0] || null;
  const faux = { matches: all.filter((m) => m !== third), format: 'Eliminatórias Simples', thirdPlaceMatch: third };
  W._updateProgressiveClassification(faux);
  return faux.classification || {};
}
function primeiraRodada(t) {
  const rs = W._collectAllMatches(t).filter((m) => !m.isThirdPlace).map((m) => m.round);
  return Math.min.apply(null, rs);
}
function rodadasDe(t) {
  const s = {}; W._collectAllMatches(t).forEach((m) => { if (!m.isThirdPlace) s[m.round] = 1; });
  return Object.keys(s).map(Number).sort((a, b) => a - b);
}
function competidores(t) {
  const s = {};
  W._collectAllMatches(t).forEach((m) => [m.p1, m.p2].forEach((n) => { if (ehGente(n)) s[String(n)] = 1; }));
  return Object.keys(s).length;
}
// joga os jogos JOGÁVEIS da rodada `r`; `quantos` = null joga todos
function jogarRodada(t, r, quantos) {
  let n = 0, i = 0;
  const podem = () => W._collectAllMatches(t).filter((m) =>
    m.round === r && !m.winner && !m.isThirdPlace && ehGente(m.p1) && ehGente(m.p2));
  let guarda = 0;
  while (guarda++ < 400) {
    const pl = podem();
    if (!pl.length) break;
    if (quantos != null && n >= quantos) break;
    const m = pl[0];
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i++ % 5);
    W._advanceWinner(t, m); n++;
  }
  return n;
}

// ── ① 36 duplas: rodada ABERTA não define ninguém ───────────────────────────
(function () {
  const t = chave(36);
  const N = competidores(t);
  eq(N, 36, '① a chave tem 36 duplas');
  jogarRodada(t, primeiraRodada(t), 5);       // o estado exato do print do dono
  const cl = classificar(t);
  eq(Object.keys(cl).length, 0,
    '① ⭐ com 5 dos 18 jogos decididos, NINGUÉM tem posição (era 5 definidos, em 5º–9º)');
})();

// ── ② rodada FECHADA: só quem não cabe na repescagem, e no FIM da chave ─────
(function () {
  const t = chave(36);
  const N = competidores(t);
  const all = W._collectAllMatches(t);
  const rs = rodadasDe(t);
  const jogosR1 = all.filter((m) => m.round === rs[0] && !m.isThirdPlace).length;
  const jogosR2 = all.filter((m) => m.round === rs[1] && !m.isThirdPlace).length;
  const vagas = (jogosR2 * 2) - jogosR1;      // lugares na 2ª rodada que não vêm de vitória
  jogarRodada(t, rs[0], null);
  const cl = classificar(t);
  const pos = Object.keys(cl).map((n) => cl[n]).sort((a, b) => a - b);
  eq(pos.length, jogosR1 - vagas,
    '② caem só os perdedores que NÃO cabem nas ' + vagas + ' vagas de repescagem');
  eq(pos[pos.length - 1], N, '② ⭐ o PIOR perdedor da rodada fica com o ÚLTIMO lugar (' + N + 'º)');
  eq(pos[0], N - pos.length + 1, '② e o bloco é contíguo, ancorado no fim da chave');
  ok(pos.every((p, i) => i === 0 || p === pos[i - 1] + 1), '② sem buraco dentro do bloco');
  ok(!pos.some((p) => p <= 4), '② ⛔ ninguém que caiu na 1ª rodada aparece perto do pódio');
})();

// ── ③ a ordem dentro do bloco é a dos critérios, do melhor pro pior ─────────
(function () {
  const t = chave(36);
  const N = competidores(t);
  const r1 = primeiraRodada(t);
  jogarRodada(t, r1, null);
  const cl = classificar(t);
  const all = W._collectAllMatches(t);
  // saldo do jogo que eliminou cada um (o 1º critério da cadeia histórica)
  const saldo = {};
  all.forEach((m) => {
    if (!m.winner || m.round !== r1) return;
    const perdedor = (W._matchWinnerSide(m) === 1) ? m.p2 : m.p1;
    if (!ehGente(perdedor)) return;
    const sp = (W._matchWinnerSide(m) === 1) ? (parseInt(m.scoreP2) || 0) : (parseInt(m.scoreP1) || 0);
    const sw = (W._matchWinnerSide(m) === 1) ? (parseInt(m.scoreP1) || 0) : (parseInt(m.scoreP2) || 0);
    saldo[perdedor] = sp - sw;
  });
  const naOrdem = Object.keys(cl).sort((a, b) => cl[a] - cl[b]);
  let monotono = true;
  for (let i = 1; i < naOrdem.length; i++) {
    if (saldo[naOrdem[i]] > saldo[naOrdem[i - 1]]) monotono = false;
  }
  ok(monotono, '③ ⭐ dentro do bloco, quem brigou mais fica na frente — pior saldo, pior lugar');
  ok(naOrdem.length > 1, '③ (o bloco tem mais de um para poder comparar)');
})();

// ── ④ o topo continua vindo de cima: chave inteira jogada = 1..N sem buraco ──
[8, 9, 16, 36].forEach(function (N) {
  const t = chave(N);
  const total = competidores(t);
  let guarda = 0;
  while (guarda++ < 60) {
    const falta = W._collectAllMatches(t).filter((m) => !m.winner && ehGente(m.p1) && ehGente(m.p2));
    if (!falta.length) break;
    falta.forEach((m, i) => { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (i % 5); W._advanceWinner(t, m); });
  }
  const cl = classificar(t);
  const pos = Object.keys(cl).map((n) => cl[n]).sort((a, b) => a - b);
  eq(pos.length, total, '④ N=' + N + ': chave inteira jogada classifica TODO MUNDO');
  eq(new Set(pos).size, pos.length, '④ N=' + N + ': sem posição repetida');
  eq(pos[0], 1, '④ N=' + N + ': começa no 1º');
  eq(pos[pos.length - 1], total, '④ N=' + N + ': termina no ' + total + 'º, sem estourar');
  ok(pos.every((p, i) => p === i + 1), '④ N=' + N + ': 1..' + total + ' sem buraco');
});

console.log(pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
