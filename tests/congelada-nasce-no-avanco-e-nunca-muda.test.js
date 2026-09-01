/* A CONGELADA NASCE NO AVANÇO — E O QUE JÁ ESTAVA CONGELADO NÃO MUDA  (CONFRA.QA.P0.3)
 * node tests/congelada-nasce-no-avanco-e-nunca-muda.test.js
 *
 * ⛔ O QUE FALTAVA. `tests/congelada-manda-no-avanco.test.js` (CONFRA.P1) prova que a porta
 * do avanço LÊ a congelada. Ninguém provava o outro lado, que é o que a Confra vai executar
 * de verdade: um torneio com os grupos em DOIS estados ao mesmo tempo — uns já congelados,
 * outros não — passando pelo `_advanceMultiPhase` REAL. Medido na produção em 01/set/2026
 * (CONFRA.QA.P0 ④): dos 35 grupos, **25 têm `classifCongelada`** (1 delas LEGADA, sem
 * `classifCongeladaAt`) e **10 não têm** — nesses 10 o retrato NASCE no avanço, a partir da
 * ordem ao vivo. E em 24 dos 25 a ordem ao vivo DIVERGE da congelada, atingindo o top-4:
 * sem o retrato, 24 grupos formariam duplas diferentes das publicadas.
 *
 * As duas metades têm que valer JUNTAS, e é por isso que o teste é um só:
 *   • quem já tem retrato NÃO é reescrito (nem a lista, nem o carimbo) — nem "porque agora
 *     o sistema é melhor" (ordem do dono, 22/ago/2026);
 *   • quem não tem é congelado EXATAMENTE pela classificação canônica que a tela estava
 *     mostrando no instante anterior ao avanço — não por uma segunda régua.
 *
 * ⭐ O CENÁRIO É CONSTRUÍDO PRA DIVERGIR. A congelada dos 25 é a ordem viva INVERTIDA, então
 * se alguém recalcular, a dupla de Ouro sai trocada com a de Prata e as asserções acusam. Um
 * cenário onde congelada == viva passaria verde sobre o código quebrado.
 *
 * ⭐ E ele fecha no ORÁCULO de produção (CONFRA.QA.P0 ⑤): 105 jogos na fase 0, 141 pessoas,
 * 70 duplas, 100 jogos na fase 2, 140 slots do top-4, NENHUM 5º, "Rodada 2" e contador 0/100.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
// o phases-engine lê `window._computeMonarchStandings` em runtime; o require roda fora do vm
// do harness, então o window do processo tem que apontar pro sandbox (mesma nota do CONFRA.P1).
global.window = W;
const E = require('../js/views/phases-engine.js');

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };
const J = (x) => JSON.stringify(x);

// stubs pra o avanço não bloquear (sem inativos, sem diálogo, sem Firestore)
W.showAlertDialog = function () {}; W.showConfirmDialog = function (a, b, cb) { cb && cb(); };
W._showInactivePhasePanel = function () {}; W._phasePendingInactives = function () { return []; };
W.FirestoreDB = { saveTournament: function () {} };

/* ── A CONFRA EQUIVALENTE ────────────────────────────────────────────────────────────
 * 35 grupos de Rei/Rainha em RODADA ÚNICA. 34 com 4 atletas (3 jogos cada) e 1 com 5 — o
 * quinto é a VAGA CORINGA, que não joga, fica em 5º e NÃO avança. 34×3 + 3 = 105 jogos,
 * 34×4 + 5 = 141 pessoas: os números da produção. */
const NG = 35, COM_RETRATO = 25, IDX_GRUPO_DE_5 = 33;

