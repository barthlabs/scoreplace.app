'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/domain/court-occupancy.js');
const base = { id:'one', court:'Quadra 4' };
assert.equal(core.occupiesCourt(base), false, 'sugestão futura não ocupa');
for (const signal of [
  { courtCalledAt:'2026-10-20T18:00:00Z' }, { startedAt:'2026-10-20T18:01:00Z' },
  { liveScored:true }, { sets:[{ gamesP1:1, gamesP2:0 }] }, { scoreP1:1 }, { scoreP2:1 }
]) assert.equal(core.occupiesCourt({ ...base, ...signal }), true, JSON.stringify(signal));
for (const finish of [{ resultAt:'2026-10-20T18:35:00Z' }, { winner:'p1' }, { wo:true }])
  assert.equal(core.occupiesCourt({ ...base, courtCalledAt:'2026-10-20T18:00:00Z', ...finish }), false);
const all = [
  { ...base, courtCalledAt:'2026-10-20T18:00:00Z', scheduledAt:'2026-10-22T18:00:00Z' },
  { id:'two', court:'Quadra 5', scheduledAt:'2026-10-20T18:00:00Z' }
];
assert.equal(core.occupant(all, 'Quadra 4', 'other').id, 'one', 'horários diferentes não liberam quadra ativa');
assert.equal(core.occupant(all, 'Quadra 4', 'one'), null, 'o próprio jogo pode conservar sua quadra');
assert.equal(core.occupant(all, 'Quadra 5', 'one'), null, 'sugestão sem chamada não ocupa');
const released = { one:'2026-10-20T18:10:00Z' };
const tieTournament = { phaseTieDecisions:{ '0':{ tie:{ matches:[{
  id:'tie-1', court:'Quadra 3', courtCalledAt:'2026-10-20T18:00:00Z',
  p1:{name:'Ana'}, p2:{name:'Bia'}
}] } } } };
const occupied = core.activeMatches(all, released, tieTournament);
assert.deepEqual(core.freeCourts(['Quadra 3', 'Quadra 4', 'Quadra 5'], occupied),
  ['Quadra 4', 'Quadra 5'], 'liberação e desempate usam a mesma ocupação do card e do resumo');
assert.equal(occupied.find(m => m.id === 'tie-1').p1, 'Ana', 'atleta da simples permanece identificável');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
assert.match(serviceWorker, /'\/js\/domain\/court-occupancy\.js'/,
  'a regra de ocupação fica disponível no cache offline da chave');
console.log('✓ ocupação operacional compartilhada');
