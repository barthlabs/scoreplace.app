// O writer de avanço legado foi removido por ausência de chamadores.
// A concorrência da porta canônica continua coberta pelos testes de advanceMultiPhase.
'use strict';
const assert=require('assert/strict'),fs=require('fs');
const src=fs.readFileSync('js/views/bracket-ui.js','utf8');
assert(!src.includes('window._advanceToElimination ='));
assert(!src.includes('store.mutate('));
const phase=fs.readFileSync('js/views/phases-engine.js','utf8');
assert(phase.includes('advanceMultiPhase'));
console.log('✓ avanço legado sem chamador não conserva writer no navegador');
