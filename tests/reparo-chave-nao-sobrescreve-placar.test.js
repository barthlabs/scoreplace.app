/* L7.P1.7 — a auto-reparação de rodadas roda ao renderizar, mas só pode persistir
 * sua mudança estreita sobre o documento fresco. Uma aba antiga não pode apagar o
 * resultado que outra acabou de lançar ao completar colunas ausentes da chave. */
'use strict';
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync('js/views/bracket.js', 'utf8');
const begin = src.indexOf('function _ensureFutureRounds');
const end = src.indexOf('// ─── Hidden rounds state', begin);
if (begin < 0 || end < 0) throw new Error('não encontrei o reparador de rodadas futuras');
const local = { id: 'T1', format: 'Eliminatória', matches: [
  { id: 'R1-A', round: 1, p1: 'A', p2: 'B', winner: null },
  { id: 'R1-B', round: 1, p1: 'C', p2: 'D', winner: null }
] };
const fresh = { id: 'T1', format: 'Eliminatória', matches: [
  { id: 'R1-A', round: 1, p1: 'A', p2: 'B', winner: 'A', scoreP1: 6, scoreP2: 3 },
  { id: 'R1-B', round: 1, p1: 'C', p2: 'D', winner: null }
] };
let mutations = 0;
const sandbox = {
  window: null,
  _t: () => '3º lugar',
  _matchWinnerSide: (m) => m.winner === m.p1 ? 1 : 2,
  _appendCanonicalColumn(t, desc) {
    if (desc.phase === 'thirdplace') t.thirdPlaceMatch = desc.matches[0];
    else t.matches.push.apply(t.matches, desc.matches);
  },
  AppStore: {
    mutate(id, fn) { mutations++; fn(local); return fn(fresh); }
  }
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src.slice(begin, end), sandbox, { filename: 'bracket.js:future-rounds-repair' });
sandbox._repairFutureRoundsSafely(local);
let fail = 0;
function ok(value, label) { if (value) console.log('✓ ' + label); else { fail++; console.error('✗ ' + label); } }
ok(mutations === 1, 'abre uma mutação fresca somente quando a chave precisa de reparo');
ok(fresh.matches.some((m) => m.round === 2), 'a rodada futura ausente é criada no documento fresco');
const scored = fresh.matches.find((m) => m.id === 'R1-A');
ok(scored.winner === 'A' && scored.scoreP1 === 6 && scored.scoreP2 === 3,
  'placar que chegou depois da cópia local permanece intacto');
ok(!/syncImmediate\(|AppStore\.sync\(/.test(src.slice(begin, end)),
  'o reparador não grava snapshot inteiro');
console.log('reparo-chave-nao-sobrescreve-placar: ' + (4 - fail) + ' passou, ' + fail + ' falhou');
process.exit(fail ? 1 : 0);
