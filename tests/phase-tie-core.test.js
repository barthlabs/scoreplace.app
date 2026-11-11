'use strict';
const assert = require('assert');
const tie = require('../functions-autodraw/phase-tie-core');
const courts = require('../functions-autodraw/phase-tie-courts');

const rows = ['A', 'B', 'C', 'D'].map((name, i) => ({ uid: name, name, wins: i ? 1 : 3 }));
const cmp = (a, b) => b.wins - a.wins;
cmp.originalOrder = { A: 0, B: 1, C: 2, D: 3 };
const published = { fmt2: { tieResolution: 'singles_then_draw' },
  tiebreakers: ['sorteio', 'saldo_games', 'vitorias'], tiebreakersExcluded: ['sorteio'] };
tie.canonicalizeTieFallback(published);
assert.deepStrictEqual(published.tiebreakers, ['saldo_games', 'vitorias', 'sorteio']);
assert.deepStrictEqual(published.tiebreakersExcluded, []);
const noExtras = { fmt2: { tieResolution: 'singles_then_draw' },
  rankingPrimary: 'games_diff', tiebreakers: [], tiebreakersExcluded: ['sorteio', 'saldo_games'] };
tie.canonicalizeTieFallback(noExtras);
assert.deepStrictEqual(noExtras.tiebreakers, [], 'simples com saldo principal não reativa sorteio nem saldo adicional');
assert.deepStrictEqual(noExtras.tiebreakersExcluded, ['sorteio', 'saldo_games']);
const firstDraw = tie.originalDrawMatches([
  { roundIdx: 0, match: { p1: 'B', p2: 'A', round: 3 } },
  { roundIdx: 1, match: { p1: 'A', p2: 'B', round: 1 } }
]);
assert.deepStrictEqual(firstDraw.map(m => [m.round, m.gameNumber, m.p1]),
  [[1, 1, 'B'], [2, 2, 'A']], 'a primeira rodada conserva a prioridade do sorteio original');
assert.equal(tie.baseGameNumber([{ id: 'grupo-1' }, { id: 'grupo-2' }], [
  { match: { id: 'grupo-1', _gameNum: 91 } },
  { match: { id: 'grupo-2', _gameNum: 93 } },
  { match: { id: 'outro-grupo', _gameNum: 120 } }
]), 93, 'o jogo extra herda o último número do grupo, não do torneio inteiro');
assert.deepStrictEqual([0, 1, 2, 25, 26, 27].map(tie.letterIndex),
  ['A', 'B', 'C', 'Z', 'AA', 'AB']);
assert.strictEqual(tie.drawPosition({ uid: 'B', name: 'B' }, { B: 1 }), 1,
  'ordem por nome cobre jogo histórico sem UID no slot');
const ordered = tie.rankInitialRows([rows[3], rows[2], rows[1], rows[0]], cmp,
  { A: 0, B: 1, C: 2, D: 3 });
assert.deepStrictEqual(ordered.map(r => r.name), ['A', 'B', 'C', 'D'], 'mérito antes da ordem sorteada original');
const found = tie.findBoundaryTie(rows, [2], cmp);
assert.deepStrictEqual(found.players.map(p => p.name), ['B', 'C', 'D']);
assert.deepStrictEqual([found.from, found.to, found.cut], [1, 3, 2]);
assert.deepStrictEqual(tie.boundariesFor({ fixedPairs: true, pairingStrategy: 'top', source: {
  mapping: [{ dest: 'a', rankFrom: 1, rankTo: 4 }, { dest: 'b', rankFrom: 1, rankTo: 4 }]
} }, 4), [2], 'duas linhas após Rei/Rainha separam 2º e 3º');
assert.deepStrictEqual(tie.boundariesFor({ source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } }, 4), [2]);
assert.deepStrictEqual(tie.boundariesFor({ source: { lineAssignment: 'rank_ranges', mapping: [
  { dest: 'a', rankFrom: 1, rankTo: 2 }, { dest: 'b', rankFrom: 3, rankTo: 4 }
] } }, 4), [2], 'faixas explícitas pedem desempate na fronteira entre destinos');
const wildRows = [{ uid: 'x', name: 'X', points: 9 }, { uid: 'y', name: 'Y', points: 9 },
  { uid: 'z', name: 'Z', points: 7 }];
