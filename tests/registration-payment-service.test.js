'use strict';
const assert = require('assert');
const fs = require('fs');
const { makeService } = require('../functions/registration-payment-service');
const R = require('../functions/registration-core');
const Payment = require('../functions/registration-payment-core');
const paymentView = fs.readFileSync(require.resolve('../js/views/tournament-registration-payment.js'), 'utf8');
assert.doesNotMatch(paymentView, /httpsCallable\s*\(/, 'pagamentos usam a porta canônica da app');
for (const method of ['getMyTournamentRegistrationPayments', 'submitTournamentPaymentProof',
  'listTournamentPaymentProofs', 'reviewTournamentPaymentProof']) {
  assert(paymentView.includes("window._callCF('" + method + "'"), method + ' usa a porta canônica com nome literal');
}

const tid = 'tour_1790000000000_0123456789abcdef0123456789abcdef';
const uid = 'person-1', cat = 'cat-a';
const rid = R.registrationId('uid:' + uid, cat);
const path = `tournamentPaymentProofs/${tid}/${uid}/0123456789abcdef`;
const docs = new Map();
const tournamentPath = `tournaments/${tid}`;
const regPath = `${tournamentPath}/registrations/${rid}`;
docs.set(tournamentPath, { creatorUid:'organizer', status:'open', memberUids:[uid],
  canonicalRegistrationMigration:{ fingerprint:'existing-receipt', registrationCount:1 } });
docs.set(regPath, Payment.awaitingPayment({ tournamentId:tid, registrationId:rid,
  participantKind:'account', participantUid:uid, participantKey:'uid:' + uid,
  categoryId:cat, originCategoryId:cat, validationState:'approved',
  status:'confirmed', fixedPairId:null }, 18700));

class Ref {
  constructor(path) { this.path = path; this.id = path.split('/').pop(); }
  collection(name) { return new Collection(this.path + '/' + name); }
  async get() {
    const value = docs.get(this.path);
    return { id:this.id, exists:!!value, data:() => value && ({ ...value }) };
  }
}
class Collection {
  constructor(path) { this.path = path; }
  doc(id) { return new Ref(this.path + '/' + id); }
  limit(count) { return { path:this.path, count, query:true }; }
  where(field, operator, value) {
    assert.strictEqual(operator, '==');
    const state = { cursor:null, count:Infinity };
    const query = {
      orderBy:key => { assert.strictEqual(key, '__name__'); return query; },
      startAfter:snapshot => { state.cursor = snapshot.id; return query; },
      limit:count => { state.count = count; return query; },
      get:async () => ({ docs:[...docs.entries()]
        .filter(([key, item]) => key.startsWith(this.path + '/')
          && key.slice(this.path.length + 1).indexOf('/') < 0 && item[field] === value)
        .sort(([a], [b]) => a.localeCompare(b))
        .filter(([key]) => !state.cursor || key.split('/').pop() > state.cursor)
        .slice(0, state.count)
        .map(([key, item]) => ({ id:key.split('/').pop(), data:() => ({ ...item }) })) })
    };
    return query;
  }
}
class HttpsError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
const db = {
  collection(name) { return new Collection(name); },
  async runTransaction(fn) {
    const writes = [];
    const tx = {
      async get(ref) {
        if (ref.query) return { docs:[...docs.entries()]
          .filter(([key]) => key.startsWith(ref.path + '/') && key.slice(ref.path.length + 1).indexOf('/') < 0)
          .slice(0, ref.count).map(([key, value]) => ({ id:key.split('/').pop(), data:() => ({ ...value }) })) };
        const value = docs.get(ref.path);
        return { exists:!!value, data:() => value && ({ ...value }) };
      },
      update(ref, patch) { writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...patch })); },
      create(ref, value) { writes.push(() => { assert(!docs.has(ref.path)); docs.set(ref.path, value); }); }
    };
    const result = await fn(tx);
    writes.forEach(write => write());
    return result;
  }
};
let metadataType = 'image/jpeg';
const storage = { bucket:() => ({ file:() => ({ getMetadata:async () => [{ size:'1024', contentType:metadataType }] }) }) };
const service = makeService({ db, storage, HttpsError,
  FieldValue:{ serverTimestamp:() => 'server-time' } });
const request = (actor, extra) => ({ auth:{ uid:actor }, data:{ tournamentId:tid, registrationId:rid, ...extra } });

