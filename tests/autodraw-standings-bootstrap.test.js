'use strict';
const assert = require('node:assert/strict');

// A Function importa standings-core antes do shim do navegador. A ordem dos
// requires deve reproduzir a inicialização real, inclusive o cache CommonJS.
require('../functions-autodraw/index.js');
const window = require('../functions-autodraw/draw-core.js')._window;
for (const name of ['_standingsCompare', '_standingsCompareConfig',
  '_standingsBuildH2H', '_standingsOrdemChave', '_standingsExplain', '_standingsTbPoints']) {
  assert.equal(typeof window[name], 'function', name + ' indisponível na Function');
}
const rows = window._computeMonarchStandings({ players: ['Ana', 'Bia', 'Cris', 'Dani'], matches: [] });
assert.equal(rows.length, 4);
console.log('✓ Function: comparadores Rei/Rainha disponíveis após a carga real do servidor');