const wildCompare = (a, b) => b.points - a.points;
wildCompare.originalOrder = { x: 0, y: 1, z: 2 };
const wildChoice = tie.resolvePhaseTies({}, 0, [{ id: 'wildcards', rows: wildRows }],
  { source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 1 }] } }, () => wildCompare,
  null, 1, false, () => 93);
assert.equal(wildChoice.status, 'choice');
assert.equal(wildChoice.tie.decisionId, 'wildcards:0:1');
assert.deepStrictEqual(tie.boundariesFor({ fixedPairs: true, pairingStrategy: 'balanced', source: {
  mapping: [{ dest: 'a', rankFrom: 1, rankTo: 2 }, { dest: 'b', rankFrom: 3, rankTo: 4 }]
} }, 4), [1, 3], 'pareamento equilibrado muda a linha nas pontas do ranking');
assert.deepStrictEqual(tie.boundariesFor({ fixedPairs: true, pairingStrategy: 'top', source: {
  mapping: [{ dest: 'a', rankTo: 8 }, { dest: 'b', rankTo: 8 }]
} }, 8), [4], 'duas linhas com quatro duplas separam as duplas centrais');
assert.deepStrictEqual(tie.boundariesFor({ fixedPairs: false, pairingStrategy: 'top', source: {
  mapping: [{ dest: 'a', rankTo: 8 }, { dest: 'b', rankTo: 8 }]
} }, 8), [4], 'indivíduos também usam a fronteira real entre linhas');
assert.deepStrictEqual(tie.boundariesFor({ fixedPairs: true, pairingStrategy: 'draw_among', source: {
  mapping: [{ dest: 'a', rankTo: 4 }, { dest: 'b', rankTo: 4 }]
} }, 5), [4], 'sorteio de parcerias só resolve o corte de entrada');
const games = tie.matchesFor(found, 'phase-0-group-0', 93, 0);
assert.deepStrictEqual(games.map(m => [m.p1.name, m.p2.name]), [['B', 'C'], ['B', 'D'], ['C', 'D']]);
assert.deepStrictEqual(games.map(m => m.displayGameNumber), ['93A', '93B', '93C']);
games[0] = tie.scoreMatch(games[0], [{ p1: 6, p2: 4 }], 1); // B > C
games[1] = tie.scoreMatch(games[1], [{ p1: 6, p2: 2 }], 1); // B > D
games[2] = tie.scoreMatch(games[2], [{ p1: 6, p2: 3 }], 1); // C > D
assert.deepStrictEqual(tie.rankPlayers(found, games), ['uid:B', 'uid:C', 'uid:D']);
const moved = tie.applyOrder(rows, found, ['uid:D', 'uid:B', 'uid:C']);
assert.deepStrictEqual(moved.map(r => r.name), ['A', 'D', 'B', 'C']);

const cycle = tie.matchesFor(found, 'cycle');
cycle[0] = tie.scoreMatch(cycle[0], [{ p1: 6, p2: 4 }], 1); // B > C
cycle[1] = tie.scoreMatch(cycle[1], [{ p1: 4, p2: 6 }], 1); // D > B
cycle[2] = tie.scoreMatch(cycle[2], [{ p1: 6, p2: 4 }], 1); // C > D
assert.deepStrictEqual(tie.rankPlayers(found, cycle), ['uid:B', 'uid:C', 'uid:D'], 'empate circular usa a ordem original');

assert.deepStrictEqual(tie.findBoundaryTie(rows, [1], cmp), null, 'a fronteira fora do bloco empatado não abre disputa');
assert.throws(() => tie.scoreMatch(games[0], [{ p1: 6, p2: 6 }], 1), /placar inválido/);
assert.throws(() => tie.scoreMatch(games[0], [{ p1: 6, p2: 4 }], 2), /incompleta/);
assert.equal(tie.scoreMatch(games[0], [{ p1: 5, p2: 4 }], 1, 5, 1).winnerKey, 'uid:B',
  'no tie-break sem vantagem, o primeiro a chegar a cinco vence');
assert.throws(() => tie.scoreMatch(games[0], [{ p1: 6, p2: 4 }], 1, 5, 1), /placar inválido/,
  'não aceita ponto extra depois de a simples terminar');
assert.throws(() => tie.scoreMatch(games[0], [{ p1: 6, p2: 5 }], 1, 5, 1), /placar inválido/,
  '6 a 5 não é possível quando o primeiro a alcançar cinco encerra a simples');