function jogo(id, a, b, c, d, ua, ub, uc, ud, gA, gB) {
  return { id: id, isMonarch: true, p1: a + ' / ' + b, p2: c + ' / ' + d,
    team1: [a, b], team1Uids: [ua, ub], team2: [c, d], team2Uids: [uc, ud],
    scoreP1: gA, scoreP2: gB, winner: gA > gB ? (a + ' / ' + b) : (c + ' / ' + d),
    sets: [{ gamesP1: gA, gamesP2: gB }], resultAt: 1000 };
}
// Rei/Rainha de 4 numa rodada: os 3 pareamentos possíveis. Quem joga com todos e vence tudo
// fica em 1º; os outros três EMPATAM em vitórias e o saldo de games separa — é exatamente a
// forma que a Confra produz (por isso a fixture não inventa uma distribuição impossível).
function grupo4(gi) {
  const P = ['A', 'B', 'C', 'D'].map((x) => 'G' + gi + x);
  const U = P.map((n) => 'uid-' + n);
  const L1 = gi % 3, L2 = L1 + 1, L3 = L1 + 2;   // L1<L2<L3 → ordem A>B>C>D, com força variando por grupo
  return { name: 'R1 Grupo ' + gi, players: P.slice(), playersUids: U.slice(), matches: [
    jogo('m' + gi + '-1', P[0], P[1], P[2], P[3], U[0], U[1], U[2], U[3], 6, L1),
    jogo('m' + gi + '-2', P[0], P[2], P[1], P[3], U[0], U[2], U[1], U[3], 6, L2),
    jogo('m' + gi + '-3', P[0], P[3], P[1], P[2], U[0], U[3], U[1], U[2], 6, L3)] };
}
function grupo5(gi) {   // + a vaga coringa, que não joga
  const g = grupo4(gi);
  g.players.push('Coringa'); g.playersUids.push(null);
  return g;
}
// A CLASSIFICAÇÃO QUE A TELA MOSTRA — a expressão do render (bracket.js), não uma cópia da
// do motor: é dela que o retrato dos 10 tem que sair, byte a byte.
const telaMostra = (g) => W._computeMonarchStandings({
  players: g.players || [], playersUids: g.playersUids || [],
  matches: g.matches || [], classifCongelada: g.classifCongelada
}, {}, g.category || null) || [];
const soNomeEUid = (st) => (st || []).map((x) => ({ name: (x && x.name) || '', uid: (x && x.uid) || null }));

const grupos = [];
for (let i = 0; i < NG; i++) grupos.push(i === IDX_GRUPO_DE_5 ? grupo5(i) : grupo4(i));

// 25 recebem retrato INVERTIDO em relação ao vivo (divergência garantida no top-4).
// O grupo 0 fica LEGADO de propósito: nasceu sem `classifCongeladaAt` e vale igual.
const vivoAntes = grupos.map((g) => soNomeEUid(telaMostra(g)));
for (let i = 0; i < COM_RETRATO; i++) {
  grupos[i].classifCongelada = vivoAntes[i].slice().reverse();
  if (i > 0) grupos[i].classifCongeladaAt = '2026-08-30T12:00:00.000Z';
}

const todosOsJogos = [];
grupos.forEach((g) => g.matches.forEach((m) => todosOsJogos.push(m)));
const participantes = [];
grupos.forEach((g) => g.players.forEach((n, k) => participantes.push({ uid: g.playersUids[k], name: n, displayName: n, ligaActive: true })));

const CFG_ELIM = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/prod-tournaments.json'), 'utf8'));
const cfgElim = JSON.parse(JSON.stringify(CFG_ELIM[0].phases[1]));   // a config REAL da fase 2 da Confra

const t = {
  id: 'confra-eq', name: 'Confra (equivalente)', sport: 'Beach Tennis', status: 'in_progress',
  currentPhaseIndex: 0, teamSize: 2, enrollmentMode: 'individual', participants: participantes,
  matches: [], checkedIn: {}, absent: {}, combinedCategories: [], standbyParticipants: [], waitlist: [],
  phases: [
    { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1, groupsBy: 'sorteio' },
    // ⚠️ `_promoteAsked/_promoteLines` explícitos: este é o caminho NÃO PROMOVER, que é o que
    // o oráculo da produção mediu (100 jogos). O caminho de promover é medido no bloco ⑥.
    Object.assign(cfgElim, { _promoteAsked: true, _promoteLines: 0 })
  ],
  rounds: [{ round: 1, format: 'liga', status: 'complete', monarchGroups: grupos, matches: todosOsJogos }]
};
W.AppStore.tournaments = [t];
W._findTournamentById = function (id) { return String(id) === t.id ? t : null; };

