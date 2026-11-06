const assert = require('node:assert/strict');
const core = require('../functions-autodraw/draw-core.js');
const window = require('./render-harness').window;

function tournament(storageCanonico) {
  return {
    id: 'canonical-monarch-' + storageCanonico,
    name: 'Torneio de teste', format: 'Liga', status: 'open',
    storageCanonico, teamSize: 2, enrollmentMode: 'individual',
    drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha',
    combinedCategories: ['A', 'B'],
    participants: Array.from({ length: 8 }, (_, i) => ({
      name: 'Pessoa ' + i, displayName: 'Pessoa ' + i,
      category: i < 4 ? 'A' : 'B', categories: [i < 4 ? 'A' : 'B']
    })),
    phases: [{
      kind: 'classification', name: 'Rei/Rainha', formatCode: 'liga',
      drawMode: 'rei_rainha', reiRainha: true,
      classification: { structure: 'round_robin', pairing: { entryMode: 'rotate' } },
      source: { type: 'enrollment' }
    }]
  };
}

for (const canonical of [true, false]) {
  const t = tournament(canonical);
  const receipt = core.drawInitial(t, { idStamp: 'test' });
  const games = canonical ? t.matches : t.rounds[0].matches;
  assert.equal(receipt.ok, true);
  assert.equal(receipt.matchCount, 6, 'dois grupos de quatro, três jogos por grupo');
  assert.equal(games.length, 6);
  if (canonical) {
    assert.equal(t.rounds.length, 0, 'jogos canônicos não dependem de rounds');
    assert.ok(games.every(match => match.isMonarch === true));
    const renderMonarch = window._renderMonarchStage;
    let renderedGroups = [];
    window._renderMonarchStage = (faux, ...args) => {
      renderedGroups = faux.groups;
      return renderMonarch(faux, ...args);
    };
    const html = window._renderPhaseBracket(t, false, '');
    window._renderMonarchStage = renderMonarch;
    assert.ok(html.includes('Pessoa 0'), 'a fase mostra os atletas');
    assert.deepEqual(Array.from(renderedGroups, group => String(group.name)),
      ['A · R1 Grupo A', 'B · R1 Grupo A'], 'índices de grupo iguais em categorias distintas não se misturam');

    const legacy = tournament(true);
    legacy.matches = games.map((match, i) => {
      const copy = { ...match };
      delete copy.category;
      copy.monarchGroup = i < 3 ? 0 : 1;
      return copy;
    });
    window._renderMonarchStage = faux => { renderedGroups = faux.groups; return ''; };
    window._renderPhaseBracket(legacy, false, '');
    window._renderMonarchStage = renderMonarch;
    assert.deepEqual(Array.from(renderedGroups, group => String(group.name)),
      ['R1 Grupo A', 'R1 Grupo A'], 'jogos antigos sem categoria continuam separados pelo índice');
  }
}

const oneEntrant = {
  id: 'single-bye', format: 'Eliminatórias', status: 'open', teamSize: 1,
  enrollmentMode: 'individual', participants: [{ name: 'Pessoa única' }],
  phases: [{ kind: 'elimination', name: 'Eliminatória', formatCode: 'knockout', source: { type: 'enrollment' } }]
};
const byeReceipt = core.drawInitial(oneEntrant, { idStamp: 'bye-test' });
assert.equal(byeReceipt.matchCount, 0);
assert.equal(core.hasSoleByeAdvancement(oneEntrant, byeReceipt), true,
  'avanço automático isolado pode materializar a chave sem partida');
assert.equal(core.hasSoleByeAdvancement({ matches: [] }, { matchCount: 0 }), false,
  'sorteio vazio não pode virar sucesso');
assert.equal(core.hasSoleByeAdvancement({ matches: [{ isBye: true }, { isBye: true }] }, { matchCount: 0 }), false,
  'múltiplas folgas sem confrontos não mascaram erro do motor');

const engine = core._window._phasesEngine;
const generatePhase = engine.generatePhase;
try {
  engine.generatePhase = function(...args) {
    const built = generatePhase.apply(this, args);
    if (built && built.appliedToT) {
      delete built.roundMatchCount;
      (args[2].t.matches || []).forEach(match => { delete match.round; });
    }
    return built;
  };
  const fallback = tournament(true);
  const receipt = core.drawInitial(fallback, { idStamp: 'fallback' });
  assert.equal(receipt.ok, true);
  assert.equal(receipt.matchCount, 6, 'contador reserva lê os jogos canônicos se o motor omitir roundMatchCount');
} finally {
  engine.generatePhase = generatePhase;
}

console.log('canonical-monarch-storage: OK');
