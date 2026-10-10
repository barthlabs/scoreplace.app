'use strict';

const M = require('./registration-mutations-core');
const R = require('./registration-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) { pass++; console.log('✓ ' + name); } else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

function registration(uid, categoryId, status) {
  const key = 'uid:' + uid;
  return {
    registrationId: R.registrationId(key, categoryId), tournamentId: 't1', categoryId,
    participantKey: key, participantKind: 'account', participantUid: uid,
    manualParticipantId: null, status: status || 'confirmed', validationState: 'accepted', fixedPairId: null,
  };
}

const a = registration('u1', 'cat-a');
const aSecondCategory = registration('u1', 'cat-b');
const b = registration('u2', 'cat-a');
const c = registration('u3', 'cat-b');
const enrolled = M.enroll('t1', [a], { uid: 'u2' }, ['cat-a', 'cat-b'], { validationState: 'approved' });
ok('inscrição canônica cria documentos por UID e categoria', enrolled.outcome === 'enrolled' && enrolled.creates.length === 2 && enrolled.creates.every((item) => item.participantKey === 'uid:u2' && item.status === 'confirmed'));
const repeatEnrollment = M.enroll('t1', enrolled.creates, { uid: 'u2' }, ['cat-a', 'cat-b'], { validationState: 'approved' });
ok('inscrição repetida é idempotente', repeatEnrollment.outcome === 'alreadyRegistered' && repeatEnrollment.creates.length === 0 && repeatEnrollment.already.length === 2);
const waitlistedEnrollment = M.enroll('t1', [], { manualParticipantId: 'manual-1' }, ['cat-a'], { status: 'waitlisted', manualDisplayName: 'Convidada' });
ok('espera canônica preserva ID manual e rótulo sem usar nome como chave', waitlistedEnrollment.creates[0].status === 'waitlisted' && waitlistedEnrollment.creates[0].participantKey === 'manual:manual-1' && waitlistedEnrollment.creates[0].manualDisplayName === 'Convidada');
const paired = M.pair('t1', [a, b, c], [a.registrationId, b.registrationId]);
ok('forma dupla na mesma categoria', paired.outcome === 'paired' && paired.updates.length === 2 && paired.updates[0].fixedPairId === paired.updates[1].fixedPairId);
ok('id de dupla é determinístico e independente da ordem', paired.fixedPairId === M.canonicalPairId('t1', 'cat-a', [b.registrationId, a.registrationId]));
const pairedByIdentity = M.pairParticipants('t1', [a, b], { uid: 'u1' }, { uid: 'u2' }, 'cat-a');
ok('formar dupla por identidade exige categoria explícita e não consulta nome', pairedByIdentity.outcome === 'paired' && pairedByIdentity.updates.length === 2);
bad('recusa formar dupla por identidade sem categoria explícita', () => M.pairParticipants('t1', [a, b], { uid: 'u1' }, { uid: 'u2' }, ''));
bad('recusa dupla entre categorias', () => M.pair('t1', [a, c], [a.registrationId, c.registrationId]));
bad('recusa formar dupla sobre registro já pareado', () => M.pair('t1', [paired.updates[0], paired.updates[1]], [a.registrationId, b.registrationId]));
const split = M.split('t1', paired.updates, [a.registrationId, b.registrationId]);
ok('desfaz apenas a dupla indicada', split.outcome === 'split' && split.updates.every((item) => item.fixedPairId === null));
const splitByIdentity = M.splitParticipants('t1', pairedByIdentity.updates, { uid: 'u1' }, { uid: 'u2' }, 'cat-a');
ok('desfaz dupla por identidade e categoria explícitas', splitByIdentity.outcome === 'split' && splitByIdentity.updates.every((item) => item.fixedPairId === null));
bad('recusa desfazer dupla por identidade sem categoria explícita', () => M.splitParticipants('t1', pairedByIdentity.updates, { uid: 'u1' }, { uid: 'u2' }, ''));
bad('recusa desfazer registros que não são dupla', () => M.split('t1', [a, b], [a.registrationId, b.registrationId]));
const waitlisted = registration('u4', 'cat-a', 'waitlisted');
const leave = M.leaveWaitlist('t1', [a, waitlisted], { uid: 'u4' });
ok('saída da espera não altera inscrição confirmada', leave.updates.length === 1 && leave.updates[0].status === 'withdrawn' && leave.updates[0].registrationId === waitlisted.registrationId);
const withdrawn = M.withdraw('t1', [paired.updates[0], paired.updates[1], aSecondCategory, c], { uid: 'u1' });
ok('saída do torneio altera todas as categorias da pessoa', withdrawn.updates.filter((item) => item.participantUid === 'u1').length === 2 && withdrawn.updates.filter((item) => item.participantUid === 'u1').every((item) => item.status === 'withdrawn'));
ok('saída de integrante dissolve a dupla sem retirar o parceiro', withdrawn.updates.some((item) => item.participantUid === 'u2' && item.status === 'confirmed' && item.fixedPairId === null));
bad('recusa registros com chave de participante divergente', () => M.indexRegistrations('t1', [Object.assign({}, a, { participantKey: 'uid:outra' })]));
bad('recusa duas inscrições da mesma pessoa na categoria', () => M.indexRegistrations('t1', [a, Object.assign({}, a)]));
const movedSolo = M.reclassify('t1', [a], { uid: 'u1' }, 'cat-a', 'cat-b');
ok('troca canônica preserva origem retirada e cria destino determinístico',
  movedSolo.updates.length === 1 && movedSolo.updates[0].status === 'withdrawn' && movedSolo.creates.length === 1 && movedSolo.creates[0].registrationId === R.registrationId('uid:u1', 'cat-b'));
const pairedForMove = M.pair('t1', [a, b], [a.registrationId, b.registrationId]);
const movedPair = M.reclassify('t1', pairedForMove.updates, { uid: 'u1' }, 'cat-a', 'cat-b');
ok('troca de categoria leva a dupla inteira e recalcula o vínculo',
  movedPair.updates.filter((item) => item.status === 'withdrawn').length === 2 && movedPair.creates.length === 2 && movedPair.creates.every((item) => item.categoryId === 'cat-b' && item.fixedPairId === movedPair.fixedPairId));
bad('recusa categoria destino já ativa', () => M.reclassify('t1', [a, aSecondCategory], { uid: 'u1' }, 'cat-a', 'cat-b'));
console.log((fail ? '✗' : '✓') + ' registration-mutations-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
