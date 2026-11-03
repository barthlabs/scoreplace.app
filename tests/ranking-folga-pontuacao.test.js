'use strict';
const assert = require('node:assert/strict');
const harness = require('./headless');
const { window: W } = harness;
const active = require('../functions-autodraw/config-ativa-core.js');
const { validateNewFormatIntent } = require('../functions-autodraw/format-intent-validation-core.js');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }

const initial = W.FORMAT2.defaultConfig('Beach Tennis');
assert.equal(initial.rankingSitOutScoring.mode, 'average');
for (const parceria of ['fixa', 'sorteio_rodada', 'rei_rainha']) {
  const cfg = { ...initial, parceria, rodadas: { ...initial.rodadas, modo: 'fixo' },
    rankingSitOutScoring: { mode: 'fixed', points: 5 } };
  const compiled = W.FORMAT2.compileToPhases(cfg, { sport: 'Beach Tennis' });
  assert.deepEqual(JSON.parse(JSON.stringify(compiled.topLevel.rankingSitOutScoring)), { mode: 'fixed', points: 5 });
  assert.deepEqual(JSON.parse(JSON.stringify(compiled.phases[0].rankingSitOutScoring)), { mode: 'fixed', points: 5 });
}
assert.doesNotThrow(() => validateNewFormatIntent({ rankingSitOutScoring: { mode: 'fixed', points: 5 } }, HttpsError));
for (const invalid of [{ mode: 'arbitrary' }, { mode: 'fixed' }, { mode: 'fixed', points: -1 },
  { mode: 'fixed', points: 1.5 }]) {
  assert.throws(() => validateNewFormatIntent({ rankingSitOutScoring: invalid }, HttpsError),
    error => error.code === 'invalid-argument');
}

const pairRanking = {
  format: 'Liga', participants: [{ displayName: 'A / B' }, { displayName: 'C / D' }],
  rounds: [
    { round: 1, matches: [{ id: 'folga', p1: 'A / B', p2: 'FOLGA', isSitOut: true, sitOutReason: 'remainder' }] },
    { round: 2, matches: [{ id: 'jogo', p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 3 }] }
  ], matches: []
};
function pairPoints(policy) {
  pairRanking.rankingSitOutScoring = policy;
  return W._computeStandings(pairRanking).find(s => s.name === 'A / B').points;
}
assert.equal(pairPoints({ mode: 'average' }), 6, 'média da rodada jogada atualiza a folga anterior');
assert.equal(pairPoints({ mode: 'zero' }), 3, 'organizador escolhe zero');
assert.equal(pairPoints({ mode: 'fixed', points: 5 }), 8, 'organizador escolhe valor fixo');
pairRanking.advancedScoring = { enabled: true };
pairRanking.rankingSitOutScoring = { mode: 'fixed', points: 5 };
assert.equal(W._computeStandings(pairRanking).find(s => s.name === 'A / B').advancedPoints, 5,
  'valor fixo também entra no critério principal de pontos avançados');

const drawnPairs = {
  id: 'ranking-pares-sorteados', format: 'Liga', teamSize: 2, ligaRoundFormat: 'standard',
  ligaDrawMode: 'standard', status: 'active', rounds: [], matches: [],
  rankingSitOutScoring: { mode: 'fixed', points: 5 },
  participants: Array.from({ length: 5 }, (_, i) => ({ uid: 'u' + i, displayName: 'P' + i, ligaActive: true }))
};
W._generateNextRound(drawnPairs, { rnd: () => 0.5 });
const randomSitOut = drawnPairs.rounds[0].matches.find(m => m.isSitOut && m.sitOutReason === 'remainder');
assert.ok(randomSitOut);
assert.equal(W._computeStandings(drawnPairs).find(s => s.name === randomSitOut.p1).points, 5,
  'dupla sorteada aplica o mesmo controle');

const drawCore = require('../functions-autodraw/draw-core.js');
function actualRankingDraw(parceria, names, policy) {
  const cfg = { ...initial, parceria, rodadas: { ...initial.rodadas, modo: 'fixo', n: 2 },
    eliminatoria: { ...initial.eliminatoria, ativa: false }, rankingSitOutScoring: policy };
  const actual = { id: 'ranking-real-' + parceria, sport: 'Beach Tennis', fmt2: cfg,
    rulesContractVersion: 2,
    participants: names.map((name, i) => ({ uid: 'uid-' + i, displayName: name, ligaActive: true })),
    rounds: [], matches: [], status: 'draft' };
  assert.ok(drawCore.compileFromFmt2(actual).ok);
  assert.ok(drawCore.drawInitial(actual, { idStamp: 1 }).ok);
  return actual;
}
const randomActual = actualRankingDraw('sorteio_rodada', ['P0', 'P1', 'P2', 'P3', 'P4'],
  { mode: 'fixed', points: 5 });
assert.equal(randomActual.rounds[0].matches.filter(m => !m.isSitOut && !m.isBye).length, 1);
assert.equal(randomActual.rounds[0].matches.filter(m => m.isSitOut).length, 1,
  'sorteio inicial real mantém o quinto atleta como folga');