assert.equal(tie.scoreMatch(games[0], [{ p1: 6, p2: 4 }], 1, 5, 2).winnerKey, 'uid:B',
  'configuração alternativa de vantagem exige o sexto ponto em 4 a 4');
assert.throws(() => tie.scoreMatch(games[0], [{ p1: 5, p2: 4 }], 1, 5, 2), /placar inválido/);
assert.equal(tie.scoreMatch(games[0], [{ p1: 100, p2: 98 }], 1, 99, 2).winnerKey, 'uid:B',
  'meta de 99 com dois pontos de vantagem permite terminar após 98 a 98');

const fresh = {};
const next = { fixedPairs: true, pairingStrategy: 'top', source: { mapping: [
  { dest: 'first', rankFrom: 1, rankTo: 4 }, { dest: 'second', rankFrom: 1, rankTo: 4 }
] } };
const pools = [{ id: 'group-a', rows }];
assert.throws(() => tie.resolvePhaseTies({}, 0, pools, next, () => cmp,
  { type: 'play', decisionId: 'decisao-inexistente' }, 1, false, () => 93),
  /decisão de desempate desatualizada/, 'escolha não aceita decisão de desempate desconhecida');
let flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp, null, 1, false, () => 93);
assert.strictEqual(flow.status, 'choice');
assert.strictEqual(flow.tie.baseGameNumber, 93);
assert.strictEqual(flow.tie.firstExtraGameNumber, '93A');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'play', decisionId: flow.tie.decisionId }, 1, false, () => 93);
assert.strictEqual(flow.status, 'pending');
assert.equal(flow.decision.pointsToWin, 5);
assert.equal(flow.decision.pointMargin, 1);
assert.equal(flow.decision.setsToWin, 1);
assert.deepStrictEqual(flow.decision.matches.map(m => m.displayGameNumber), ['93A'],
  'empate triplo cria só a primeira simples; próximas dependem do placar');
const legacyDecision = JSON.parse(JSON.stringify(flow.decision));
legacyDecision.setsToWin = 2;
delete legacyDecision.pointsToWin;
delete legacyDecision.pointMargin;
const legacyTournament = { phaseTieDecisions: { '0': { [flow.tie.decisionId]: legacyDecision } } };
const legacyScore = tie.resolvePhaseTies(legacyTournament, 0, pools, next, () => cmp,
  { type: 'score', decisionId: flow.tie.decisionId, matchId: legacyDecision.matches[0].id,
    sets: [{ p1: 6, p2: 4 }, { p1: 3, p2: 6 }, { p1: 6, p2: 4 }] }, 1, false, () => 93);
assert.equal(legacyScore.decision.matches[0].winnerKey, legacyDecision.matches[0].p1.key,
  'decisão legada já iniciada, melhor de três e sem meta de pontos, pode concluir o jogo');
assert.throws(() => tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'score', decisionId: 'decisao-inexistente', matchId: flow.decision.matches[0].id,
    sets: [{ p1: 6, p2: 4 }] }, 1, false, () => 93),
  /decisão de desempate desatualizada/, 'placar não aceita decisão de desempate desconhecida');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'court', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[0].id, court: 'Quadra 1' }, 1, false, () => 93);
assert.equal(flow.decision.matches[0].court, 'Quadra 1');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'call', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[0].id, at: '2026-11-03T12:00:00Z' }, 1, false, () => 93);
assert.equal(flow.decision.matches[0].courtCalledAt, '2026-11-03T12:00:00Z');
const sameBase = { phaseTieDecisions: { '0': { earlier: {
  baseGameNumber: 93, matches: [{}, {}]
} } } };
const sameBaseChoice = tie.resolvePhaseTies(sameBase, 0, pools, next, () => cmp, null, 1, false, () => 93);
assert.strictEqual(sameBaseChoice.tie.firstExtraGameNumber, '93C');
const sameBasePlay = tie.resolvePhaseTies(sameBase, 0, pools, next, () => cmp,
  { type: 'play', decisionId: sameBaseChoice.tie.decisionId }, 1, false, () => 93);
assert.deepStrictEqual(sameBasePlay.decision.matches.map(m => m.displayGameNumber), ['93C'],
  'outra disputa extra ligada ao mesmo jogo-base não reutiliza letras');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'score', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[0].id,
    sets: [{ p1: 5, p2: 4 }] }, 1, false, () => 93);
