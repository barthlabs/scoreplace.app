'use strict';

const assert = require('node:assert/strict');
const { routeFor, canonicalDocuments } = require('../scripts/auditar-inscricoes-canonicas-core');
const { verifiedRoster } = require('../functions/canonical-registration-boundary-core');
const { registrationId } = require('../functions/registration-core');

function record(uid, categoryId, pairId) {
  const participantKey = 'uid:' + uid;
  return { tournamentId: 't1', registrationId: registrationId(participantKey, categoryId),
    categoryId, participantKey, participantKind: 'account', participantUid: uid,
    status: 'confirmed', fixedPairId: pairId || null };
}

assert.equal(routeFor({}), 'legacy');
assert.equal(routeFor({ canonicalRegistrationMigration: { fingerprint: '' } }), 'legacy');
assert.equal(routeFor({ canonicalRegistrationMigration: { fingerprint: ' ' } }), 'canonical');
assert.equal(routeFor({ canonicalRegistrationMigration: { fingerprint: 'approved' } }), 'canonical');

const first = record('a', 'light', 'pair-1');
const second = record('b', 'light', 'pair-1');
const byId = { [first.registrationId]: first, [second.registrationId]: second };
const items = canonicalDocuments(byId);
assert.equal(items.length, 2, 'mapa físico vira array completo para a fronteira');
const tournament = { id: 't1', canonicalRegistrationMigration: { fingerprint: 'approved', registrationCount: 2 },
  participants: [{ name: 'espelho legado que não representa o elenco atual' }] };
assert.equal(verifiedRoster(tournament, items).participants.length, 1,
  'espelho legado obsoleto não interfere na integridade canônica');
assert.throws(() => canonicalDocuments({ outroId: first }), /ID físico/);
assert.throws(() => verifiedRoster({ ...tournament, canonicalRegistrationMigration: { fingerprint: 'approved', registrationCount: 1 } }, items), /divergentes/);
assert.throws(() => verifiedRoster({ ...tournament, canonicalRegistrationMigration: { fingerprint: ' ', registrationCount: 2 } }, items), /ainda não usa/);
assert.throws(() => verifiedRoster(tournament, [first, { ...second, fixedPairId: 'outro-par' }]), /dupla canônica incompleta ou inválida/);

console.log('✓ censo respeita autoridade canônica, ID físico, contagem e integridade da dupla');
