'use strict';
const assert = require('node:assert/strict');
global.window = global;
require('../js/views/tournaments-categories.js');

const t = { combinedCategories: ['Diamante', 'Ouro'], participants: [
  {displayName:'Com categoria', category:'Diamante'},
  {displayName:'Sem categoria', defaultCategory:'Ouro'},
  {displayName:'Reserva', genericPlaceholderReservation:true},
  'Inscrição antiga'
] };
assert.deepEqual(_uncategorizedDrawParticipants(t).map(p =>
  typeof p === 'string' ? p : p.displayName), ['Sem categoria', 'Inscrição antiga']);
assert.deepEqual(_uncategorizedDrawParticipants({...t, combinedCategories:['Diamante']}), [],
  'categoria única não exige categoria individual');
assert.deepEqual(_uncategorizedDrawParticipants({...t, participants:[t.participants[0], t.participants[2]]}), [],
  'reserva genérica não impede o sorteio');
console.log('✅ Sorteio multicategoria exige categoria gravada em cada inscrição');
