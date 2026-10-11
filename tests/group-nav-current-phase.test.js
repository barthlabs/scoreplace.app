'use strict';
/* node tests/group-nav-current-phase.test.js
 * A navegação de grupos não pode sobreviver na eliminatória só porque o
 * documento histórico ainda carrega o rótulo global de grupos. */
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');
const start = source.indexOf('// Navegação de grupos é da FASE ATUAL');
const end = source.indexOf('const _grpColors', start);
const block = source.slice(start, end);
let failed = 0;
function ok(value, message) {
  if (value) console.log('  ✓ ' + message);
  else { failed++; console.error('  ✗ ' + message); }
}

ok(start >= 0 && end > start, 'bloco da navegação de grupos localizado');
ok(block.includes('window._faseDoTorneio(_grpTour, _grpTour.currentPhaseIndex || 0)'),
  'fase atual é consultada antes do formato global');
ok(block.includes("_grpPhase.kind === 'classification'") && block.includes("structure === 'groups'"),
  'fase canônica só mostra navegação quando é classificatória de grupos');
ok(block.includes("_hasCanonicalGrpPhase ? _grpPhase.kind === 'classification' : _grpTour.currentStage !== 'elimination'"),
  'currentStage legado só é ponte para documento sem fase canônica');

console.log((failed ? '✗' : '✓') + ' group-nav-current-phase: ' + (failed ? 'falhou' : 'passou'));
process.exit(failed ? 1 : 0);
