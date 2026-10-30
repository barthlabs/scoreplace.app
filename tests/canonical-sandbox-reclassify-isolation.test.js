'use strict';
// Executa a callable real contra duas coleções independentes. Um sandbox
// validado pela identidade lógica do original NUNCA escreve no original.
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'scoreplace-testes';
const admin = require(path.join(ROOT, 'functions/node_modules/firebase-admin'));
const core = require(path.join(ROOT, 'functions/registration-core.js'));
const split = require(path.join(ROOT, 'functions/vendor/tournament-split-core.js'));
const billingTerms = require(path.join(ROOT, 'functions/billing-terms-core.js'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const account = (uid) => ({
  registrationId: core.registrationId('uid:' + uid, 'cat-a'), tournamentId: 't1',
  categoryId: 'cat-a', participantKey: 'uid:' + uid, participantKind: 'account',
  participantUid: uid, manualParticipantId: null, status: 'confirmed',
  validationState: 'approved', fixedPairId: null,
});
const definitions = ['cat-a', 'cat-b'].map((id) => ({ id, label: id, dimension: 'custom' }));
const original = {
  id: 't1', creatorUid: 'org', categoryDefinitions: definitions,
  canonicalRegistrationMigration: { fingerprint: 'fp', registrationCount: 1 },
  memberUids: ['org', 'u1'],
};
const sandbox = Object.assign({}, clone(original), {
  id: 'sb_t1', isSandbox: true, sandboxOf: 't1', sandboxOwnerUid: 'org',
  sbState: 'ready', notificationsMuted: true,
});
const first = account('u1');
const state = {
  tournaments: { t1: { doc: clone(original), registrations: { [first.registrationId]: clone(first) } } },
  sandboxes: { sb_t1: { doc: clone(sandbox), registrations: { [first.registrationId]: clone(first) } } },
  billingAdminConfig: { active: { doc: { organizerTerms: {
    version:'test-1', payoutWithinDays:30,
    refundPolicy:'Reembolsos sujeitos à conferência documentada pela organização.'
  } } } },
};
function docref(group, id, sub, subid) {
  return { group, id, sub, subid, collection: (name) => subref(group, id, name) };
}
function subref(group, id, name) {
  return { group, id, name, limit: function () { return this; }, doc: (subid) => docref(group, id, name, subid) };
}
function record(r) {
  const parent = state[r.group] && state[r.group][r.id];
  return r.sub ? parent && parent[r.sub] && parent[r.sub][r.subid] : parent && parent.doc;
}
const db = {
  collection: (group) => ({ doc: (id) => docref(group, id) }),
  runTransaction: async (callback) => {
    const writes = [];
    let startedWriting = false;
    const tx = {
      get: async (r) => {
        assert(!startedWriting, 'Firestore proíbe leitura após escrita na transação');
        if (r.name) {
          const entries = (state[r.group][r.id] || {})[r.name] || {};
          return { docs: Object.entries(entries).map(([id, value]) => ({ id, data: () => clone(value) })) };
        }
        const value = record(r);
        return { exists: !!value, data: () => clone(value || {}) };
      },
      update: (r, patch) => {
        startedWriting = true;
        assert(record(r), 'update não pode criar documento: ' + r.group + '/' + r.id);
        writes.push({ kind: 'update', r, patch });
      },
      create: (r, value) => {
        startedWriting = true;
        assert(!record(r), 'create não pode sobrescrever documento');
        writes.push({ kind: 'create', r, value });
      },
      set: (r, value) => { startedWriting = true; writes.push({ kind: 'set', r, value }); },
      delete: (r) => { startedWriting = true; writes.push({ kind: 'delete', r }); },
    };
    const result = await callback(tx);
    for (const write of writes) {
      const parent = state[write.r.group][write.r.id];
      if (write.r.sub && !parent[write.r.sub]) parent[write.r.sub] = {};
      const target = write.r.sub ? parent[write.r.sub] : parent;
      const key = write.r.sub ? write.r.subid : 'doc';
      if (write.kind === 'delete') delete target[key];
      else target[key] = write.kind === 'create' || write.kind === 'set'
        ? Object.assign({}, write.value)
        : Object.assign({}, target[key], write.patch);
    }
    return result;
  },
};
const firestoreStub = () => db;
firestoreStub.FieldPath = admin.firestore.FieldPath;
firestoreStub.FieldValue = admin.firestore.FieldValue;
Object.defineProperty(admin, 'initializeApp', { value: () => ({}), writable: true, configurable: true });
Object.defineProperty(admin, 'firestore', { value: firestoreStub, writable: true, configurable: true });
assert.strictEqual(admin.firestore, firestoreStub);
const CF = require(path.join(ROOT, 'functions/index.js'));
const fs = require('fs');
const serverCode = fs.readFileSync(path.join(ROOT, 'functions/index.js'), 'utf8');
const clientCode = fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8');
const directCode = fs.readFileSync(path.join(ROOT, 'js/views/tournaments.js'), 'utf8');
const format2Code = fs.readFileSync(path.join(ROOT, 'js/views/format2-ui.js'), 'utf8');
const callableNames = ['enrollParticipant', 'deenrollParticipant', 'leaveStandby', 'formPair', 'splitPair', 'setTournamentPresence'];
for (const name of callableNames) {
  const start = serverCode.indexOf('exports.' + name + ' = onCall(');
  assert(start >= 0, name + ' existe');
  const next = serverCode.indexOf('\nexports.', start + 1);
  const block = serverCode.slice(start, next < 0 ? undefined : next);
  assert(/sandbox \? "sandboxes" : "tournaments"/.test(block), name + ' escolhe coleção isolada');
  assert(/_sandboxAutorizado\(db, (snap|_pre), callerUid/.test(block), name + ' confere dono e original');
  assert(/sandbox !== tournamentId\.startsWith\("sb_"\)/.test(block), name + ' rejeita flag e ID divergentes');
  assert(/isSandbox === true/.test(block), name + ' rejeita clone no ramo de produção');
  if (['enrollParticipant', 'deenrollParticipant', 'leaveStandby', 'formPair', 'splitPair'].includes(name)) {
    assert(/_splitParts\.gravar\(tx, docRef,/.test(block), name + ' grava o resultado legado na referência já roteada dentro da transação');
    assert(/if \(!sandbox && !out\.canonical\)/.test(block), name + ' não replica a mutação do sandbox para outro torneio');
  }
  const clientStart = clientCode.indexOf("_callFn('" + name + "'");
  assert(clientStart >= 0 && /sandbox: this\._ehSandbox\(tournamentId\)/.test(clientCode.slice(clientStart, clientStart + 600)), name + ' passa flag no cliente');
}
assert(/_removePayload\.sandbox = window\.FirestoreDB\._ehSandbox\(tId\)/.test(directCode), 'remoção administrativa direta passa flag');
assert(/var gamesInput = document\.getElementById\('f2-team-schedule-games'\);\s*if \(gamesInput\)/.test(format2Code), 'leitor do campo genérico de rodadas tolera ausência quando há valores por categoria');
const enrollStart = serverCode.indexOf('exports.enrollParticipant = onCall(');
const enrollEnd = serverCode.indexOf('exports.deenrollParticipant = onCall(', enrollStart);
const enrollBlock = serverCode.slice(enrollStart, enrollEnd);
assert(enrollBlock.indexOf('await _avisarDuplicataSuspeita(') > enrollBlock.indexOf('const out = await db.runTransaction'), 'aviso de duplicata só depois do commit');
assert(/if \(!sandbox && duplicateNotice &&/.test(enrollBlock), 'sandbox não enfileira aviso');
console.log('✓ seis callables e clientes usam a mesma coleção isolada; aviso só após commit');
const call = (data, uid = 'org') => CF.reclassifyCanonicalRegistration.run({
  data, auth: { uid, token: { uid } }, rawRequest: { headers: {} }, acceptsStreaming: false,
});
const request = (sandboxFlag) => ({
  tournamentId: 'sb_t1', sandbox: sandboxFlag, userUid: 'u1',
  fromCategoryId: 'cat-a', toCategoryId: 'cat-b',
});
(async () => {
  state.sandboxes.sb_t1.doc.registrationSettings = { source:'scoreplace',
    pricing:{ mode:'single', cents:18700 } };
  state.sandboxes.sb_t1.registrations[first.registrationId] = {
    ...clone(first), paymentState:'paid', paymentDueCents:18700, paymentCurrency:'BRL',
    proofPath:'tournamentPaymentProofs/t1/u1/0123456789abcdef', paymentMethod:'organizer_pix',
    paymentReviewedBy:'org', paymentReviewEvidence:'Pix conferido'
  };
  const paidOriginalBefore = clone(state.tournaments);
  await call(request(true));
  assert.strictEqual(Object.keys(state.sandboxes.sb_t1.notificationOutbox || {}).length, 0,
    'sandbox não emite avisos financeiros');
  const paidMovedId = core.registrationId('uid:u1', 'cat-b');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[first.registrationId].paymentState, null);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[first.registrationId].proofPath, null);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[first.registrationId].paymentTransferredToRegistrationId, paidMovedId);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[paidMovedId].paymentState, 'paid');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[paidMovedId].paymentDueCents, 18700);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[paidMovedId].reclassifiedFromRegistrationId, first.registrationId);
  assert.strictEqual(Object.keys(state.sandboxes.sb_t1.registrationCategoryAudit || {}).length, 1,
    'troca no sandbox audita só a cópia');
  assert.deepStrictEqual(clone(state.tournaments), paidOriginalBefore, 'pagamento do sandbox não toca o torneio real');
  state.tournaments.t1.doc.registrationSettings = { source:'scoreplace', pricing:{ mode:'single', cents:18700 } };
  state.tournaments.t1.registrations[first.registrationId] = clone(state.sandboxes.sb_t1.registrations[paidMovedId]);
  state.tournaments.t1.registrations[first.registrationId].registrationId = first.registrationId;
  state.tournaments.t1.registrations[first.registrationId].categoryId = 'cat-a';
  const unconfiguredPaidBefore = clone(state.tournaments.t1);
  await assert.rejects(call({ tournamentId:'t1', sandbox:false, userUid:'u1',
    fromCategoryId:'cat-a', toCategoryId:'cat-b' }), /não está habilitada/);
  assert.deepStrictEqual(clone(state.tournaments.t1), unconfiguredPaidBefore, 'sem contrato financeiro não grava');
  state.tournaments.t1 = clone(paidOriginalBefore.t1);
  state.tournaments.t1.notificationOutbox = {};
  state.tournaments.t1.doc.registrationSettings = { source:'scoreplace',
    pricing:{ mode:'category', centsByCategory:{ 'cat-a':18700, 'cat-b':0 } } };
  state.tournaments.t1.registrations[first.registrationId] = {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL'
  };
  const paymentCancelled = await call({ tournamentId:'t1', sandbox:false, userUid:'u1',
    fromCategoryId:'cat-a', toCategoryId:'cat-b' });
  assert.strictEqual(paymentCancelled.outcome, 'reclassified');
  const notices = Object.values(state.tournaments.t1.notificationOutbox);
  assert.strictEqual(notices.length, 1, 'troca gratuita cancela cobrança e avisa uma vez');
  assert.strictEqual(notices[0].dispatchStatus, 'pending');
  assert.strictEqual(notices[0].level, 'important');
  assert.deepStrictEqual(notices[0].recipients, ['u1']);
  assert.strictEqual(notices[0].type, 'category-change-result');
  const cancellationAudit = Object.values(state.tournaments.t1.registrationCategoryAudit || {});
  assert.strictEqual(cancellationAudit.length, 1);
  assert.strictEqual(cancellationAudit[0].sourceBefore.paymentDueCents, 18700);
  assert.strictEqual(cancellationAudit[0].destinationAfter.paymentState, null);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(cancellationAudit[0].sourceBefore, 'proofPath'), false);
  assert.strictEqual(state.tournaments.t1.registrations[first.registrationId].paymentState, null);
  assert.strictEqual(state.tournaments.t1.registrations[core.registrationId('uid:u1', 'cat-b')].paymentState, null);
  state.tournaments.t1 = clone(paidOriginalBefore.t1);
  state.tournaments.t1.notificationOutbox = {};
  const billable = state.tournaments.t1.doc;
  billable.registrationSettings = { source:'scoreplace',
    pricing:{ mode:'category', centsByCategory:{ 'cat-a':18700, 'cat-b':21000 } },
    paymentMethods:{ organizerPixKey:'pix@example.com', organizerPixName:'Organizador', organizerPixCity:'Sao Paulo' } };
  billable.billingContract = { schema:1, currency:'BRL', feeCentsPerPerson:2000 };
  const catalog = billingTerms.termsCatalog(state.billingAdminConfig.active.doc, billable);
  billable.billingTermsAcceptance = { hash:catalog.hash, version:catalog.version };
  state.tournaments.t1.registrations[first.registrationId] = {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL'
  };
  const move = (fromCategoryId, toCategoryId) => call({ tournamentId:'t1', sandbox:false,
    userUid:'u1', fromCategoryId, toCategoryId });
  await move('cat-a', 'cat-b');
  const firstNotice = Object.values(state.tournaments.t1.notificationOutbox)[0];
  assert.strictEqual(firstNotice.type, 'registration_payment_pending');
  assert.match(firstNotice.message, /substitui a anterior/);
  assert.deepStrictEqual(firstNotice.recipients, ['u1']);
  assert.strictEqual(firstNotice.dispatchStatus, 'pending');
  assert.strictEqual(state.tournaments.t1.registrations[core.registrationId('uid:u1', 'cat-b')].paymentDueCents, 21000);
  state.tournaments.t1.registrations = { [first.registrationId]: {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL' } };
  state.tournaments.t1.doc.canonicalRegistrationMigration.registrationCount = 1;
  await move('cat-a', 'cat-b');
  assert.strictEqual(Object.keys(state.tournaments.t1.notificationOutbox).length, 2,
    'duas invocações independentes com a mesma rota não colidem no ID do aviso');
  await move('cat-b', 'cat-a');
  await move('cat-a', 'cat-b');
  assert.strictEqual(Object.keys(state.tournaments.t1.registrationCategoryAudit).length, 4,
    'ciclo preserva uma trilha auditável para cada passagem');
  assert.strictEqual(Object.keys(state.tournaments.t1.notificationOutbox).length, 4,
    'ciclo cobra o valor atual sem colisão dos avisos');
  assert.strictEqual(state.tournaments.t1.registrations[core.registrationId('uid:u1', 'cat-b')].paymentDueCents, 21000);
  const mutedBefore = Object.keys(state.tournaments.t1.notificationOutbox).length;
  state.tournaments.t1.registrations = { [first.registrationId]: {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL' } };
  state.tournaments.t1.doc.canonicalRegistrationMigration.registrationCount = 1;
  state.tournaments.t1.doc.notificationsMuted = true;
  await move('cat-a', 'cat-b');
  assert.strictEqual(Object.keys(state.tournaments.t1.notificationOutbox).length, mutedBefore);
  state.tournaments.t1.registrations = { [first.registrationId]: {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL' } };
  state.tournaments.t1.doc.canonicalRegistrationMigration.registrationCount = 1;
  state.tournaments.t1.doc.notificationsMuted = false;
  state.tournaments.t1.doc.organizerOnly = true;
  await move('cat-a', 'cat-b');
  assert.strictEqual(Object.keys(state.tournaments.t1.notificationOutbox).length, mutedBefore);
  state.tournaments.t1.doc.organizerOnly = false;
  state.tournaments.t1.doc.registrationSettings.pricing = { mode:'single', cents:18700 };
  const equalTerms = billingTerms.termsCatalog(state.billingAdminConfig.active.doc, state.tournaments.t1.doc);
  state.tournaments.t1.doc.billingTermsAcceptance = { hash:equalTerms.hash, version:equalTerms.version };
  state.tournaments.t1.registrations = { [first.registrationId]: {
    ...clone(first), paymentState:'paid', paymentDueCents:18700, paymentCurrency:'BRL',
    proofPath:'tournamentPaymentProofs/t1/u1/0123456789abcdef', paymentMethod:'organizer_pix',
    paymentReviewedBy:'org', paymentReviewEvidence:'Pix conferido' } };
  state.tournaments.t1.doc.canonicalRegistrationMigration.registrationCount = 1;
  await move('cat-a', 'cat-b');
  await move('cat-b', 'cat-a');
  assert.strictEqual(state.tournaments.t1.registrations[first.registrationId].paymentState, 'paid');
  assert.strictEqual(state.tournaments.t1.registrations[first.registrationId].paymentTransferredToRegistrationId, null);
  assert.strictEqual(state.tournaments.t1.registrations[first.registrationId].proofPath,
    'tournamentPaymentProofs/t1/u1/0123456789abcdef');
  const paidAuditCount = Object.keys(state.tournaments.t1.registrationCategoryAudit).length;
  state.tournaments.t1.doc.registrationSettings.pricing = { mode:'category',
    centsByCategory:{ 'cat-a':18700, 'cat-b':21000 } };
  const paidDifferenceBefore = clone(state.tournaments.t1);
  await assert.rejects(move('cat-a', 'cat-b'), /Nenhuma cobrança ou devolução foi feita/);
  assert.deepStrictEqual(clone(state.tournaments.t1), paidDifferenceBefore,
    'diferença paga não grava categoria, aviso nem auditoria');
  assert.strictEqual(Object.keys(state.tournaments.t1.registrationCategoryAudit).length, paidAuditCount);
  state.tournaments.t1 = clone(paidOriginalBefore.t1);
  state.sandboxes.sb_t1 = { doc:clone(sandbox), registrations:{ [first.registrationId]:clone(first) } };
  const originalBefore = clone(state.tournaments);
  const response = await call(request(true));
  assert.strictEqual(response.outcome, 'reclassified');
  assert.deepStrictEqual(clone(state.tournaments), originalBefore, 'sandbox não toca no original');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[first.registrationId].status, 'withdrawn');
  const movedId = core.registrationId('uid:u1', 'cat-b');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].status, 'confirmed');
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].tournamentId, 't1');
  assert.strictEqual(state.sandboxes.sb_t1.doc.canonicalRegistrationMigration.registrationCount, 2);
  console.log('✓ sandbox muda categoria e recibo sem tocar no original');

  // O documento pai pode ter arrays vazios enquanto a chave está nas partes.
  // A guarda deve consultar cada subcoleção antes de qualquer escrita.
  for (const part of ['matches', 'grupos', 'woClaims']) {
    state.sandboxes.sb_t1[part] = { drawn: { id: 'drawn' } };
    const beforeBlocked = clone(state.sandboxes.sb_t1);
    await assert.rejects(call({ ...request(true), fromCategoryId: 'cat-b', toCategoryId: 'cat-a' }),
      /após o sorteio/, 'reclassificação bloqueada por ' + part + ' separado');
    assert.deepStrictEqual(clone(state.sandboxes.sb_t1), beforeBlocked, part + ' não causou escrita');
    delete state.sandboxes.sb_t1[part];
  }
  const setDefinitions = (definitionsArg) => CF.setTournamentCategoryDefinitions.run({
    data: { tournamentId: 't1', definitions: definitionsArg, rigor: 'casual' },
    auth: { uid: 'org', token: { uid: 'org' } }, rawRequest: { headers: {} }, acceptsStreaming: false,
  });
  for (const part of ['matches', 'grupos', 'woClaims']) {
    state.tournaments.t1[part] = { drawn: { id: 'drawn' } };
    const beforeBlocked = clone(state.tournaments.t1);
    await assert.rejects(setDefinitions(definitions), /antes do primeiro sorteio/,
      'edição tipada bloqueada por ' + part + ' separado');
    assert.deepStrictEqual(clone(state.tournaments.t1), beforeBlocked, part + ' não causou escrita');
    delete state.tournaments.t1[part];
  }
  console.log('✓ três partes divididas travam categorias e reclassificação sem tocar no original');

  await assert.rejects(call(request(false)), /torneio não existe/);
  await assert.rejects(call({ ...request(true), tournamentId: 't1' }), /torneio não existe/);
  await assert.rejects(call({ ...request(true), fromCategoryId: 'cat-b', toCategoryId: 'cat-a' }, 'intruso'), /torneio não existe/);
  assert.deepStrictEqual(clone(state.tournaments), originalBefore);
  console.log('✓ flag incorreta, ID errado e outro usuário falham fechados');

  const leave = (data, uid = 'org') => CF.deenrollParticipant.run({
    data, auth: { uid, token: { uid } }, rawRequest: { headers: {} }, acceptsStreaming: false,
  });
  const removed = await leave({ tournamentId: 'sb_t1', sandbox: true, userUid: 'u1' });
  assert.strictEqual(removed.notFound, false);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].status, 'withdrawn');
  assert.deepStrictEqual(clone(state.tournaments), originalBefore);
  state.sandboxes.sb_t1.registrations[first.registrationId] = {
    ...clone(first), status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:18700, paymentCurrency:'BRL'
  };
  state.sandboxes.sb_t1.registrations[movedId] = {
    ...clone(state.sandboxes.sb_t1.registrations[movedId]), status:'confirmed',
    paymentState:'paid', paymentDueCents:18700, paymentCurrency:'BRL'
  };
  const mixedPaymentsBefore = clone(state.sandboxes.sb_t1);
  await assert.rejects(leave({ tournamentId:'sb_t1', sandbox:true, userUid:'u1' }),
    /acerto financeiro assistido/);
  assert.deepStrictEqual(clone(state.sandboxes.sb_t1), mixedPaymentsBefore,
    'uma categoria paga bloqueia a saída inteira sem escrita parcial');
  state.sandboxes.sb_t1.registrations[movedId].paymentState = 'rejected';
  const unpaidRemoved = await leave({ tournamentId:'sb_t1', sandbox:true, userUid:'u1' });
  assert.strictEqual(unpaidRemoved.notFound, false);
  for (const registrationId of [first.registrationId, movedId]) {
    const item = state.sandboxes.sb_t1.registrations[registrationId];
    assert.strictEqual(item.status, 'withdrawn');
    assert.strictEqual(item.paymentState, null);
    assert.strictEqual(item.paymentDueCents, null);
  }
  assert.deepStrictEqual(clone(state.tournaments), originalBefore,
    'cancelamento de dívida do sandbox não toca o original');
  await assert.rejects(leave({ tournamentId: 'sb_t1', userUid: 'u1' }), /torneio não existe/);
  console.log('✓ desinscrição usa o mesmo núcleo canônico, mas grava somente no sandbox');

  state.tournaments.t1.doc.creatorUid = 'outro';
  await assert.rejects(call({ ...request(true), fromCategoryId: 'cat-b', toCategoryId: 'cat-a' }), /torneio não existe/);
  assert.strictEqual(state.sandboxes.sb_t1.registrations[movedId].status, 'withdrawn');
  console.log('✓ perda de autorização no original bloqueia a cópia');

  const legacyOriginal = { id: 't2', creatorUid: 'org', status: 'open', enrollmentMode: 'time', teamSize: 2,
    participants: [{ uid: 'u2', name: 'Pessoa de teste' }], memberUids: ['org', 'u2'] };
  const legacySandbox = Object.assign({}, clone(legacyOriginal), { id: 'sb_t2', isSandbox: true,
    sandboxOf: 't2', sandboxOwnerUid: 'org', sbState: 'ready', notificationsMuted: true });
  const seedSplit = (t) => {
    const parts = split.dividir(t, ['participants']);
    return { doc: parts.config, registrations: {}, inscritos: Object.fromEntries(parts.participants.map((entry) => [split.chaveDoRegistro(entry), entry])) };
  };
  state.tournaments.t2 = seedSplit(legacyOriginal);
  state.sandboxes.sb_t2 = seedSplit(legacySandbox);
  const legacyBefore = clone(state.tournaments.t2);
  const legacyRemoved = await leave({ tournamentId: 'sb_t2', sandbox: true, userUid: 'u2' });
  assert.strictEqual(legacyRemoved.notFound, false);
  assert.strictEqual(Object.keys(state.sandboxes.sb_t2.inscritos).length, 0, 'ramo legado grava a subcoleção de inscritos do sandbox na transação');
  assert.deepStrictEqual(clone(state.tournaments.t2), legacyBefore, 'ramo legado não replica escrita no original');
  console.log('✓ desinscrição legada atualiza a subcoleção de inscritos do sandbox sem tocar em produção');

  state.tournaments.t1.doc.creatorUid = 'org';
  const beforeUsedRemoval = clone(state.tournaments.t1);
  await assert.rejects(setDefinitions([definitions[1]]), /Reclassifique as inscrições/);
  assert.deepStrictEqual(clone(state.tournaments.t1), beforeUsedRemoval,
    'remover categoria usada não escreve em torneio real nem no clone');
  const renamed = definitions.map((def, index) => ({ ...def, label: index === 0 ? 'Categoria A renomeada' : def.label }));
  const configured = await setDefinitions(renamed);
  assert.strictEqual(configured.ok, true);
  assert.deepStrictEqual(state.tournaments.t1.doc.categoryDefinitions.map((def) => def.id), ['cat-a', 'cat-b']);
  assert.deepStrictEqual(state.tournaments.t1.doc.combinedCategories, ['Categoria A renomeada', 'cat-b']);
  assert.strictEqual(state.tournaments.t1.doc.enrollmentRigor, 'casual');
  assert(state.tournaments.t1.doc.updatedAt, 'edição tipada atualiza o relógio');
  console.log('✓ renomeação mantém IDs; remoção de categoria usada recusa sem escrita');
})().catch((error) => { console.error(error); process.exitCode = 1; });