console.log('──── ① a fixture é a Confra: 35 grupos em DOIS estados ────');
ok('35 grupos de Rei/Rainha de rodada única', grupos.length === 35 && E.ehReiRainhaRodadaUnica(t.phases[0]) === true);
ok('  → 25 já têm classifCongelada; 10 não têm',
  grupos.filter((g) => Array.isArray(g.classifCongelada)).length === 25 &&
  grupos.filter((g) => !Array.isArray(g.classifCongelada)).length === 10);
ok('  → e uma delas é LEGADA (sem classifCongeladaAt), como a da produção',
  grupos[0].classifCongeladaAt === undefined && Array.isArray(grupos[0].classifCongelada));
ok('105 jogos na fase 0 e 141 pessoas (os números medidos na produção)',
  todosOsJogos.length === 105 && participantes.length === 141,
  todosOsJogos.length + ' jogos / ' + participantes.length + ' pessoas');
ok('a config da fase 2 é a REAL do snapshot de produção',
  cfgElim.source.scope === 'overall' && cfgElim.source.flatOverall === true && cfgElim.source.mapping.length === 2);
// ⛔ sem divergência o teste não prova nada
const divergem = grupos.slice(0, COM_RETRATO).filter((g, i) => J(g.classifCongelada) !== J(vivoAntes[i]));
const divergemNoTop4 = grupos.slice(0, COM_RETRATO).filter((g, i) =>
  J(g.classifCongelada.slice(0, 4)) !== J(vivoAntes[i].slice(0, 4)));
ok('⭐ nos 25, a ordem VIVA diverge da congelada — e a divergência atinge o top-4 em todos',
  divergem.length === 25 && divergemNoTop4.length === 25,
  'diverge em ' + divergem.length + ', no top-4 em ' + divergemNoTop4.length);

console.log('──── ② o retrato dos 10 é o que a TELA mostrava no instante anterior ────');
const esperadoDos10 = grupos.slice(COM_RETRATO).map((g) => soNomeEUid(telaMostra(g)));
const tbOpts = { tiebreakers: t.tiebreakers, birthByName: {} };
ok('a tela e a porta do avanço concordam ANTES do avanço nos 10 sem retrato',
  grupos.slice(COM_RETRATO).every((g, i) =>
    J(soNomeEUid(E.standingsDaFaseAnterior(g, t, tbOpts, true))) === J(esperadoDos10[i])),
  'se divergirem aqui, "a classificação que a tela mostrava" é ambígua e nada abaixo vale');

console.log('──── ③ O AVANÇO REAL (window._advanceMultiPhase) ────');
const bytesAntes = grupos.slice(0, COM_RETRATO).map((g) => J({ c: g.classifCongelada, at: g.classifCongeladaAt }));
W._advanceMultiPhase(t.id);
ok('avançou pra fase 1', t.currentPhaseIndex === 1 && t._phaseMaterialized === 1,
  'currentPhaseIndex=' + t.currentPhaseIndex + ' _phaseMaterialized=' + t._phaseMaterialized);

const bytesDepois = grupos.slice(0, COM_RETRATO).map((g) => J({ c: g.classifCongelada, at: g.classifCongeladaAt }));
const mudados = bytesAntes.map((b, i) => (b === bytesDepois[i] ? null : i)).filter((x) => x !== null);
ok('⭐⭐ as 25 congeladas continuam BYTE A BYTE iguais (lista e carimbo)', mudados.length === 0,
  'mudaram os grupos: ' + mudados.join(', '));
ok('  → inclusive a LEGADA, que segue sem classifCongeladaAt (não foi "regularizada")',
  grupos[0].classifCongeladaAt === undefined);