assert.strictEqual(flow.status, 'pending');
assert.deepStrictEqual(flow.decision.matches.map(m => m.displayGameNumber), ['93A', '93B']);
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'score', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[1].id,
    sets: [{ p1: 5, p2: 4 }] }, 1, false, () => 93);
assert.strictEqual(flow.status, 'review');
const invalidatedSecondId = flow.decision.matches[1].id;
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'score', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[0].id,
    sets: [{ p1: 4, p2: 5 }], at: '2026-11-03T12:30:00Z' }, 1, false, () => 93);
assert.equal(flow.decision.corrections.length, 1);
assert.strictEqual(flow.status, 'pending', 'corrigir a primeira simples invalida a seguinte');
assert.notEqual(flow.decision.matches[1].id, invalidatedSecondId,
  'jogo recriado após correção recebe identidade própria');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'score', decisionId: flow.tie.decisionId, matchId: flow.decision.matches[1].id,
    sets: [{ p1: 5, p2: 4 }] }, 1, false, () => 93);
assert.strictEqual(flow.status, 'review');
flow = tie.resolvePhaseTies(fresh, 0, pools, next, () => cmp,
  { type: 'confirm', decisionId: flow.tie.decisionId, at: '2026-11-03T12:31:00Z' }, 1, false, () => 93);
assert.strictEqual(flow.status, 'ready');
assert.deepStrictEqual(flow.orderedPools[0].rows.map(p => p.name), ['A', 'C', 'D', 'B'],
  'placar corrigido altera a classificação confirmada');
assert.strictEqual(fresh.phaseTieDecisions['0']['group-a:1:3'].matches.length, 2);

const changedRows = ['A', 'B', 'C', 'E'].map((name, i) => ({ uid: name, name, wins: i ? 1 : 3 }));
const changedCompare = (a, b) => b.wins - a.wins;
changedCompare.originalOrder = { A: 0, B: 1, C: 2, E: 3 };
const stale = { phaseTieDecisions: JSON.parse(JSON.stringify(fresh.phaseTieDecisions)) };
const changedFlow = tie.resolvePhaseTies(stale, 0, [{ id: 'group-a', rows: changedRows }],
  next, () => changedCompare, null, 1, false, () => 93, '2026-11-03T12:40:00Z');
assert.equal(changedFlow.status, 'choice', 'W.O. posterior à escolha pede nova decisão em vez de travar');
assert.equal(stale.history[0].phaseTieDecision.matches.length, 2, 'jogos extras anteriores ficam auditáveis');
assert.equal(stale.phaseTieDecisions['0']['group-a:1:3'], undefined);
assert.equal(changedFlow.tie.firstExtraGameNumber, '93C', 'nova escolha não reutiliza números de jogos arquivados');
const refreshedFlow = tie.resolvePhaseTies(stale, 0, [{ id: 'group-a', rows: changedRows }],
  next, () => changedCompare, null, 1, false, () => 93);
assert.equal(refreshedFlow.tie.firstExtraGameNumber, '93C');

const quick = {};
const question = tie.resolvePhaseTies(quick, 0, pools, next, () => cmp, null, 1);
const drawn = tie.resolvePhaseTies(quick, 0, pools, next, () => cmp,
  { type: 'draw', decisionId: question.tie.decisionId }, 1);
assert.strictEqual(drawn.status, 'ready');
assert.deepStrictEqual(drawn.orderedPools[0].rows.map(p => p.name), rows.map(p => p.name));
const automatic = {};
assert.strictEqual(tie.resolvePhaseTies(automatic, 0, pools, next, () => cmp, null, 1, true).status, 'ready');
assert.strictEqual(automatic.phaseTieDecisions['0']['group-a:1:3'].reason, 'rule-original-draw-order');
const noDraw = (a, b) => b.wins - a.wins;
noDraw.originalOrder = { A: 0, B: 1, C: 2 };
assert.throws(() => tie.resolvePhaseTies({}, 0, pools, next, () => noDraw, null, 1, true),
  /ordem do sorteio original ausente/, 'não inventa prioridade do atleta sem posição no sorteio');
assert.throws(() => tie.resolvePhaseTies({}, 0, pools, next, () => cmp, null, 1, false, () => null),
  /número canônico/, 'não inventa número para partidas extras');

