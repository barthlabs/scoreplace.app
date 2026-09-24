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

/* ⛔ Entrada de lista auxiliar como OBJETO muda por dentro: detectar por referência
 * deixava a espera e as reservas FORA do pacote de gravação — nome velho no banco. */
const tAux = {
  participants: [{ uid: 'u-dai', displayName: 'Dai Lima' }],
  waitlist: [{ uid: 'u-dai', displayName: 'Dai Lima' }],
  standbyParticipants: [{ uid: 'u-dai', name: 'Dai Lima' }],
  sorteioRealizado: [{ p1Name: 'Dai Lima', p2Name: 'Outra' }]
};
const rAux = renameTournamentParticipant(tAux, { uid: 'u-dai', oldName: 'Dai Lima', newName: 'Dai L.' });
ok(rAux.update.waitlist && rAux.update.standbyParticipants && rAux.update.sorteioRealizado,
  'listas auxiliares com entrada-OBJETO entram no pacote de gravação');
ok(tAux.waitlist[0].displayName === 'Dai L.' && tAux.standbyParticipants[0].name === 'Dai L.' &&
   tAux.sorteioRealizado[0].p1Name === 'Dai L.',
  'e o nome foi de fato trocado nas três');

/* ⛔⛔ HOMÔNIMO NÃO PODE SER RENOMEADO JUNTO (24/set/2026).
 * A substituição é GLOBAL por rótulo. O uid só achava o alvo; depois disso, os dois
 * "Ana" eram trocados. A recusa tem de vir ANTES de tocar em qualquer estrutura —
 * por isso a comparação é do objeto INTEIRO, antes e depois. */
function _congela(x) { return JSON.stringify(x); }
const tHomonimo = {
  participants: [{ uid: 'u-a1', displayName: 'Ana' }, { uid: 'u-a2', displayName: 'Ana' }],
  matches: [{ p1: 'Ana', p2: 'Bia', winner: 'Ana', team1: ['Ana'], team2: ['Bia'] }],
  groups: [{ players: ['Ana', 'Bia'], matches: [{ p1: 'Ana', p2: 'Bia' }] }],
  checkedIn: { Ana: 1 }, classification: { Ana: { points: 3 } }
};
const antesHomonimo = _congela(tHomonimo);
let recusouHomonimo = false;
try { renameTournamentParticipant(tHomonimo, { uid: 'u-a1', oldName: 'Ana', newName: 'Ana Souza' }); }
catch (e) { recusouHomonimo = /mais de um inscrito/.test(e.message); }
ok(recusouHomonimo, 'recusa renomear quando outro inscrito carrega o MESMO nome, mesmo com UID');
ok(_congela(tHomonimo) === antesHomonimo, 'a recusa do homônimo não tocou elenco, jogos, grupos nem mapas');

/* ⛔ O homônimo pode estar FORA do elenco: a substituição global também varre espera,
 * reservas e sorteio realizado. Conferir só o elenco deixava a trava passar. */
['waitlist', 'standbyParticipants', 'sorteioRealizado'].forEach((lista) => {
  const tFora = {
    participants: [{ uid: 'u-c1', displayName: 'Cris' }],
    matches: [{ p1: 'Cris', p2: 'Dani', winner: 'Cris', team1: ['Cris'], team2: ['Dani'] }]
  };
  tFora[lista] = [{ uid: 'u-c2', displayName: 'Cris' }];
  const antes = _congela(tFora);
  let recusou = false;
  try { renameTournamentParticipant(tFora, { uid: 'u-c1', oldName: 'Cris', newName: 'Cris B.' }); }
  catch (e) { recusou = /mais de um inscrito/.test(e.message); }
  ok(recusou, 'recusa quando o homônimo está em ' + lista + ', não no elenco');
  ok(_congela(tFora) === antes, 'e a recusa em ' + lista + ' não tocou em nada');
});

/* O nome NOVO também não pode ser de outra pessoa: a troca global fundiria os rótulos. */
const tColisao = {
  participants: [{ uid: 'u-b1', displayName: 'Bia' }, { uid: 'u-b2', displayName: 'Carla' }],
  matches: [{ p1: 'Bia', p2: 'Carla', winner: 'Bia', team1: ['Bia'], team2: ['Carla'] }],
  checkedIn: { Bia: 1, Carla: 1 }
};
const antesColisao = _congela(tColisao);
let recusouColisao = false;
try { renameTournamentParticipant(tColisao, { uid: 'u-b1', oldName: 'Bia', newName: 'Carla' }); }
catch (e) { recusouColisao = /outro inscrito com esse nome/.test(e.message); }
ok(recusouColisao, 'recusa quando o nome NOVO já é de outra pessoa do torneio');
ok(_congela(tColisao) === antesColisao, 'a recusa da colisão não tocou nada');

console.log('OK ' + n + ' assertions');
const fs = require('fs');
const client = fs.readFileSync(require('path').join(__dirname, '../js/views/participants.js'), 'utf8');
const server = fs.readFileSync(require('path').join(__dirname, '../functions/index.js'), 'utf8');
const editStart = client.indexOf('window._editParticipantName = function');
const editEnd = client.indexOf('window._startTournament = function', editStart);
const editBody = client.slice(editStart, editEnd);
ok(/_callCF\('renameTournamentParticipant'/.test(editBody) && !/FirestoreDB\.saveTournament|AppStore\.mutate/.test(editBody), 'o cliente só despacha a intenção; não grava o torneio');
ok(/exports\.renameTournamentParticipant = onCall/.test(server) && /_splitParts\.hidratar\(tx, ref, snap\.data\(\) \|\| \{\}\)/.test(server) && /_isTournamentOrgCaller\(t, callerUid\)/.test(server), 'a CF relê as partes divididas e autoriza pelo organizador fresco');