ok('⭐⭐ as 10 que faltavam foram congeladas EXATAMENTE pela ordem da tela pré-avanço',
  grupos.slice(COM_RETRATO).every((g, i) => J(g.classifCongelada) === J(esperadoDos10[i])),
  grupos.slice(COM_RETRATO).map((g, i) => J(g.classifCongelada) === J(esperadoDos10[i]) ? '' : ('g' + (COM_RETRATO + i) + ': ' + J(g.classifCongelada) + ' ≠ ' + J(esperadoDos10[i]))).filter(Boolean).join('\n      '));
ok('  → e nasceram COM carimbo (classifCongeladaAt), que é o que as distingue das legadas',
  grupos.slice(COM_RETRATO).every((g) => typeof g.classifCongeladaAt === 'string' && g.classifCongeladaAt.length > 0));
ok('⭐⭐ depois do avanço, 35/35 grupos têm congelada',
  grupos.filter((g) => Array.isArray(g.classifCongelada)).length === 35);

console.log('──── ④ nada é RECALCULADO depois de congelado ────');
ok('a porta do avanço devolve a congelada em 35/35 grupos',
  grupos.every((g) => J(soNomeEUid(E.standingsDaFaseAnterior(g, t, tbOpts, true))) === J(g.classifCongelada)),
  'algum grupo voltou a recalcular');
// idempotência: rodar o avanço de novo não pode reescrever retrato nenhum
const bytes35Antes = grupos.map((g) => J({ c: g.classifCongelada, at: g.classifCongeladaAt }));
W._advanceMultiPhase(t.id);
ok('⭐ rodar o avanço de novo não reescreve nenhum retrato (guarda de idempotência)',
  grupos.every((g, i) => J({ c: g.classifCongelada, at: g.classifCongeladaAt }) === bytes35Antes[i]));
// e por FONTE: a guarda existe e é a primeira coisa do laço — é ela que pega a próxima regressão
const src = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
ok('  → e a guarda está no fonte: grupo com congelada é PULADO antes de qualquer cálculo',
  /if \(!g \|\| Array\.isArray\(g\.classifCongelada\)\) return;/.test(src));

console.log('──── ⑤ o ORÁCULO da produção (CONFRA.QA.P0 ⑤) ────');
const f1 = (t.matches || []).filter((m) => (m.phaseIndex || 0) === 1);
ok('⭐⭐ 100 jogos na fase 2', f1.length === 100, 'obtido ' + f1.length);
const duplas = new Set(); const pessoas = new Set();
f1.forEach((m) => [m.p1, m.p2].forEach((x) => {
  if (!x || x === 'TBD' || /BYE|a definir/i.test(String(x))) return;
  if (/\s\/\s/.test(String(x))) duplas.add(String(x));
  String(x).split(' / ').forEach((n) => pessoas.add(n));
}));
ok('⭐⭐ 70 duplas', duplas.size === 70, 'obtido ' + duplas.size);
ok('⭐⭐ 140 pessoas — o top-4 dos 35 grupos, inteiro', pessoas.size === 140, 'obtido ' + pessoas.size);
ok('⭐⭐ NENHUM 5º colocado: a vaga coringa não avança', !pessoas.has('Coringa'));
ok('  → e as duas trilhas são as que o organizador nomeou (Ouro/Prata)',
  ['Ouro', 'Prata'].every((L) => f1.some((m) => m.tierLabel === L)));
// ⭐ a prova de que foi o RETRATO que formou as duplas: no grupo 0 a congelada é a viva
// invertida, então o Ouro dele é a dupla dos DOIS PIORES ao vivo.
const cong0 = grupos[0].classifCongelada.map((x) => x.name);
const ouro0 = cong0[0] + ' / ' + cong0[1], ouro0inv = cong0[1] + ' / ' + cong0[0];
ok('⭐⭐ a dupla saiu da CONGELADA, não do recálculo (grupo 0: Ouro = 1º+2º do retrato)',
  duplas.has(ouro0) || duplas.has(ouro0inv),
  'esperava ' + ouro0 + ' entre as duplas; o recálculo teria formado ' + vivoAntes[0][0].name + ' / ' + vivoAntes[0][1].name);
