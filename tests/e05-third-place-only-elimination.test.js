'use strict';
const assert = require('node:assert/strict');
const client = require('./headless').window;
const server = require('../functions-autodraw/draw-core.js')._window;

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
  }

  const unknown = bracket('Formato desconhecido');
  W._maybeGenerate3rdPlace(unknown);
  assert.equal(unknown.thirdPlaceMatch, undefined, `${name}: não inventa terceiro lugar sem eliminatória`);

  const scored = bracket('Fase de Grupos');
  scored.thirdPlaceMatch = { id: 'historical', p1: 'B', p2: 'D', winner: 'B', score1: 6, score2: 4 };
  W._maybeGenerate3rdPlace(scored);
  assert.equal(scored.thirdPlaceMatch.id, 'historical', `${name}: preserva placar histórico`);

  const elimination = bracket('Eliminatórias Simples');
  assert.equal(W._isEliminationPhase(elimination), true, `${name}: eliminatória simples segue válida`);
  W._maybeGenerate3rdPlace(elimination);
  assert.ok(elimination.thirdPlaceMatch, `${name}: eliminatória simples gera terceiro lugar`);

  const doubleElimination = bracket('Dupla Eliminatória');
  doubleElimination.thirdPlaceMatch = { id: 'phantom' };
  W._maybeGenerate3rdPlace(doubleElimination);
  assert.equal(doubleElimination.thirdPlaceMatch, undefined, `${name}: dupla eliminatória não tem disputa separada`);
}
console.log('E05: terceiro lugar só em eliminatória simples — web e Function OK');
