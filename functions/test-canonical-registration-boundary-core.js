'use strict';
const boundary = require('./canonical-registration-boundary-core');
const core = require('./registration-core');
let pass = 0, fail = 0;
const ok = (name, value) => { if (value) { pass++; console.log('✓ ' + name); } else { fail++; console.error('✗ ' + name); } };
const bad = (name, fn) => { try { fn(); ok(name, false); } catch (_) { ok(name, true); } };
function account(uid) {
  const participantKey = 'uid:' + uid, categoryId = 'cat-a';
  return { registrationId: core.registrationId(participantKey, categoryId), tournamentId: 't1', categoryId, participantKey,
    participantKind: 'account', participantUid: uid, manualParticipantId: null, status: 'confirmed', validationState: 'approved', fixedPairId: null };
}
const tournament = { id: 't1', canonicalRegistrationMigration: { fingerprint: 'fp-1', registrationCount: 1 } };
const valid = boundary.verifiedRoster(tournament, [account('u1')]);
ok('recibo com marcador, contagem e identidade válidos libera roster', valid.participants.length === 1 && valid.migration.fingerprint === 'fp-1');
bad('recusa torneio sem marcador canônico', () => boundary.verifiedRoster({ id: 't1' }, [account('u1')]));
bad('recusa recibo sem contagem íntegra', () => boundary.verifiedRoster({ id: 't1', canonicalRegistrationMigration: { fingerprint: 'fp' } }, [account('u1')]));
bad('recusa contagem divergente', () => boundary.verifiedRoster(tournament, []));
bad('recusa documento com identidade divergente', () => boundary.verifiedRoster(tournament, [Object.assign({}, account('u1'), { participantKey: 'uid:u2' })]));
const changed = boundary.applyUpdates(tournament, [account('u1')], [Object.assign({}, account('u1'), { status: 'withdrawn' })]);
ok('projeção pós-mutação mantém o recibo e remove inscrito retirado do roster', changed.registrations[0].status === 'withdrawn' && changed.participants.length === 0);
bad('recusa atualização de registro fora do recibo', () => boundary.applyUpdates(tournament, [account('u1')], [account('u2')]));
console.log((fail ? '✗' : '✓') + ' canonical-registration-boundary-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
