/* L7.P1.16 — rodadas futuras são reparadas só pelo motor da Function.
 * O teste prova que o motor recebe a cópia fresca, preserva placar recém-lançado e que
 * bracket.js não conserva mais o escritor de render. */
'use strict';
const fs = require('fs');
const { _window: W } = require('../functions-autodraw/draw-core.js');
const fresh = { id: 'T1', format: 'Eliminatória', matches: [
  { id: 'R1-A', round: 1, p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 3 },
  { id: 'R1-B', round: 1, p1: 'C', p2: 'D', winner: null }
] };
const changed = W._ensureFutureRounds(fresh, false, { now: 123456, thirdPlaceLabel: '3º lugar' });
let fail = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { fail++; console.error('✗ ' + label); } }
ok(changed === true, 'o motor da Function detecta e repara coluna futura ausente');
ok(fresh.matches.some((m) => m.round === 2), 'a rodada futura é criada no documento fresco');
const scored = fresh.matches.find((m) => m.id === 'R1-A');
ok(scored.winner === 'A' && scored.scoreP1 === 6 && scored.scoreP2 === 3,
  'placar que chegou depois da cópia antiga permanece intacto');
const src = fs.readFileSync('js/views/bracket.js', 'utf8');
ok(src.indexOf('function _ensureFutureRounds') === -1 && src.indexOf('function _repairFutureRoundsSafely') === -1,
  'a view não conserva motor nem writer de reparação');
ok(src.indexOf('AppStore.mutate(t.id') === -1,
  'a abertura da chave não persiste rodadas futuras pelo cliente');
console.log('reparo-chave-nao-sobrescreve-placar: ' + (5 - fail) + ' passou, ' + fail + ' falhou');
process.exit(fail ? 1 : 0);
