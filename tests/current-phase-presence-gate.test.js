'use strict';
/* node tests/current-phase-presence-gate.test.js
 * A chamada de presença pertence à fase que receberá o sorteio. Um torneio de
 * pontos corridos que já chegou à eliminatória não pode continuar pulando esse
 * passo só porque o formato histórico no topo ainda é Liga. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0;
function ok(value, message) { if (value) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }

const ligaComFases = {
  format: 'Liga', currentPhaseIndex: 0,
  phases: [{ kind: 'classification', classification: { structure: 'round_robin' } }, { kind: 'elimination' }]
};
ok(W._faseCorrenteDispensaPresencaNoSorteio(ligaComFases) === true,
  'a classificatória atual dispensa chamada de presença');
ligaComFases.currentPhaseIndex = 1;
ok(W._faseCorrenteDispensaPresencaNoSorteio(ligaComFases) === false,
  'a eliminatória posterior não herda a dispensa do rótulo Liga');
ok(W._faseCorrenteDispensaPresencaNoSorteio({ format: 'Liga' }) === true,
  'documento legado sem phases preserva o comportamento de Liga');
ok(W._faseCorrenteDispensaPresencaNoSorteio({ format: 'Liga', phases: [] }) === false,
  'lista de fases explícita e vazia não inventa uma fase classificatória');

const view = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
const presenceStart = view.indexOf('window._showPresenceDrawChoice = function');
const presence = view.slice(presenceStart, view.indexOf('var _inscricoesAbertas', presenceStart));
ok(presence.includes('_faseCorrenteDispensaPresencaNoSorteio(t)'),
  'o diálogo de presença consulta a fase atual');
const gate = view.slice(view.indexOf('var _inscricoesAbertas'), view.indexOf('// Competição por times', view.indexOf('var _inscricoesAbertas')));
ok(gate.includes('_faseCorrenteDispensaPresencaNoSorteio(_tSort)'),
  'a revisão de competição por times usa a mesma decisão de fase');
ok(!presence.includes('window._isLigaFormat(t)'),
  'o diálogo não decide pela etiqueta histórica do torneio');

console.log((fail ? '✗' : '✓') + ' current-phase-presence-gate: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
