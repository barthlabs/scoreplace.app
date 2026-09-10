'use strict';
const { renameTournamentParticipant } = require('../functions/participant-rename-core');
let n = 0;
function ok(v, m) { n++; if (!v) throw new Error(m); console.log('✓ ' + m); }
const t = {
  participants: [{ uid: 'u-nei', displayName: 'Nei Almeida' }, { uid: 'u-mon', displayName: 'Monica Rossi' }],
  matches: [{ p1: 'Nei Almeida / Monica Rossi', p2: 'Outra / Pessoa', winner: 'Nei Almeida / Monica Rossi', team1: ['Nei Almeida', 'Monica Rossi'] }],
  rounds: [{ matches: [{ p1: 'Nei Almeida', p2: 'Outra' }], monarchGroups: [{ matches: [{ p1: 'Nei Almeida', p2: 'Outra' }] }] }],
  groups: [{ players: ['Nei Almeida', 'Monica Rossi'], matches: [{ p1: 'Nei Almeida', p2: 'Outra' }] }],
  phaseRounds: { '1': { rounds: [{ matches: [{ p1: 'Nei Almeida', p2: 'Outra' }] }] } },
  checkedIn: { 'Nei Almeida': 1 }, classification: { 'Nei Almeida': { points: 3 } },
  standings: [{ name: 'Nei Almeida', player: 'Nei Almeida' }], sorteioRealizado: ['Nei Almeida / Monica Rossi']
};
const r = renameTournamentParticipant(t, { uid: 'u-nei', oldName: 'Nei Almeida', newName: 'Nei A.' });
ok(r.changed, 'altera um participante identificado por UID');
ok(t.participants[0].displayName === 'Nei A.' && t.matches[0].p1 === 'Nei A. / Monica Rossi', 'preserva e atualiza elenco e dupla do jogo');
ok(t.rounds[0].matches[0].p1 === 'Nei A.' && t.rounds[0].monarchGroups[0].matches[0].p1 === 'Nei A.' && t.phaseRounds['1'].rounds[0].matches[0].p1 === 'Nei A.', 'cobre rodadas históricas, grupos monarca e a fase posterior');
ok(t.groups[0].players[0] === 'Nei A.' && t.checkedIn['Nei A.'] === 1 && t.classification['Nei A.'].points === 3, 'preserva grupos e mapas indexados por nome');
ok(r.update.rounds && r.update.phaseRounds && r.update.groups && r.update.participants, 'devolve todas as raízes modificadas para a gravação dividida');
let ambiguous = false; try { renameTournamentParticipant({ participants: ['Ana', { name: 'Ana' }] }, { oldName: 'Ana', newName: 'Ana B' }); } catch (e) { ambiguous = /ambíguo/.test(e.message); }
ok(ambiguous, 'recusa nome sem UID quando há mais de uma pessoa com o mesmo nome');
console.log('OK ' + n + ' assertions');
const fs = require('fs');
const client = fs.readFileSync(require('path').join(__dirname, '../js/views/participants.js'), 'utf8');
const server = fs.readFileSync(require('path').join(__dirname, '../functions/index.js'), 'utf8');
const editStart = client.indexOf('window._editParticipantName = function');
const editEnd = client.indexOf('window._startTournament = function', editStart);
const editBody = client.slice(editStart, editEnd);
ok(/_callCF\('renameTournamentParticipant'/.test(editBody) && !/FirestoreDB\.saveTournament|AppStore\.mutate/.test(editBody), 'o cliente só despacha a intenção; não grava o torneio');
ok(/exports\.renameTournamentParticipant = onCall/.test(server) && /_splitParts\.hidratar\(tx, ref, snap\.data\(\) \|\| \{\}\)/.test(server) && /_isTournamentOrgCaller\(t, callerUid\)/.test(server), 'a CF relê as partes divididas e autoriza pelo organizador fresco');
