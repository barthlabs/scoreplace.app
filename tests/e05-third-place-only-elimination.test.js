'use strict';
const assert = require('node:assert/strict');
const client = require('./headless').window;
const drawCore = require('../functions-autodraw/draw-core.js');
const server = drawCore._window;

function bracket(format, phases) {
  return {
    format, phases, currentPhaseIndex: 0,
    matches: [
      { id: 'semi1', round: 1, p1: 'A', p2: 'B', winner: 'A' },
      { id: 'semi2', round: 1, p1: 'C', p2: 'D', winner: 'C' },
      { id: 'final', round: 2, p1: 'A', p2: 'C', winner: null }
    ]
  };
}

for (const [name, W] of [['web', client], ['Function', server]]) {
  for (const phases of [undefined, [{ kind: 'classification', classification: { structure: 'groups' } }]]) {
    const group = bracket('Fase de Grupos', phases);
    assert.equal(W._isEliminationPhase(group), false, `${name}: grupos não são eliminatória`);
    group.thirdPlaceMatch = { id: 'ghost', p1: 'B', p2: 'D', winner: null };
    W._maybeGenerate3rdPlace(group);
    assert.equal(group.thirdPlaceMatch, undefined, `${name}: remove placeholder de grupos`);
    W._maybeGenerate3rdPlace(group);
    assert.equal(group.thirdPlaceMatch, undefined, `${name}: não recria terceiro lugar em grupos`);
    const before = JSON.stringify(group);
    assert.equal(W._ensureFutureRounds(group, false, { now: 123456 }), false,
      `${name}: reparo de rodadas ignora classificatória`);
    assert.equal(JSON.stringify(group), before,
      `${name}: reparo não inventa jogos nem altera a classificatória`);
  }

  const groupWithEliminationPhase = bracket('Fase de Grupos', [
    { kind: 'elimination', elimination: { bracketType: 'single' } }
  ]);
  assert.equal(W._isEliminationPhase(groupWithEliminationPhase), true,
    `${name}: fase eliminatória explícita prevalece sobre rótulo legado de grupos`);
  W._maybeGenerate3rdPlace(groupWithEliminationPhase);
  assert.ok(groupWithEliminationPhase.thirdPlaceMatch,
    `${name}: fase eliminatória explícita gera terceiro lugar`);

  const twoSemis = bracket('Fase de Grupos', [
    { kind: 'classification', classification: { structure: 'groups' } },
    { kind: 'elimination', elimination: { bracketType: 'single' } }
  ]);
  twoSemis.currentPhaseIndex = 0;
  assert.equal(W._ensureFutureRounds(twoSemis, false, { now: 123456 }), false,
    `${name}: fase classificatória de torneio com eliminatória futura não gera terceiro`);
  twoSemis.currentPhaseIndex = 1;
  W._maybeGenerate3rdPlace(twoSemis);
  assert.ok(twoSemis.thirdPlaceMatch,
    `${name}: terceiro lugar nasce quando a eliminatória chega às semifinais`);

  const unknown = bracket('Formato desconhecido');
  W._maybeGenerate3rdPlace(unknown);
  assert.equal(unknown.thirdPlaceMatch, undefined, `${name}: não inventa terceiro lugar sem eliminatória`);

  for (const format of ['Liga', 'Ranking']) {
    const legacy = bracket(format);
    legacy.thirdPlaceMatch = { id: 'ghost', p1: 'B', p2: 'D', winner: null };
    W._maybeGenerate3rdPlace(legacy);
    assert.equal(legacy.thirdPlaceMatch, undefined, `${name}: ${format} não mantém terceiro lugar vazio`);
  }

  const scored = bracket('Fase de Grupos');
  scored.thirdPlaceMatch = { id: 'historical', p1: 'B', p2: 'D', winner: 'B', score1: 6, score2: 4 };
  W._maybeGenerate3rdPlace(scored);
  assert.equal(scored.thirdPlaceMatch.id, 'historical', `${name}: preserva placar histórico`);

  const elimination = bracket('Eliminatórias Simples');
  assert.equal(W._isEliminationPhase(elimination), true, `${name}: eliminatória simples segue válida`);
  W._maybeGenerate3rdPlace(elimination);
  assert.ok(elimination.thirdPlaceMatch, `${name}: eliminatória simples gera terceiro lugar`);

  const onlyFinal = { format: 'Eliminatórias Simples', phases: [{ kind: 'elimination' }],
    currentPhaseIndex: 0, matches: [{ id: 'final-only', round: 1, p1: 'A', p2: 'B', winner: null }] };
  W._maybeGenerate3rdPlace(onlyFinal);
  assert.equal(onlyFinal.thirdPlaceMatch, undefined,
    `${name}: final sem semifinais não gera disputa de 3º/4º`);

  const doubleElimination = bracket('Dupla Eliminatória');
  doubleElimination.thirdPlaceMatch = { id: 'phantom' };
  W._maybeGenerate3rdPlace(doubleElimination);
  assert.equal(doubleElimination.thirdPlaceMatch, undefined, `${name}: dupla eliminatória não tem disputa separada`);
}

// Percurso real: configuração → compilação no servidor → sorteio da classificatória
// → reconciliador. Um torneio que termina pela tabela não cria jogo de colocação.
const tableOnly = {
  id: 'third-place-table-only', sport: 'Beach Tennis', teamSize: 2,
  fmt2: { disputa: 'dupla', parceria: 'fixa', grupos: 1, classifAtiva: true,
    rodadas: { modo: 'todos', turnos: 'ida' }, eliminatoria: { ativa: false } },
  participants: Array.from({ length: 8 }, (_, i) => ({
    p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i,
    displayName: 'A' + i + ' / B' + i
  })),
  matches: [], rounds: [], groups: [], checkedIn: {}, absent: {}
};
assert.ok(drawCore.compileFromFmt2(tableOnly).ok);
assert.equal(tableOnly.phases.length, 1);
assert.equal(tableOnly.phases[0].kind, 'classification');
assert.ok(drawCore.drawInitial(tableOnly, {}).ok);
const tableMatches = server._collectAllMatches(tableOnly);
assert.ok(tableMatches.length > 0, 'classificatória real contém jogos');
assert.ok(tableMatches.every(m => !m.isThirdPlace), 'sorteio não cria disputa de 3º/4º');
const tableBefore = JSON.stringify(tableOnly);
assert.equal(server._ensureFutureRounds(tableOnly, false, { now: 123456 }), false);
assert.equal(JSON.stringify(tableOnly), tableBefore, 'reconciliador não altera classificatória real');
console.log('E05: terceiro lugar só em eliminatória simples — web e Function OK');
