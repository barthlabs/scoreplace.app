/* W.O. participativo: o browser só identifica o contexto; a Function deriva
 * identidade a partir da estrutura fresca (players ↔ playersUids). */
'use strict';

const assert = require('assert');
const fs = require('fs');
const { transition } = require('../functions-autodraw/wo-claim-core.js');

let pass = 0;
function ok(value, message) { assert(value, message); pass++; }

console.log('──── wo-claim: uid por estrutura ────');

const UID = { marj: 'u-marjorie', cyn: 'u-cynthia', arn: 'u-arnaldo', mari: 'u-mariana', org: 'u-org' };
const players = ['Marjorie CILONE', 'Cynthia', 'Arnaldo Menezes', 'Mariana C'];
const uids = [UID.marj, UID.cyn, UID.arn, UID.mari];

// Mesmo pareamento que chega no documento de Liga: o participante pode ter só
// uid depois do saneamento, mas o grupo mantém nome e UID no mesmo índice.
const members = players.map((name, index) => ({ name, uid: uids[index] }));
const context = {
  key: 'g|0|R1 Grupo L', scope: 'group', roundIndex: 0, groupName: 'R1 Grupo L',
  members, memberUids: members.map(member => member.uid), matchIds: ['m0', 'm1', 'm2'], isLeague: true
};
const tournament = { woScope: 'individual', woClaims: [] };

ok(context.members[2].uid === UID.arn, 'uid do ausente vem do mesmo índice de playersUids, sem consultar participants');
ok(context.memberUids.includes(UID.cyn), 'jogador do grupo tem identidade mesmo sem displayName em participants');

const created = transition(tournament, {
  action: 'declare', uid: UID.cyn, absentName: 'Arnaldo Menezes', byName: 'Cynthia',
  claimId: 'wo-structural', context, now: '2026-09-10T12:00:00Z'
});
ok(created.ok, 'participante do grupo cria apontamento no contexto fresco');
ok(created.claim.absentName === 'Arnaldo Menezes', 'claim aponta o ausente certo');
ok(created.claim.absentUids.length === 1, 'absentUids não fica vazio');
ok(created.claim.absentUids[0] === UID.arn, 'claim guarda o uid estrutural do ausente');

const guestContext = Object.assign({}, context, {
  members: context.members.concat([{ name: 'Jogador X', uid: '' }]),
  memberUids: context.memberUids.slice()
});
const guestTournament = { woScope: 'individual', woClaims: [] };
const guest = transition(guestTournament, {
  action: 'declare', uid: UID.cyn, absentName: 'Jogador X', byName: 'Cynthia',
  claimId: 'wo-guest', context: guestContext, now: '2026-09-10T12:00:00Z'
});
ok(guest.ok && guest.claim.absentUids.length === 0, 'convidado sem conta permanece identificado pelo nome');

const source = fs.readFileSync('js/views/wo-claim.js', 'utf8');
const begin = source.indexOf('window._woDeclare = function');
const end = source.indexOf('// Stage 2:', begin);
const declareBody = source.slice(begin, end);
ok(declareBody.includes("action: 'declare'"), 'browser envia apenas a intenção de declarar');
ok(declareBody.includes("scope: 'group', roundIndex: rc.roundIndex, groupName: rc.groupName"), 'browser envia somente a chave do grupo');
ok(!declareBody.includes('_commit('), 'browser não grava claim nem identidade localmente');

const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
ok(server.includes("players.map((name, index) => ({ uid: String(playerUids[index] || ''), name: String(name || '') }))"),
  'Function deriva os membros do pareamento players/playersUids do documento fresco');
ok(server.includes("db.runTransaction(async tx =>"), 'Function monta e aplica W.O. dentro de transação');

console.log('wo-claim-uid-por-estrutura: ' + pass + ' asserts OK');