const autoRows = [
  { uid: 'A', name: 'A', wins: 3 }, { uid: 'B', name: 'B', wins: 2 },
  { uid: 'C', name: 'C', wins: 2 }, { uid: 'D', name: 'D', wins: 0 }
];
const autoCfg = { source: { mapping: [{ dest: 'next', rankFrom: 1, rankTo: 2 }] } };
const autoTournament = { fmt2: { tieResolution: 'singles_then_draw', tieSinglesPoints: 5,
  tieSinglesMargin: 1 } };
const autoPool = [{ id: 'group-0', group: { name: 'Diamante · Grupo 1' }, rows: autoRows }];
const autoOpts = { autoPlay: true, retainOtherDecisions: true };
let autoFlow = tie.resolvePhaseTies(autoTournament, 0, autoPool, autoCfg, () => cmp,
  null, 1, false, () => 3, '2026-11-07T15:00:00Z', autoOpts);
assert.equal(autoFlow.status, 'pending', 'a simples surge no fechamento do quarteto sem escolha manual');
assert.equal(autoFlow.decision.matches.length, 1, 'segundo e terceiro jogam uma simples');
assert.equal(autoFlow.decision.matches[0].displayGameNumber, '3A');
assert.equal(autoFlow.decision.groupName, 'Diamante · Grupo 1');
assert.equal(autoFlow.decision.reason, 'rule-automatic-singles');
assert.equal(autoFlow.decision.matches[0].court, undefined, 'quadra é escolhida quando o empate aparece');
const extraId = autoFlow.decision.matches[0].id;
autoFlow = tie.resolvePhaseTies(autoTournament, 0, autoPool, autoCfg, () => cmp,
  null, 1, false, () => 3, '2026-11-07T15:01:00Z', autoOpts);
assert.equal(autoFlow.decision.matches[0].id, extraId, 'repetir o mesmo placar não duplica a simples');
const otherId = 'group-1:1:2';
autoTournament.phaseTieDecisions['0'][otherId] = { contenders: ['uid:X', 'uid:Y'], matches: [] };
tie.resolvePhaseTies(autoTournament, 0, autoPool, autoCfg, () => cmp,
  null, 1, false, () => 3, '2026-11-07T15:02:00Z', autoOpts);
assert(autoTournament.phaseTieDecisions['0'][otherId], 'um grupo não apaga desempate de outro');
assert(tie.archivePoolDecisions(autoTournament, 0, 'group-0', '2026-11-07T15:03:00Z'),
  'reabrir o terceiro placar invalida só a simples daquele grupo');
assert(autoTournament.phaseTieDecisions['0'][otherId], 'a simples do outro grupo permanece');
autoFlow = tie.resolvePhaseTies(autoTournament, 0, autoPool, autoCfg, () => cmp,
  null, 1, false, () => 3, '2026-11-07T15:04:00Z', autoOpts);
assert.equal(autoFlow.decision.matches[0].displayGameNumber, '3B', 'novo jogo não reutiliza número arquivado');
const staleAuto = { fmt2: autoTournament.fmt2, phaseTieDecisions: { '0': {
  'group-0:1:2': { contenders: ['uid:B', 'uid:D'], choice: 'draw', status: 'complete',
    order: ['uid:B', 'uid:D'], baseGameNumber: 3, matches: [] }
} } };
const newAuto = tie.resolvePhaseTies(staleAuto, 0, autoPool, autoCfg, () => cmp,
  null, 1, true, () => 3, '2026-11-07T15:05:00Z', autoOpts);
assert.equal(newAuto.status, 'pending', 'a fronteira corrigida cria simples no mesmo salvamento');
assert.equal(newAuto.decision.choice, 'play', 'sorteio automático não substitui simples configurada');
assert.equal(staleAuto.history[0].phaseTieDecision.choice, 'draw',
  'a escolha antiga fica no histórico após a correção');

const topRows = ['A', 'B', 'C', 'D'].map((name, i) => ({ uid: name, name, wins: i < 3 ? 2 : 0 }));
const topPool = [{ id: 'top-group', group: { name: 'Grupo A1' }, rows: topRows }];
const topConfig = { source: { mapping: [{ dest: 'next', rankFrom: 1, rankTo: 2 }] } };
function topStep(t, action, at) {
  return tie.resolvePhaseTies(t, 0, topPool, topConfig, () => cmp,
    action, 1, false, () => 3, at || '2026-11-11T10:00:00Z', autoOpts);
}
const top = { fmt2: { tieResolution: 'singles_then_draw', tieSinglesPoints: 5, tieSinglesMargin: 1 },
  courtNames: ['Quadra 1', 'Quadra 2', 'Quadra 3'], currentPhaseIndex: 0 };
