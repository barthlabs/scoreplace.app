'use strict';

const C = require('./registration-core');
const M = require('./registration-mutations-core');
const Claim = require('./registration-claim-core');
const Boundary = require('./canonical-registration-boundary-core');

let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('✓ ' + message); } else { fail++; console.error('✗ ' + message); } }
function bad(message, fn) { try { fn(); ok(false, message); } catch (_) { ok(true, message); } }
function registration(key, categoryId, status) {
  const isManual = key.indexOf('manual:') === 0;
  return {
    registrationId: C.registrationId(key, categoryId), tournamentId: 't1', categoryId,
    participantKey: key, participantKind: isManual ? 'manual' : 'account',
    participantUid: isManual ? null : key.slice(4), manualParticipantId: isManual ? key.slice(7) : null,
    manualDisplayName: isManual ? 'Convidada' : undefined,
    status: status || 'confirmed', validationState: 'approved', fixedPairId: null,
  };
}

const manual = registration('manual:m1', 'cat-a');
const paired = registration('uid:u2', 'cat-a');
const pairId = M.canonicalPairId('t1', 'cat-a', [manual.registrationId, paired.registrationId]);
manual.fixedPairId = pairId; paired.fixedPairId = pairId;
const claimed = Claim.claimManualParticipant('t1', [manual, paired], 'm1', 'u1');
const retired = claimed.updates.find((item) => item.registrationId === manual.registrationId);
const partner = claimed.updates.find((item) => item.registrationId === paired.registrationId);
const replacement = claimed.creates[0];
ok(retired && retired.status === 'withdrawn' && retired.withdrawnReason === 'claimed_by_account', 'retira a vaga manual sem apagá-la');
ok(replacement && replacement.participantKind === 'account' && replacement.participantUid === 'u1' && !replacement.manualDisplayName, 'cria a inscrição da conta sem copiar nome manual');
ok(partner && partner.fixedPairId && partner.fixedPairId === replacement.fixedPairId, 'recarimba a dupla com a nova identidade estrutural');
ok(partner.fixedPairId !== pairId, 'a dupla antiga não sobrevive com IDs diferentes');
const canonicalTournament = { id: 't1', canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 2 } };
const atomic = Boundary.applyChanges(canonicalTournament, [manual, paired], claimed.updates, claimed.creates);
ok(atomic.participants.length === 1 && atomic.tournament.canonicalRegistrationMigration.registrationCount === 3,
  'a troca de identidade preserva a dupla na fotografia canônica final, sem estado intermediário inválido');

const withdrawnAccount = Object.assign({}, registration('uid:u1', 'cat-a', 'withdrawn'), { withdrawnReason: 'left' });
const reactivated = Claim.claimManualParticipant('t1', [registration('manual:m2', 'cat-a'), withdrawnAccount], 'm2', 'u1');
ok(reactivated.creates.length === 0, 'reativa documento da conta já retirado sem criar duplicata');
ok(reactivated.updates.some((item) => item.registrationId === withdrawnAccount.registrationId && item.status === 'confirmed'), 'documento retirado volta ao estado da vaga reivindicada');

bad('recusa conta já ativa na mesma categoria', () => Claim.claimManualParticipant('t1', [registration('manual:m3', 'cat-a'), registration('uid:u1', 'cat-a')], 'm3', 'u1'));
bad('recusa vaga manual inexistente', () => Claim.claimManualParticipant('t1', [manual], 'outra', 'u1'));

console.log(fail ? '✗ registration-claim-core: ' + pass + ' ok, ' + fail + ' falhas' : '✓ registration-claim-core: ' + pass + ' ok');
process.exitCode = fail ? 1 : 0;
