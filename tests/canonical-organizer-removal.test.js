'use strict';
const fs = require('fs');
let failed = 0;
function ok(condition, message) { if (condition) console.log('✓ ' + message); else { console.error('✗ ' + message); failed++; } }

const server = fs.readFileSync('functions/index.js', 'utf8');
const begin = server.indexOf('exports.deenrollParticipant = onCall');
const end = server.indexOf('// Sair da lista de espera', begin);
const callable = server.slice(begin, end);
ok(/manualParticipantId/.test(callable) && /\{ manualParticipantId: manualParticipantId \}/.test(callable),
  'desinscrição canônica aceita ID manual, sem converter para nome');
ok(/manualParticipantId && !isOrg/.test(callable),
  'vaga manual só pode ser removida pela organização');
ok(/_registrationMutations\.withdraw/.test(callable) && /_writeCanonicalRosterUpdates/.test(callable),
  'remoção canônica usa a mesma transição atômica que preserva dupla e recibo');

const client = fs.readFileSync('js/views/tournaments.js', 'utf8');
const a = client.indexOf('window.removeParticipantFunction = function');
const b = client.indexOf('window._applySplitParticipantFresh', a);
const ui = client.slice(a, b);
ok(/canonicalRegistrationMigration/.test(ui) && /deenrollParticipant/.test(ui),
  'ação administrativa não chama a remoção legada no torneio canônico');
ok(/manualParticipantId/.test(ui) && !/participantName:\s*String\(participantName/.test(ui.slice(0, ui.indexOf("removeTournamentParticipant"))),
  'ação canônica transmite identidade estrutural, nunca o rótulo');
process.exitCode = failed ? 1 : 0;