(async () => {
  const ownBefore = await service.myPayments(request(uid));
  assert.strictEqual(ownBefore.payments.length, 0);
  docs.set(tournamentPath, { ...docs.get(tournamentPath), registrationSettings:{ source:'scoreplace',
    paymentMethods:{ organizerPixKey:'pix@example.com', organizerPixName:'Fulano de Tal', organizerPixCity:'Brasilia' } }, categoryDefinitions:[{ id:cat, label:'Feminino' }] });
  const ownPayment = await service.myPayments(request(uid));
  assert.strictEqual(ownPayment.payments[0].amountCents, 18700);
  assert.strictEqual(ownPayment.payments[0].category, 'Feminino');
  assert.strictEqual(ownPayment.paymentMethods.organizerPixKey, 'pix@example.com');
  assert.strictEqual(ownPayment.paymentMethods.organizerPixName, 'Fulano de Tal');
  const outsiderPayment = await service.myPayments(request('outsider'));
  assert.strictEqual(outsiderPayment.payments.length, 0);
  assert.strictEqual(outsiderPayment.paymentMethods, null);
  await assert.rejects(service.submitProof(request('outsider', { proofPath:`tournamentPaymentProofs/${tid}/outsider/0123456789abcdef`, paymentMethod:'organizer_pix' })), error => error.code === 'permission-denied');
  metadataType = 'image/svg+xml';
  await assert.rejects(service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_pix' })), error => error.code === 'failed-precondition');
  metadataType = 'image/jpeg';
  await assert.rejects(service.submitProof(request(uid, { proofPath:path })), error => error.code === 'failed-precondition');
  await assert.rejects(service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_link' })), error => error.code === 'failed-precondition');
  for (const tournamentState of [{ status:'in_progress' }, { status:'finished' }, { drawSelectionDone:true }]) {
    const original = docs.get(tournamentPath);
    docs.set(tournamentPath, { ...original, ...tournamentState });
    await assert.rejects(service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_pix' })),
      error => error.code === 'failed-precondition');
    docs.set(tournamentPath, original);
  }
  assert.strictEqual((await service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_pix' }))).changed, true);
  assert.strictEqual((await service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_pix' }))).changed, false);
  docs.set(tournamentPath, { ...docs.get(tournamentPath), registrationSettings:{
    ...docs.get(tournamentPath).registrationSettings,
    paymentMethods:{ organizerPixKey:'pix@example.com', organizerPixName:'Fulano de Tal',
      organizerPixCity:'Brasilia', organizerPaymentUrl:'https://example.com/pagar' }
  } });
  await assert.rejects(service.submitProof(request(uid, { proofPath:path, paymentMethod:'organizer_link' })), error => error.code === 'failed-precondition');
  assert.strictEqual(docs.get(regPath).paymentState, 'proof_submitted');
  assert.strictEqual(docs.get(regPath).paymentMethod, 'organizer_pix');
  docs.set('users/' + uid, { displayName:'Atleta' });
  const queue = await service.pendingProofs(request('organizer'));
  assert.strictEqual(queue.payments.length, 1);
  assert.strictEqual(queue.payments[0].participantName, 'Atleta');
  assert.strictEqual(queue.payments[0].proofPath, path);
  assert.strictEqual(queue.payments[0].paymentMethod, 'organizer_pix');
  await assert.rejects(service.pendingProofs(request('outsider')), error => error.code === 'permission-denied');
  await assert.rejects(service.reviewProof(request('outsider', { action:'approve', evidence:'Pix confirmado' })), error => error.code === 'permission-denied');
  await assert.rejects(service.reviewProof(request('organizer', { action:'approve', evidence:'curto' })), error => error.code === 'failed-precondition');
  assert.strictEqual((await service.reviewProof(request('organizer', { action:'approve', evidence:'Pix confirmado' }))).changed, true);
  assert.strictEqual(docs.get(regPath).status, 'confirmed');
  assert.strictEqual(docs.get(regPath).paymentState, 'paid');
  const settledPayment = await service.myPayments(request(uid));
  assert.strictEqual(settledPayment.payments[0].state, 'paid');
  assert.strictEqual(settledPayment.paymentMethods, null);
  assert.strictEqual((await service.reviewProof(request('organizer', { action:'approve', evidence:'Pix confirmado' }))).changed, false);
  await assert.rejects(service.submitProof(request(uid, { proofPath:`tournamentPaymentProofs/${tid}/outsider/0123456789abcdef`, paymentMethod:'organizer_pix' })), error => error.code === 'invalid-argument');
  const movedRid = R.registrationId('uid:' + uid, 'cat-b');
  const movedPath = `${tournamentPath}/registrations/${movedRid}`;
  const transferredProofPath = `tournamentPaymentProofs/${tid}/${uid}/abcdef0123456789`;
  docs.set(regPath, { ...docs.get(regPath), status:'withdrawn', paymentState:null,
    proofPath:null, paymentMethod:null, paymentTransferredToRegistrationId:movedRid });
  docs.set(movedPath, { ...docs.get(regPath), registrationId:movedRid, categoryId:'cat-b',
    status:'pending', paymentState:'proof_submitted', proofPath:transferredProofPath, paymentMethod:'organizer_pix',
    reclassifiedFromRegistrationId:rid });
  docs.set(tournamentPath, { ...docs.get(tournamentPath), canonicalRegistrationMigration:{
    ...docs.get(tournamentPath).canonicalRegistrationMigration, registrationCount:2 } });
  const afterTransfer = await service.pendingProofs(request('organizer'));
  assert.deepStrictEqual(afterTransfer.payments.map(item => item.registrationId), [movedRid],
    'a inscrição antiga retirada não volta à fila de comprovantes');
  assert.strictEqual((await service.reviewProof(request('organizer', { registrationId:movedRid,
    action:'approve', evidence:'Pix transferido conferido' }))).approved, true);
  assert.strictEqual(docs.get(movedPath).paymentState, 'paid');
  docs.delete(movedPath);
  for (let index = 0; index < 205; index++) {
    const id = `account${String(index).padStart(3, '0')}__cat-a`;
    docs.set(`${tournamentPath}/registrations/${id}`, { registrationId:id,
      participantUid:`person-${index}`, categoryId:cat, paymentDueCents:18700,
      paymentCurrency:'BRL', paymentState:'proof_submitted', proofPath:path });
  }
  const first = await service.pendingProofs(request('organizer'));
  const second = await service.pendingProofs(request('organizer', { cursor:first.nextCursor }));
  const third = await service.pendingProofs(request('organizer', { cursor:second.nextCursor }));
  assert.deepStrictEqual([first.payments.length, second.payments.length, third.payments.length], [100, 100, 5]);
  assert.strictEqual(third.nextCursor, null);
  assert.strictEqual(new Set([...first.payments, ...second.payments, ...third.payments].map(item => item.registrationId)).size, 205);
  await assert.rejects(service.pendingProofs(request('organizer', { cursor:'bad/path' })), error => error.code === 'invalid-argument');
  console.log('Comprovante: autoria, idempotência, revisão e confirmação transacional OK.');
})().catch(error => { console.error(error); process.exitCode = 1; });
