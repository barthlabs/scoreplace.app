'use strict';

/* Reserva sem categoria precisa aparecer imediatamente na Análise: a callable
 * devolve {data:{tournament}}, e o espelho local precisa reidratar as vagas antes
 * de qualquer snapshot posterior. */
const fs = require('fs');
const vm = require('vm');
let failed = 0;
function ok(value, message) {
  if (value) console.log('✓ ' + message);
  else { console.error('✗ ' + message); failed++; }
}

const src = fs.readFileSync('js/views/tournaments-draw.js', 'utf8');
const start = src.indexOf('window._applyCFTournament = function');
const end = src.indexOf('window._lateIntegrateInflight', start);
const block = src.slice(start, end);
const W = { AppStore: { tournaments: [{ id: 'tour-1', participants: [] }] } };
vm.runInNewContext(block, { window: W, String: String, Array: Array, Object: Object, console: console });
W._applyCFTournament('tour-1', {
  participants: [],
  placeholderReservations: [{
    name: 'Jogador 01', displayName: 'Jogador 01', manualParticipantId: 'manual-tour-1-01',
    isPlaceholder: true, genericPlaceholderReservation: true
  }]
});
const roster = W.AppStore.tournaments[0].participants;
ok(roster.length === 1, 'resposta da Function reidrata a vaga imediatamente');
ok(roster[0].genericPlaceholderReservation === true && roster[0].manualParticipantId === 'manual-tour-1-01', 'vaga preserva identidade e marcador genérico');

const report = fs.readFileSync('js/views/tournaments-enrollment-report.js', 'utf8');
ok(/genericReservation/.test(report) && /vaga reservada — sem categoria\/gênero/.test(report), 'Análise distingue vaga reservada de participante com perfil incompleto');
if (failed) process.exit(1);
