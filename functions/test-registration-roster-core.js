'use strict';
const R = require('./registration-roster-core');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const roster = R.rosterFromRegistrations([
  { registrationId: 'a', categoryId: 'cat-a', participantKind: 'account', participantUid: 'u1', manualParticipantId: null, status: 'confirmed', fixedPairId: 'pair-1' },
  { registrationId: 'b', categoryId: 'cat-a', participantKind: 'manual', participantUid: null, manualParticipantId: 'm2', manualDisplayName: 'Convidada', status: 'confirmed', fixedPairId: 'pair-1' },
  { registrationId: 'c', categoryId: 'cat-b', participantKind: 'account', participantUid: 'u3', manualParticipantId: null, status: 'confirmed', fixedPairId: null },
  { registrationId: 'd', categoryId: 'cat-b', participantKind: 'account', participantUid: 'u4', manualParticipantId: null, status: 'pending', fixedPairId: null },
]);
const pair = roster.find((entry) => entry.fixedPair);
ok('dupla canônica vira uma entrada estrutural do motor', roster.length === 2 && pair &&
  [pair.p1Uid, pair.p2Uid].includes('u1') && [pair.p1ManualId, pair.p2ManualId].includes('m2'));
ok('nome só permanece para convidada manual', pair &&
  ((pair.p1Name === 'Convidada' && pair.p2Name === undefined) || (pair.p2Name === 'Convidada' && pair.p1Name === undefined)));
ok('pendente não entra no elenco de sorteio', roster.every((entry) => entry.uid !== 'u4'));
bad('recusa dupla incompleta', () => R.rosterFromRegistrations([{ registrationId: 'a', categoryId: 'cat-a', participantKind: 'account', participantUid: 'u1', status: 'confirmed', fixedPairId: 'pair' }]));
bad('recusa convidada sem rótulo do torneio', () => R.rosterFromRegistrations([{ registrationId: 'a', categoryId: 'cat-a', participantKind: 'manual', manualParticipantId: 'm1', status: 'confirmed' }]));

const source = fs.readFileSync(__dirname + '/../js/domain/registration-roster.js');
const vendor = fs.readFileSync(__dirname + '/../functions-autodraw/vendor/registration-roster.js');
const autoDraw = fs.readFileSync(__dirname + '/../functions-autodraw/index.js', 'utf8');
const functionsIndex = fs.readFileSync(__dirname + '/index.js', 'utf8');
const client = fs.readFileSync(__dirname + '/../js/firebase-db.js', 'utf8');
ok('autoDraw recebe a mesma cópia do leitor canônico', source.equals(vendor));
ok('autoDraw troca o elenco somente após marcador de migração', autoDraw.includes('canonicalRegistrationMigration') && autoDraw.includes('rosterFromRegistrations(registrations)'));
ok('autoDraw falha fechado se a contagem materializada divergir', autoDraw.includes('contagem divergente') && !/canonicalRegistrationMigration[\s\S]{0,600}participants\s*=\s*montado\.participants/.test(autoDraw));
ok('leitura canônica fica restrita à organização ou ao próprio elenco', functionsIndex.includes('exports.getCanonicalTournamentRoster = onCall') && functionsIndex.includes('belongsToRoster') && !functionsIndex.includes('tournament.isPublic !== true && !_isTournamentOrgCaller(tournament, callerUid)'));
ok('cliente troca o roster somente pelo recibo canônico validado', client.includes("loadCanonicalTournamentRoster(id)") && client.includes('inscrições canônicas divergentes'));
ok('Function devolve a contagem junto do elenco canônico para o recibo do cliente',
  /return \{ tournamentId, registrationCount: registrations\.length, participants \}/.test(functionsIndex));
console.log((fail ? '❌' : '✅') + ' registration-roster-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