const randomActualSitOut = randomActual.rounds[0].matches.find(m => m.isSitOut);
assert.equal(W._computeStandings(randomActual).find(s => s.name === randomActualSitOut.p1).points, 5);

const fixedActual = actualRankingDraw('fixa', ['A / B', 'C / D', 'E / F'],
  { mode: 'fixed', points: 5 });
assert.equal(fixedActual.rounds[0].matches.filter(m => m.isBye).length, 0,
  'ranking novo de duplas formadas não transforma folga em avanço de chave');
const fixedActualSitOut = fixedActual.rounds[0].matches.find(m => m.isSitOut);
assert.ok(fixedActualSitOut && fixedActualSitOut.p1Uid);
assert.equal(W._computeStandings(fixedActual).find(s => s.name === fixedActualSitOut.p1).points, 5);

const historicalPairs = { ...fixedActual, id: 'ranking-historico', rulesContractVersion: undefined,
  rankingSitOutScoring: undefined,
  rounds: [], matches: [], sitOutHistory: undefined, status: 'active' };
W._generateNextRound(historicalPairs, { rnd: () => 0.5 });
assert.equal(historicalPairs.rounds[0].matches.filter(m => m.isBye).length, 1,
  'contrato antigo de duplas formadas mantém o BYE');

const oldConfig = { eliminatoria: { roundBounds: [] } };
const oldDefaults = active.fmt2Atualizavel(oldConfig, {
  eliminatoria: { roundBounds: [] }, rankingRemainderPolicy: 'waitlist_legacy',
  rankingSitOutScoring: { mode: 'average' }
});
assert.ok(oldDefaults.ok, 'o formulário atual abre um torneio antigo sem criar mudança artificial');
assert.equal(oldDefaults.valor.rankingSitOutScoring, undefined,
  'média histórica implícita não é inserida sem escolha nova');
assert.ok(active.igualEstrutural('rankingSitOutScoring', undefined, { mode: 'average' }));
const change = { eliminatoria: { roundBounds: [] }, rankingRemainderPolicy: 'waitlist_legacy',
  rankingSitOutScoring: { mode: 'zero' } };
const merged = active.fmt2Atualizavel(oldConfig, change);
assert.ok(merged.ok, 'pontuação da folga é campo operacional enquanto a classificatória está ativa');
assert.deepEqual(merged.valor.rankingSitOutScoring, { mode: 'zero' });
assert.equal(merged.valor.rankingRemainderPolicy, undefined, 'default antigo não é gravado por acidente');
const unrelated = { ...change, grupos: 3 };
assert.equal(active.fmt2Atualizavel(oldConfig, unrelated).ok, false,
  'mudar pontuação não abre passagem para mudança estrutural');
const activeRanking = { status: 'in_progress', currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }] };
assert.equal(active.canEditRankingSitOutScoring(activeRanking), true,
  'organizador pode ajustar os pontos de folga durante a classificatória de ranking');
assert.equal(active.canEditRankingSitOutScoring({ ...activeRanking, currentPhaseIndex: 1 }), false,
  'após avançar de fase a regra fica travada para preservar os classificados');
assert.equal(active.canEditRankingSitOutScoring({ ...activeRanking, status: 'finished' }), false);
assert.equal(active.canEditRankingSitOutScoring({ ...activeRanking,
  phases: [{ kind: 'classification', classification: { structure: 'groups' } }] }), false,
  'a opção de ranking não altera fase de grupos');

const box = { innerHTML: '' };
W.document = { getElementById: id => id === 'f2-config-mount' ? box : null };
harness.load('format2-ui.js');
const editable = { id: 'future-ranking', currentPhaseIndex: 0, status: 'in_progress',
  rounds: [{ matches: [] }], matches: [], phases: activeRanking.phases };
const uiConfig = { ...initial, parceria: 'sorteio_rodada' };
W._f2MountInForm(box, 'Beach Tennis', uiConfig, editable);
assert.match(box.innerHTML, /Pontos de quem folga/);
assert.match(box.innerHTML, /Média dinâmica \(sugerida\)/);
W._f2SitOutScoring('zero');
assert.equal(W._f2GetConfig().rankingSitOutScoring.mode, 'zero');
W._f2SitOutScoring('fixed');
W._f2SitOutPoints('5');
assert.deepEqual(JSON.parse(JSON.stringify(W._f2GetConfig().rankingSitOutScoring)),
  { mode: 'fixed', points: 5 }, 'escolha e valor chegam à configuração enviada');
W._f2MountInForm(box, 'Beach Tennis', uiConfig, { ...editable, currentPhaseIndex: 1 });
const scoringHtml = box.innerHTML.slice(box.innerHTML.indexOf('Pontos de quem folga'),
  box.innerHTML.indexOf('Pontos de quem folga') + 240);
assert.match(scoringHtml, /aria-disabled="true"/,
  'controle aparece travado após avançar da classificatória');
console.log('Ranking: pontuação de folga configurável em três modos, três pareamentos e edição controlada OK');
