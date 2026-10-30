'use strict';

// Esta porta apenas recebe e confere comprovantes de meios DIRETOS. Nunca
// considera o upload uma quitação e nunca aceita valor/estado do navegador.
const crypto = require('crypto');
const boundary = require('./canonical-registration-boundary-core');
const payment = require('./registration-payment-core');

function makeService({ db, storage, HttpsError, FieldValue }) {
  function fail(code, message) { throw new HttpsError(code, message); }
  function ids(request) {
    const uid = request.auth && request.auth.uid;
    const tournamentId = String(request.data && request.data.tournamentId || '');
    const registrationId = String(request.data && request.data.registrationId || '');
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!/^tour_[0-9]{13}_[a-f0-9]{32}$/.test(tournamentId)
      || !/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(registrationId)
      || registrationId.length > 400) fail('invalid-argument', 'Inscrição inválida.');
    return { uid, tournamentId, registrationId };
  }
  function refs(tournamentId, registrationId) {
    const tournament = db.collection('tournaments').doc(tournamentId);
    return { tournament, registration:tournament.collection('registrations').doc(registrationId) };
  }
  async function checked(tx, tournamentRef, registrationRef, tournamentId) {
    const tSnap = await tx.get(tournamentRef);
    if (!tSnap.exists) fail('not-found', 'Torneio não encontrado.');
    const tournament = tSnap.data() || {};
    if (tournament.isSandbox === true) fail('failed-precondition', 'Comprovante não é usado no sandbox.');
    const migration = boundary.migrationOf({ ...tournament, id:tournamentId });
    const rosterSnap = await tx.get(tournamentRef.collection('registrations').limit(migration.expectedCount + 1));
    const registrations = rosterSnap.docs.map(doc => {
      const item = doc.data() || {};
      if (doc.id !== item.registrationId) fail('failed-precondition', 'Elenco canônico divergente.');
      return item;
    });
    try { boundary.verifiedRoster({ ...tournament, id:tournamentId }, registrations); }
    catch (error) { fail('failed-precondition', error.message); }
    const registration = registrations.find(item => item.registrationId === registrationRef.id);
    if (!registration) fail('not-found', 'Inscrição não encontrada.');
    return { tournament, registrations, registration };
  }
  function organizer(t, uid) {
    // Storage só permite ler o comprovante ao dono/adminUids. A lista e a
    // decisão devem usar exatamente a mesma autorização, sem co-host legado
    // que enxergaria o registro mas receberia 403 ao abrir o arquivo.
    return t.creatorUid === uid || Array.isArray(t.adminUids) && t.adminUids.includes(uid);
  }
  function auditRef(ref, path, action) {
    const id = crypto.createHash('sha256').update(path + '\0' + action).digest('hex');
    return ref.collection('paymentAudit').doc(id);
  }
  function claimRef(ref, path) {
    return ref.collection('paymentProofClaims').doc(
      crypto.createHash('sha256').update(path).digest('hex'));
  }
  function notice(tx, ref, tournament, id, type, title, message, recipients, now) {
    const uids = [...new Set((recipients || []).filter(Boolean).map(String))];
    if (!uids.length || tournament.organizerOnly) return;
    tx.create(ref.collection('notificationOutbox').doc(id), {
      schema:1, kind:'tournament-notification', type, title, message,
      tournamentId:ref.id, tournamentName:String(tournament.name || ''),
      level:'important', recipients:uids, ctaLabel:'Ver torneio',
      ctaUrl:'https://scoreplace.app/#tournaments/' + ref.id,
      createdAt:now, createdAtMs:Date.parse(now), dispatchStatus:'pending'
    });
  }
  function paymentPatch(next, now) {
    return { status:next.status, paymentState:next.paymentState,
      proofPath:next.proofPath, paymentMethod:next.paymentMethod || null,
      paymentReviewedBy:next.paymentReviewedBy || null,
      paymentReviewEvidence:next.paymentReviewEvidence || null,
      paymentUpdatedAt:now, updatedAt:FieldValue.serverTimestamp() };
  }
  async function submitProof(request) {
    const { uid, tournamentId, registrationId } = ids(request);
    const path = String(request.data && request.data.proofPath || '');
    const method = String(request.data && request.data.paymentMethod || '');
    // A regra de Storage restringe create e impede update/delete; a Function
    // confere também o objeto real antes de escrever uma referência no roster.
    const prefix = `tournamentPaymentProofs/${tournamentId}/${uid}/`;
    if (!path.startsWith(prefix) || !/^[A-Za-z0-9_-]{16,100}$/.test(path.slice(prefix.length))) {
      fail('invalid-argument', 'Comprovante fora da pasta privada da pessoa.');
    }
    let metadata;
    try { [metadata] = await storage.bucket().file(path).getMetadata(); }
    catch (_) { fail('failed-precondition', 'Envie o comprovante antes de continuar.'); }
    if (!metadata || !Number.isFinite(Number(metadata.size)) || Number(metadata.size) <= 0
      || Number(metadata.size) > 10 * 1024 * 1024
      || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
        'application/pdf'].includes(String(metadata.contentType || '').toLowerCase())) {
      fail('failed-precondition', 'Formato ou tamanho do comprovante inválido.');
    }
    const ref = refs(tournamentId, registrationId);
    return db.runTransaction(async tx => {
      const state = await checked(tx, ref.tournament, ref.registration, tournamentId);
      const context = payment.paymentContext(state.tournament);
      if (context === 'late') {
        fail('failed-precondition', 'O envio de comprovante exige torneio antes do sorteio.');
      }
      if (state.registration.participantUid !== uid || state.registration.participantKind !== 'account') {
        fail('permission-denied', 'Apenas a pessoa inscrita envia seu comprovante.');
      }
      let methods;
      try { methods = payment.directMethods(state.tournament.registrationSettings, context); }
      catch (error) { fail('failed-precondition', error.message); }
      if (!methods || (method === 'organizer_pix' ? !methods.organizerPixKey
        : method === 'organizer_link' ? !methods.organizerPaymentUrl : true)) {
        fail('failed-precondition', 'Meio de pagamento não configurado neste torneio.');
      }
      if (state.registration.paymentState === 'proof_submitted' && state.registration.proofPath === path
        && state.registration.paymentMethod === method) {
        return { submitted:true, changed:false };
      }
      if (state.registration.paymentState === 'proof_submitted' && state.registration.proofPath === path) {
        fail('failed-precondition', 'O meio de pagamento de um comprovante enviado não pode ser trocado.');
      }
      const claim = claimRef(ref.tournament, path);
      const claimed = await tx.get(claim);
      if (claimed.exists && claimed.data().registrationId !== registrationId) {
        fail('failed-precondition', 'Este comprovante já pertence a outra inscrição.');
      }
      let next;
      try { next = payment.submittedProof(state.registration, path, method, context); }
      catch (error) { fail('failed-precondition', error.message); }
      const now = new Date().toISOString();
      tx.update(ref.registration, paymentPatch(next, now));
      if (!claimed.exists) tx.create(claim, { registrationId, participantUid:uid, proofPath:path,
        paymentMethod:method, at:now });
      tx.create(auditRef(ref.tournament, path, 'submitted'), { schema:1, registrationId,
        participantUid:uid, action:'submitted', proofPath:path, paymentMethod:method, at:now });
      notice(tx, ref.tournament, state.tournament, 'payment-proof-submitted-' + crypto.createHash('sha256').update(path).digest('hex'),
        'registration_proof_submitted', 'Comprovante enviado',
        'O comprovante da inscrição foi enviado e será conferido antes da confirmação.',
        [uid, state.tournament.creatorUid], now);
      return { submitted:true, changed:true };
    });
  }
  async function reviewProof(request) {
    const { uid, tournamentId, registrationId } = ids(request);
    const action = String(request.data && request.data.action || '');
    const evidence = String(request.data && request.data.evidence || '');
    if (!['approve', 'reject'].includes(action)) fail('invalid-argument', 'Decisão inválida.');
    const ref = refs(tournamentId, registrationId);
    return db.runTransaction(async tx => {
      const state = await checked(tx, ref.tournament, ref.registration, tournamentId);
      if (!organizer(state.tournament, uid)) fail('permission-denied', 'Só a organização confere pagamentos.');
      if (payment.paymentContext(state.tournament) === 'late') {
        fail('failed-precondition', 'A conferência manual exige torneio antes do sorteio.');
      }
      const before = state.registration;
      if (action === 'approve' && before.paymentState === 'paid') return { approved:true, changed:false };
      let next;
      try { next = action === 'approve'
        ? payment.confirmDirectPayment(before, uid, evidence)
        : payment.rejectDirectPayment(before, uid, evidence); }
      catch (error) { fail('failed-precondition', error.message); }
      const nextRoster = state.registrations.map(item => item.registrationId === registrationId ? next : item);
      try { boundary.verifiedRoster({ ...state.tournament, id:tournamentId }, nextRoster); }
      catch (error) { fail('failed-precondition', error.message); }
      const now = new Date().toISOString();
      tx.update(ref.registration, paymentPatch(next, now));
      tx.update(ref.tournament, { memberUids:boundary.memberUids(
        { ...state.tournament, id:tournamentId }, nextRoster), updatedAt:FieldValue.serverTimestamp() });
      tx.create(auditRef(ref.tournament, before.proofPath, action), { schema:1,
        registrationId, participantUid:before.participantUid, action,
        proofPath:before.proofPath, paymentMethod:before.paymentMethod || null,
        reviewedBy:uid, evidence:evidence.trim(), at:now });
      notice(tx, ref.tournament, state.tournament, 'payment-proof-' + action + '-' + crypto.createHash('sha256').update(before.proofPath).digest('hex'),
        action === 'approve' ? 'registration_payment_approved' : 'registration_payment_rejected',
        action === 'approve' ? 'Pagamento confirmado' : 'Comprovante não aceito',
        action === 'approve'
          ? (next.status === 'confirmed' ? 'O pagamento foi conferido e sua inscrição está confirmada.' : 'O pagamento foi conferido; sua categoria ainda precisa ser validada.')
          : 'O comprovante não foi aceito. Confira o pagamento e envie um novo comprovante.',
        [before.participantUid], now);
      return { approved:action === 'approve', changed:true, status:next.status };
    });
  }
  async function myPayments(request) {
    const uid = request.auth && request.auth.uid;
    const tournamentId = String(request.data && request.data.tournamentId || '');
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!/^tour_[0-9]{13}_[a-f0-9]{32}$/.test(tournamentId)) fail('invalid-argument', 'Torneio inválido.');
    const tournamentRef = db.collection('tournaments').doc(tournamentId);
    const tournamentSnap = await tournamentRef.get();
    if (!tournamentSnap.exists || tournamentSnap.data().isSandbox === true) fail('not-found', 'Torneio não encontrado.');
    const tournament = tournamentSnap.data() || {};
    let methods;
    try { methods = payment.directMethods(tournament.registrationSettings, payment.paymentContext(tournament)); }
    catch (_) { return { payments:[], paymentMethods:null }; }
    const own = await tournamentRef.collection('registrations').where('participantUid', '==', uid).get();
    const labels = new Map((tournament.categoryDefinitions || []).map(item => [item.id, item.label]));
    const payments = own.docs.map(doc => doc.data() || {})
      .filter(item => item.participantKind === 'account' && item.participantUid === uid
        && item.paymentDueCents > 0 && item.status !== 'withdrawn')
      .map(item => ({ registrationId:item.registrationId, categoryId:item.categoryId,
        category:labels.get(item.categoryId) || item.categoryId, amountCents:item.paymentDueCents,
        currency:item.paymentCurrency || 'BRL', state:item.paymentState,
        status:item.status, paymentMethod:item.paymentMethod || null,
        proofSubmitted:item.paymentState === 'proof_submitted' }));
    // A chave Pix e o link do organizador só são necessários à própria pessoa
    // cobrada. Conhecer o ID de um torneio privado não deve expô-los.
    return { paymentMethods:payments.some(item => item.state !== 'paid') ? methods : null, payments };
  }
  async function pendingProofs(request) {
    const uid = request.auth && request.auth.uid;
    const tournamentId = String(request.data && request.data.tournamentId || '');
    const cursor = String(request.data && request.data.cursor || '');
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!/^tour_[0-9]{13}_[a-f0-9]{32}$/.test(tournamentId)) fail('invalid-argument', 'Torneio inválido.');
    if (cursor && (!/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 400)) {
      fail('invalid-argument', 'Página de comprovantes inválida.');
    }
    const ref = db.collection('tournaments').doc(tournamentId);
    const snap = await ref.get();
    if (!snap.exists || snap.data().isSandbox === true) fail('not-found', 'Torneio não encontrado.');
    const tournament = snap.data() || {};
    if (!organizer(tournament, uid)) fail('permission-denied', 'Só a organização confere pagamentos.');
    const pageSize = 100;
    let query = ref.collection('registrations').where('paymentState', '==', 'proof_submitted').orderBy('__name__');
    if (cursor) {
      const cursorDoc = await ref.collection('registrations').doc(cursor).get();
      if (!cursorDoc.exists) fail('invalid-argument', 'Página de comprovantes expirada. Recarregue a lista.');
      query = query.startAfter(cursorDoc);
    }
    const pending = await query.limit(pageSize + 1).get();
    const page = pending.docs.slice(0, pageSize);
    const labels = new Map((tournament.categoryDefinitions || []).map(item => [item.id, item.label]));
    const users = await Promise.all(page.map(doc => db.collection('users').doc(String((doc.data() || {}).participantUid || 'invalid')).get()));
    return { nextCursor:pending.docs.length > pageSize ? page[page.length - 1].id : null,
      payments:page.map((doc, index) => {
      const item = doc.data() || {};
      const profile = users[index].exists ? users[index].data() || {} : {};
      return { registrationId:item.registrationId, participantUid:item.participantUid,
        participantName:String(profile.displayName || profile.name || item.participantUid || 'Participante'),
        category:labels.get(item.categoryId) || item.categoryId,
        amountCents:item.paymentDueCents, currency:item.paymentCurrency || 'BRL',
        paymentMethod:item.paymentMethod || null, proofPath:item.proofPath };
    }) };
  }
  return { submitProof, reviewProof, myPayments, pendingProofs };
}

module.exports = { makeService };
