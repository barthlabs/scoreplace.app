/* L7 — convites de co-organização são intenções server-side; o navegador não grava o torneio. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const core = require('../functions/cohost-core');
let ok = 0, bad = 0;
function test(name, fn) { try { fn(); ok++; console.log('  ✓ ' + name); } catch (e) { bad++; console.error('  ✗ ' + name + ': ' + e.message); } }
const UID_A = 'organizador-1234', UID_B = 'participante-5678', UID_C = 'terceiro-9012';
function base() { return { name: 'Torneio', creatorUid: UID_A, organizerName: 'Org', memberUids: [UID_A, UID_B, UID_C], participants: [
  { uid: UID_A, displayName: 'Org' }, { uid: UID_B, displayName: 'Bia' }, { uid: UID_C, displayName: 'Cris' }
], coHosts: [] }; }

test('convite de co-host exige inscrito e não promove até o aceite', () => {
  const t = base(); const r = core.computeMutateHostOrganization(t, UID_A, { action: 'invite', inviteType: 'cohost', targetUid: UID_B });
  assert.equal(r.outcome, 'applied'); assert.equal(r.updateData.coHosts[0].uid, UID_B); assert.equal(r.updateData.coHosts[0].status, 'pending');
  assert.deepEqual(r.updateData.adminUids, [UID_A]);
  assert.equal(r.targetName, 'Bia');
});
test('convite rejeita UID fora do elenco e o próprio organizador', () => {
  assert.equal(core.computeMutateHostOrganization(base(), UID_A, { action: 'invite', inviteType: 'cohost', targetUid: 'forjado-xxxx' }).outcome, 'invalidTarget');
  assert.equal(core.computeMutateHostOrganization(base(), UID_A, { action: 'invite', inviteType: 'transfer', targetUid: UID_A }).outcome, 'invalidTarget');
});
test('cancelamento remove somente o convite pendente escolhido', () => {
  const t = base(); t.coHosts = [{ uid: UID_B, displayName: 'Bia', status: 'pending' }, { uid: UID_C, displayName: 'Cris', status: 'pending' }];
  const r = core.computeMutateHostOrganization(t, UID_A, { action: 'cancel', inviteType: 'cohost', targetUid: UID_B });
  assert.equal(r.outcome, 'applied'); assert.deepEqual(r.updateData.coHosts.map(x => x.uid), [UID_C]);
});
test('remoção exige o criador e conserva os demais co-hosts', () => {
  const t = base(); t.coHosts = [{ uid: UID_B, displayName: 'Bia', status: 'active' }, { uid: UID_C, displayName: 'Cris', status: 'active' }];
  assert.equal(core.computeMutateHostOrganization(t, UID_B, { action: 'remove', inviteType: 'cohost', targetUid: UID_C }).outcome, 'forbidden');
  const r = core.computeMutateHostOrganization(t, UID_A, { action: 'remove', inviteType: 'cohost', targetUid: UID_B });
  assert.equal(r.outcome, 'applied'); assert.deepEqual(r.updateData.coHosts.map(x => x.uid), [UID_C]); assert.deepEqual(r.updateData.adminUids.sort(), [UID_A, UID_C].sort());
});
test('cliente só despacha a CF e Function hidrata e grava a transação', () => {
  const client = fs.readFileSync('js/views/host-transfer.js', 'utf8');
  const server = fs.readFileSync('functions/index.js', 'utf8');
  assert(!/AppStore\.mutate|FirestoreDB\.saveTournament/.test(client));
  assert(client.includes("_callCF('mutateHostOrganization'"));
  assert(server.includes('exports.mutateHostOrganization = onCall'));
  assert(server.includes('await _splitParts.hidratar(tx, ref'));
  assert(server.includes('_splitParts.gravar(tx, ref, before'));
});
console.log('\nL7 co-organização: ' + ok + ' ok, ' + bad + ' falharam'); process.exitCode = bad ? 1 : 0;
