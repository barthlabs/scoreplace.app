'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { registrationId } = require('../functions/registration-core');
const { canonicalPairId } = require('../functions/registration-mutations-core');
const boundary = require('../functions/canonical-registration-boundary-core');
const { claimManualParticipant } = require('../functions/registration-claim-core');
const core = require('../functions/edit-canonical-slot-core');

const tid = 'tour-test', categoryId = 'fem-light';
function registration(key, name) {
  const manual = key.startsWith('manual:');
  return { tournamentId: tid, participantKey: key, registrationId: registrationId(key, categoryId),
    categoryId, status: 'confirmed', validationState: 'approved', participantKind: manual ? 'manual' : 'account',
    participantUid: manual ? null : key.slice(4), manualParticipantId: manual ? key.slice(7) : null,
    manualDisplayName: manual ? name : undefined };
}
const a = registration('manual:a', 'Nome anterior');
const b = registration('uid:b', 'Parceiro');
const pairId = canonicalPairId(tid, categoryId, [a.registrationId, b.registrationId]);
a.fixedPairId = pairId; b.fixedPairId = pairId;
const side = { p1ManualId: 'a', p1Name: 'Nome anterior', p2Uid: 'b', p2Name: 'Parceiro', fixedPairId: pairId };
const stamp = { toDate() { return new Date(0); } };
const draft = { createdAt: stamp, participants: [side], matches: [1, 2, 3].map((id) => ({
  id, createdAt: stamp, team1Obj: side, team1: 'Nome anterior / Parceiro', team1Uids: ['b'],
  team2Obj: { p1Uid: 'x', fixedPairId: 'other' },
})), competitionPairAssignments: [{ fixedPairId: pairId }] };

const rename = core.plan(tid, [a, b], { manualParticipantId: 'a' }, categoryId, 'Nome anterior', 'Nome corrigido');
assert.equal(rename.changes.creates.length, 0);
assert.equal(rename.changes.updates[0].manualDisplayName, 'Nome corrigido');
assert.equal(rename.newPairId, pairId);
const renamedDraft = core.patchDraft(draft, rename);
assert.equal(renamedDraft.participants[0].p1Name, 'Nome corrigido');
assert.equal(renamedDraft.matches[0].team1, 'Nome corrigido / Parceiro');
assert.equal(renamedDraft.matches[2].team1Obj.p1Name, 'Nome corrigido');
assert.equal(renamedDraft.createdAt, stamp);
assert.equal(renamedDraft.matches[0].createdAt, stamp);
assert.equal(draft.participants[0].p1Name, 'Nome anterior');
assert.throws(() => core.plan(tid, [a, b], { manualParticipantId: 'a' }, categoryId, 'Outro nome', 'Nome corrigido'));
assert.throws(() => core.patchDraft({ participants: [side], matches: [] }, rename));

const replace = core.plan(tid, [a, b], { uid: 'b' }, categoryId, 'Parceiro', 'Novo parceiro', 'replacement');
assert.equal(replace.changes.creates.length, 1);
assert.equal(replace.changes.updates[0].status, 'withdrawn');
assert.equal(replace.changes.updates[0].withdrawnReason, 'organizer_replaced');
assert.equal(replace.changes.creates[0].replacedParticipantUid, 'b');
assert.notEqual(replace.newPairId, pairId);
const committed = boundary.applyChanges({ id: tid, creatorUid: 'organizer', canonicalRegistrationMigration: {
  fingerprint: 'test', registrationCount: 2,
} }, [a, b], replace.changes.updates, replace.changes.creates);
assert.equal(committed.registrations.length, 3);
assert.equal(committed.participants.length, 1);
assert.equal(committed.tournament.canonicalRegistrationMigration.registrationCount, 3);
assert.deepEqual(boundary.memberUids(committed.tournament, committed.registrations), ['organizer']);
const replacedDraft = core.patchDraft(draft, replace);
assert.equal(replacedDraft.participants[0].p2Uid, undefined);
assert.equal(replacedDraft.participants[0].p2ManualId, 'replacement');
assert.equal(replacedDraft.matches[1].team1Uids.length, 0);
assert.equal(replacedDraft.competitionPairAssignments[0].fixedPairId, replace.newPairId);
const mirror = Object.assign({}, side);
assert.equal(core.patchPair(mirror, replace), true);
const deleted = Symbol('Firestore.delete');
const mirrorPatch = core.mirrorWritePatch(mirror, replace, deleted);
const stored = Object.assign({}, side);
Object.keys(mirrorPatch).forEach((field) => {
  if (mirrorPatch[field] === deleted) delete stored[field];
  else stored[field] = mirrorPatch[field];
});
assert.equal(Object.prototype.hasOwnProperty.call(stored, 'p2Uid'), false);
assert.equal(stored.p2ManualId, 'replacement');
assert.equal(core.hasIdentity(['x', 'b'], { uid: 'b' }), true);
assert.equal(core.hasIdentity({ absent: ['b'] }, { uid: 'b' }), true);
assert.equal(core.hasIdentity({ absent: ['another'] }, { uid: 'b' }), false);
const next = [a, replace.changes.updates[0], replace.changes.creates[0]];
assert.throws(() => claimManualParticipant(tid, next, 'replacement', 'b'), /retirada/);
const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const callable = source.slice(source.indexOf('exports.editCanonicalTournamentSlot ='), source.indexOf('/* Uma materialização', source.indexOf('exports.editCanonicalTournamentSlot =')));
assert.match(callable, /if \(!callerUid\) throw new HttpsError\('unauthenticated'/);
assert.match(callable, /_sandboxAutorizado\(db, snap, callerUid/);
assert.match(callable, /_isTournamentOrgCaller\(raw, callerUid\)/);
assert.match(callable, /_manualClaimGuard\(state, true\)/);
assert.match(callable, /_slotPublishedExtras\(state\.tournament\)/);
assert.match(callable, /pendingCanonicalParticipantClaims/);
assert.match(callable, /_writeCanonicalRosterChanges\(tx/);
assert.match(callable, /tx\.update\(matches\[0\]\.ref, _editCanonicalSlot\.mirrorWritePatch\(mirror, edit, _FV\.delete\(\)\)\)/);
assert.match(callable, /tx\.update\(state\.privateDrawRef, \{ draft/);
console.log('✓ edição canônica da vaga: nome manual, troca de UID, três jogos e isolamento do rascunho');
