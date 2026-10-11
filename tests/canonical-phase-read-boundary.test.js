'use strict';

/* A projeção de legado precisa ocorrer em leitura, antes de qualquer tela decidir
 * por `format`/`classifyFormat`. Este teste carrega o mesmo núcleo puro usado pelo
 * navegador e comprova que a operação não altera jogos ou placares. */
const assert = require('assert');
global.window = { _warn: function () {} };
require('../js/views/format2.js');
require('../js/views/persist-core.js');

let pass = 0;
function ok(value, message) {
  assert.ok(value, message);
  pass++;
  console.log('  ✓ ' + message);
}

const legacy = {
  format: 'Suíço Clássico',
  classifyFormat: 'swiss',
  currentStage: 'swiss',
  rounds: [{ matches: [{ id: 'm1', scoreP1: 6, scoreP2: 4 }] }]
};
const originalRounds = JSON.stringify(legacy.rounds);
const returned = window._projectTournamentPhasesForRead(legacy);
ok(returned === legacy, 'a projeção preserva a referência recebida pelo ouvinte');
ok(legacy.phases && legacy.phases[0].kind === 'classification', 'Suíço legado chega à tela como fase classificatória');
ok(legacy.phases[0].classification && legacy.phases[0].classification.pairing.strategy === 'ranking_clusters', 'pareamento vira configuração classificatória canônica');
ok(JSON.stringify(legacy.rounds) === originalRounds, 'projeção de leitura não altera rodada nem placar');

const canonical = { phases: [{ kind: 'elimination', elimination: { bracketType: 'single' }, formatCode: 'elim_simples' }] };
const samePhases = canonical.phases;
window._projectTournamentPhasesForRead(canonical);
ok(canonical.phases === samePhases, 'torneio já canônico não é refeito em memória');
console.log('✓ canonical-phase-read-boundary: ' + pass + ' passaram');
