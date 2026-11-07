'use strict';
const assert = require('assert');
const invite = require('../functions/team-role-invite-core');
const cohost = require('../functions/cohost-core');
const referee = require('../functions/vendor/referee-roster');

const secret = invite.newSecret();
assert.match(secret.inviteId, /^[a-f0-9]{36}$/);
assert.match(secret.token, /^[a-f0-9]{64}$/);
assert.strictEqual(invite.matchesHash(secret.tokenHash, secret.token), true);
assert.strictEqual(invite.matchesHash(secret.tokenHash, '0'.repeat(64)), false);
assert.ok(!JSON.stringify({ tokenHash: secret.tokenHash }).includes(secret.token));

const mail = invite.mailDoc({ email: 'someone@example.org', role: 'referee',
  tournamentName: '<Copa>', inviterName: '<Organização>', inviteId: secret.inviteId,
  token: secret.token, now: Date.now() });
assert.deepStrictEqual(mail.to, ['someone@example.org']);
assert.match(mail.message.text, /árbitro/);
assert.match(mail.message.text, /#role-invite\//);
assert.ok(!mail.message.html.includes('<Copa>'));
assert.strictEqual(invite.normalizePhone({ ddi: '55', ddd: '11', number: '99999-8888' }), '+5511999998888');
assert.strictEqual(invite.normalizePhone({ ddi: '55', ddd: '1', number: '99999-8888' }), '');

const tournament = { creatorUid: 'owner-uid', participants: [], coHosts: [
  { uid: 'invited-uid', status: 'pending', name: 'Foto antiga' }
] };
const claimed = cohost.claimEmailCoHost(tournament, 'invited-uid', '2026-11-07T12:00:00.000Z');
assert.strictEqual(claimed.changed, true);
assert.deepStrictEqual(claimed.updateData.adminUids.sort(), ['invited-uid', 'owner-uid']);
assert.strictEqual(claimed.updateData.coHosts.filter((entry) => entry.uid === 'invited-uid').length, 1);
assert.strictEqual(claimed.updateData.coHosts[0].name, undefined);
assert.strictEqual(cohost.claimEmailCoHost({ ...tournament, coHosts: claimed.updateData.coHosts }, 'invited-uid', '2026-11-07T12:01:00.000Z').changed, false);

const refereeResult = referee.claimEmail([{ uid: 'ref-uid', name: 'Pessoa', photoURL: '', status: 'invited' }], {
  action: 'self-confirm', targetUid: 'ref-uid', callerUid: 'owner-uid',
  profile: { displayName: 'Pessoa' }, now: '2026-11-07T12:00:00.000Z'
});
assert.strictEqual(refereeResult.changed, true);
assert.strictEqual(refereeResult.arbitros.length, 1);
assert.strictEqual(refereeResult.arbitros[0].status, 'confirmed');
assert.strictEqual(referee.claimEmail(refereeResult.arbitros, { targetUid: 'ref-uid', callerUid: 'owner-uid', now: '2026-11-07T12:01:00.000Z' }).changed, false);
console.log('✓ convite por e-mail de equipe: segredo, template e ativação idempotente');