let topFlow = topStep(top);
assert.equal(topFlow.decision.qualifierSlots, 2, 'empate entre os três primeiros disputa duas vagas');
assert.equal(topFlow.decision.matches.length, 1);
const occupied = [{ id: 'regular-1', court: 'Quadra 1', courtCalledAt: '2026-11-11T09:00:00Z' }];
const isOccupied = m => !!(m.court && m.courtCalledAt && !m.winnerKey);
let called = courts.callPending(top, occupied, {}, isOccupied, '2026-11-11T10:01:00Z');
assert.deepStrictEqual(called.map(c => c.court), ['Quadra 2'], 'simples usa a próxima quadra livre');
assert.equal(courts.callPending(top, occupied, {}, isOccupied, '2026-11-11T10:02:00Z').length, 0,
  'repetir a chamada não duplica o jogo');
topFlow = topStep(top, { type: 'score', decisionId: topFlow.tie.decisionId,
  matchId: topFlow.decision.matches[0].id, sets: [{ p1: 5, p2: 4 }] });
assert.equal(topFlow.decision.matches.length, 2, 'vencedor enfrenta terceiro atleta');
called = courts.callPending(top, occupied, {}, isOccupied, '2026-11-11T10:03:00Z');
assert.deepStrictEqual(called.map(c => c.court), ['Quadra 2'], 'quadra da simples concluída fica livre');
topFlow = topStep(top, { type: 'score', decisionId: topFlow.tie.decisionId,
  matchId: topFlow.decision.matches[1].id, sets: [{ p1: 5, p2: 4 }] });
assert.equal(topFlow.decision.matches.length, 3, 'se o mesmo atleta venceu duas vezes, a segunda vaga exige terceira simples');
assert.equal(topFlow.status, 'pending');
topFlow = topStep(top, { type: 'score', decisionId: topFlow.tie.decisionId,
  matchId: topFlow.decision.matches[2].id, sets: [{ p1: 4, p2: 5 }] });
assert.equal(topFlow.status, 'review');
assert.deepStrictEqual(topFlow.decision.order, ['uid:A', 'uid:C', 'uid:B'],
  'terceira simples define a segunda vaga sem recorrer à margem dos placares');

const topTwo = { fmt2: top.fmt2 };
let topTwoFlow = topStep(topTwo);
topTwoFlow = topStep(topTwo, { type: 'score', decisionId: topTwoFlow.tie.decisionId,
  matchId: topTwoFlow.decision.matches[0].id, sets: [{ p1: 5, p2: 4 }] });
topTwoFlow = topStep(topTwo, { type: 'score', decisionId: topTwoFlow.tie.decisionId,
  matchId: topTwoFlow.decision.matches[1].id, sets: [{ p1: 4, p2: 5 }] });
assert.equal(topTwoFlow.decision.matches.length, 2, 'vencedores diferentes resolvem duas vagas com duas simples');
assert.deepStrictEqual(topTwoFlow.decision.order.slice(0, 2), ['uid:C', 'uid:A']);

const bottom = { fmt2: top.fmt2 };
let bottomFlow = tie.resolvePhaseTies(bottom, 0, pools, next, () => cmp,
  null, 1, false, () => 3, '2026-11-11T10:00:00Z', autoOpts);
assert.equal(bottomFlow.decision.qualifierSlots, 1, 'três últimos disputam uma vaga');
bottomFlow = tie.resolvePhaseTies(bottom, 0, pools, next, () => cmp,
  { type: 'score', decisionId: bottomFlow.tie.decisionId,
    matchId: bottomFlow.decision.matches[0].id, sets: [{ p1: 5, p2: 4 }] },
  1, false, () => 3, '2026-11-11T10:01:00Z', autoOpts);
bottomFlow = tie.resolvePhaseTies(bottom, 0, pools, next, () => cmp,
  { type: 'score', decisionId: bottomFlow.tie.decisionId,
    matchId: bottomFlow.decision.matches[1].id, sets: [{ p1: 5, p2: 4 }] },
  1, false, () => 3, '2026-11-11T10:02:00Z', autoOpts);
assert.equal(bottomFlow.decision.matches.length, 2, 'uma vaga entre três encerra após duas simples');
assert.equal(bottomFlow.status, 'review');
console.log('phase-tie-core: ok');