const pr = W._phaseCurrentRoundProgress(t);
ok('⭐⭐ a primeira rodada da fase 2 é a "Rodada 2"', !!pr && pr.roundNumGlobal === 2 && /Rodada 2\b/.test(pr.name),
  J(pr && { n: pr.roundNumGlobal, name: pr.name }));
const fase = W._currentPhaseGames(t);
ok('⭐⭐ o contador da fase é 0/100', fase.total === 100 && fase.done === 0, J(fase));

console.log('──── ⑥ a promoção: mesma porta, e ela move uma DUPLA ────');
const cs = (g) => E.standingsDaFaseAnterior(g, t, tbOpts, true);
const preCheque = E.selectQualifiers(grupos, t.phases[1], { computeStandings: cs, prevRRRodadaUnica: true });
const semPromover = E.buildPhaseBrackets(grupos, Object.assign({}, t.phases[1], { _promoteLines: 0, _prevRRRodadaUnica: true }), cs, 'ps').byDest;
ok('⭐⭐ o pré-cheque do painel e o materializador leem a MESMA porta: 35/35 nos dois',
  (preCheque.upper || []).length === 35 && (preCheque.lower || []).length === 35 &&
  (semPromover.upper || []).length === 35 && (semPromover.lower || []).length === 35,
  'pré-cheque ' + (preCheque.upper || []).length + '/' + (preCheque.lower || []).length +
  ' × materializa ' + (semPromover.upper || []).length + '/' + (semPromover.lower || []).length);
// a regra REAL do painel, lida do arquivo (nunca uma réplica)
const promoveAjuda = (function () {
  const fonte = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-draw-prep.js'), 'utf8');
  const m = fonte.match(/window\._phasePromoteHelps = function[\s\S]*?\n\};/);
  if (!m) return null;
  let f = null; eval('f = ' + m[0].replace('window._phasePromoteHelps = ', '').replace(/;$/, '')); return f;
})();
ok('⭐⭐ 35/35 (dois ímpares) → a promoção É oferecida',
  typeof promoveAjuda === 'function' && promoveAjuda([{ size: 35 }, { size: 35 }]) === true);
const promovido = E.buildPhaseBrackets(grupos, Object.assign({}, t.phases[1], { _promoteLines: 1, _prevRRRodadaUnica: true }), cs, 'pp').byDest;
ok('⭐⭐ ao promover, fica Ouro 36 / Prata 34',
  (promovido.upper || []).length === 36 && (promovido.lower || []).length === 34,
  (promovido.upper || []).length + '/' + (promovido.lower || []).length);
const sobe = (promovido.upper || [])[(promovido.upper || []).length - 1];
const eraTopoDaPrata = (semPromover.lower || [])[0];
ok('⭐⭐ o que sobe é uma DUPLA INTEIRA (dois integrantes, não uma pessoa)',
  !!(sobe && sobe.p1Name && sobe.p2Name && (sobe.participants || []).length === 2),
  J(sobe && { n: sobe.name, p1: sobe.p1Name, p2: sobe.p2Name }));
ok('  → e é a MELHOR da linha de baixo, entrando como PIOR semente da de cima',
  !!(sobe && eraTopoDaPrata && sobe.name === eraTopoDaPrata.name),
  'subiu ' + (sobe && sobe.name) + ' · topo da Prata era ' + (eraTopoDaPrata && eraTopoDaPrata.name));
ok('  → e a de baixo nunca fica vazia nem perde ninguém no caminho (36+34 = 35+35)',
  (promovido.upper || []).length + (promovido.lower || []).length === 70);

console.log(falhas === 0
  ? '\n✅ congelada-nasce-no-avanco-e-nunca-muda: OK'
  : '\n❌ congelada-nasce-no-avanco-e-nunca-muda: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
