'use strict';
const C = require('../functions/manual-name-unique-core');
const t = {
  participants: [{ uid: 'u1', displayName: 'Ana Souza' }, { p1Name: 'Bruno', p2Name: 'Carla' }],
  standbyParticipants: [{ name: 'DÉBORA  Lima' }],
  placeholderReservations: [{ displayName: 'Jogador 01', isPlaceholder: true }]
};
const checks = [
  ['normaliza acentos/espaços', C.normalizeName('  Débora   LIMA ') === 'debora lima'],
  ['participante', C.duplicateManualName(t, { manualParticipantId: 'm2', name: 'ana  souza' }) === 'ana souza'],
  ['dupla', C.duplicateManualName(t, { manualParticipantId: 'm3', name: ' carla ' }) === 'carla'],
  ['espera', C.duplicateManualName(t, { manualParticipantId: 'm4', name: 'debora lima' }) === 'debora lima'],
  ['placeholder', C.duplicateManualName(t, { manualParticipantId: 'm5', name: 'jogador 01' }) === 'jogador 01'],
  ['novo', C.duplicateManualName(t, { manualParticipantId: 'm6', name: 'Eduardo' }) === null],
  ['UID não bloqueado por rótulo', C.duplicateManualName(t, { uid: 'u9', name: 'Ana Souza' }) === null]
];
checks.forEach(([label, value]) => { if (!value) throw new Error(label); });
console.log(`✅ manual-name-unique-core: ${checks.length} asserts ok`);
