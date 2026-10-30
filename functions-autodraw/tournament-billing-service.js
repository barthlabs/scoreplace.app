'use strict';

const { createHash, randomUUID } = require('crypto');
const Core = require('./vendor/tournament-billing-core.js');
const { termsCatalog, termsAccepted } = require('./vendor/billing-terms-core.js');
const { simulateTournamentFees, DEFAULT_SERVICE_FEE_CENTS } = require('./tournament-fee-simulator.js');

function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function money(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 100000000; }
function fail(HttpsError, code, message) { throw new HttpsError(code, message); }
function organizer(t, uid) {
  return t && (t.creatorUid === uid || Array.isArray(t.adminUids) && t.adminUids.includes(uid));
}
function cardCatalogReady(cfg, clock) {
  const verified = Date.parse(String(cfg && cfg.cardFeeVerifiedAt || ''));
  return !!(cfg && cfg.cardEnabled === true)
    && money(cfg.cardFeeBps) && cfg.cardFeeBps < 10000
    && money(cfg && cfg.cardFixedCents) && Number.isFinite(verified)
    && verified <= clock && clock - verified <= 30 * 86400000;
}
function hasDraw(t) {
  const direct = ['matches', 'rounds', 'groups', 'phaseRounds', 'phaseGroups']
    .some(key => Array.isArray(t[key]) && t[key].length > 0);
  const split = t._nPartes && ['matches', 'rounds', 'grupos', 'groups', 'phaseRounds', 'phaseGroups']
    .some(key => Number(t._nPartes[key]) > 0);
  return direct || split || !!t.pendingDraw || !!t.drawSelectionDone || !!t.tournamentStarted;
}
function grossUp(netCents, rateBps, fixedCents) {
  if (!money(netCents) || !Number.isSafeInteger(rateBps) || rateBps < 0 || rateBps >= 10000 || !money(fixedCents)) {
    throw new Error('Tabela financeira indisponível.');
  }
  if (netCents === 0) return 0;
  const target = BigInt(netCents), rate = BigInt(rateBps), fixed = BigInt(fixedCents);
  const net = gross => gross - (gross * rate + 5000n) / 10000n - fixed;
  let low = target, high = (target + fixed) * 10000n / (10000n - rate) + 100n;
  while (low < high) {
    const mid = (low + high) / 2n;
    if (net(mid) >= target) high = mid; else low = mid + 1n;
  }
  if (low > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Valor acima do limite seguro.');
  return Number(low);
}
function sameCardSession(session, tournamentId, quote) {
  const metadata = session && session.metadata || {};
  return !!(session && /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(session.id || '')
    && session.mode === 'payment' && session.currency === 'brl'
    && session.amount_total === quote.cardCents
    && metadata.kind === 'tournament-fee'
    && metadata.tournamentId === tournamentId && metadata.quoteId === quote.quoteId
    && metadata.fingerprint === quote.fingerprint && metadata.attemptId === quote.cardAttemptId);
}

function makeService({ db, HttpsError, FieldValue, stripe, now = Date.now }) {
  const tournamentRef = id => {
    if (typeof id !== 'string' || !/^tour_[0-9]{13}_[a-f0-9]{32}$/.test(id)) {
      fail(HttpsError, 'invalid-argument', 'Torneio inválido.');
    }
    return db.collection('tournaments').doc(id);
  };
  const configRef = db.collection('billingAdminConfig').doc('active');
  async function estimate(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta para simular a cobrança.');
    const input = request.data || {}, rows = input.rows;
    if (input.currency !== 'BRL' || !Array.isArray(rows) || !rows.length || rows.length > 50
      || typeof input.passServiceFee !== 'boolean' || typeof input.passFinancialFee !== 'boolean') {
      fail(HttpsError, 'invalid-argument', 'Dados da simulação inválidos.');
    }
    let fee = DEFAULT_SERVICE_FEE_CENTS;
    if (input.tournamentId != null) {
      const snap = await tournamentRef(input.tournamentId).get();
      const tournament = snap.exists && snap.data();
      if (!organizer(tournament, uid)) fail(HttpsError, 'permission-denied', 'Só a organização acessa esta cobrança.');
      if (!tournament.billingContract || tournament.billingContract.schema !== 1) {
        fail(HttpsError, 'failed-precondition', 'Este torneio não tem cobrança retroativa.');
      }
      fee = tournament.billingContract.feeCentsPerPerson;
    }
    if (!money(fee)) fail(HttpsError, 'failed-precondition', 'Tarifa do torneio indisponível.');
    let count = 0;
    const estimates = rows.map(row => {
      if (!row || typeof row.label !== 'string' || !row.label.trim() || row.label.length > 120
        || !money(row.registrationCents) || !Number.isSafeInteger(row.participantCount)
        || row.participantCount < 0 || row.participantCount > 100000) {
        fail(HttpsError, 'invalid-argument', 'Valor ou quantidade inválidos.');
      }
      count += row.participantCount;
      if (count > 100000) fail(HttpsError, 'invalid-argument', 'Quantidade acima do limite.');
      const result = simulateTournamentFees({ currency:'BRL', registrationCents:row.registrationCents,
        participantCount:row.participantCount, serviceFeeCents:fee,
        passServiceFee:input.passServiceFee, passFinancialFee:input.passFinancialFee,
        method:{ kind:'pix_proprio', currency:'BRL', rateBps:0, fixedCents:0 } });
      if (!result.ok) fail(HttpsError, 'invalid-argument', 'Valor da simulação acima do limite.');
      return { label:row.label.trim(), participantCount:row.participantCount, ...result };
    });
    const sum = key => estimates.reduce((total, row) => total + row[key] * row.participantCount, 0);
    return { currency:'BRL', method:'pix_proprio', serviceFeeCents:fee, rows:estimates,
      totals:{ participantCount:count, chargedCents:sum('totalCents'),
        financialFeeCents:sum('financialFeeCents'), serviceFeeCents:sum('serviceFeeCents'),
        organizerCents:sum('organizerCents') } };
  }
  async function current(tx, ref, uid) {
    const snap = await tx.get(ref);
    if (!snap.exists) fail(HttpsError, 'not-found', 'Torneio não encontrado.');
    const t = snap.data() || {};
    if (!organizer(t, uid)) fail(HttpsError, 'permission-denied', 'Só a organização acessa esta cobrança.');
    if (t.isSandbox) fail(HttpsError, 'failed-precondition', 'Sandbox nunca gera cobrança.');
    if (!t.billingContract || t.billingContract.schema !== 1) {
      fail(HttpsError, 'failed-precondition', 'Torneio anterior à cobrança; não há taxa retroativa.');
    }
    return t;
  }
  async function liveSnapshot(tx, ref, t) {
    if (!t.canonicalRegistrationMigration || !t.canonicalRegistrationMigration.fingerprint) {
      fail(HttpsError, 'failed-precondition', 'Elenco canônico não confirmado.');
    }
    const docs = (await tx.get(ref.collection('registrations'))).docs.map(doc => doc.data() || {});
    if (docs.length !== Number(t.canonicalRegistrationMigration.registrationCount)) {
      fail(HttpsError, 'failed-precondition', 'Contagem de inscrições divergente.');
    }
    try {
      const snapshot = Core.rosterSnapshot(docs, t.placeholderReservations);
      return { ...snapshot, fingerprint:hash(snapshot.canonicalJson) };
    } catch (error) { fail(HttpsError, 'failed-precondition', error.message); }
  }
  function response(t) {
    return { contract:t.billingContract || null, quote:t.billingQuote || null,
      settlement:t.billingSettlement || null, pixReport:t.billingPixReport || null };
  }
  async function status(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) fail(HttpsError, 'not-found', 'Torneio não encontrado.');
      const t = snap.data() || {};
      if (!organizer(t, uid)) fail(HttpsError, 'permission-denied', 'Só a organização acessa esta cobrança.');
      const cfg = (await tx.get(configRef)).data() || {};
      const financeAdmin = !!(cfg.developerUid && uid === cfg.developerUid);
      if (t.isSandbox === true) return { sandbox:true, financeAdmin:false };
      if (!t.billingContract) return { legacy:true, financeAdmin };
      const terms = termsCatalog(cfg, t);
      const live = t.billingQuote ? await liveSnapshot(tx, ref, t) : null;
      const stale = !!(live && live.fingerprint !== t.billingQuote.fingerprint);
      let pixReport = t.billingPixReport || null;
      if (pixReport && pixReport.quoteId === t.billingQuote?.quoteId) {
        const privateSnap = await tx.get(ref.collection('billingPixReports').doc(pixReport.quoteId));
        if (privateSnap.exists) pixReport = { ...pixReport, reference:(privateSnap.data() || {}).reference || null };
      }
      return { ...response(t), terms, termsAccepted:termsAccepted(t, terms), financeAdmin,
        pixReport,
        pixAvailable:!!cfg.scoreplacePixKey,
        pixKey:cfg.scoreplacePixKey || null,
        pixReceiverName:typeof cfg.scoreplacePixName === 'string' ? cfg.scoreplacePixName : null,
        pixReceiverCity:typeof cfg.scoreplacePixCity === 'string' ? cfg.scoreplacePixCity : null,
        cardAvailable:cardCatalogReady(cfg, now()),
        cardTotalCents:t.billingQuote && cardCatalogReady(cfg, now())
          ? grossUp(t.billingQuote.totalCents, cfg.cardFeeBps, cfg.cardFixedCents) : null,
        unreviewedProofCount:live ? live.unreviewedProofCount : null,
        unsettledPaymentCount:live ? live.unsettledPaymentCount : null,
        stale };
    });
  }
  async function acceptTerms(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    return db.runTransaction(async tx => {
      const t = await current(tx, ref, uid);
      if (hasDraw(t)) fail(HttpsError, 'failed-precondition', 'As condições não podem mudar depois do sorteio.');
      const cfg = (await tx.get(configRef)).data() || {};
      const terms = termsCatalog(cfg, t);
      if (!terms) fail(HttpsError, 'failed-precondition', 'Condições financeiras ainda não configuradas.');
      if (request.data?.termsHash !== terms.hash || request.data?.termsVersion !== terms.version
        || request.data?.agree !== true) {
        fail(HttpsError, 'failed-precondition', 'Releia e aceite as condições financeiras atuais.');
      }
      if (termsAccepted(t, terms)) return { accepted:true, changed:false };
      const acceptance = { uid, version:terms.version, hash:terms.hash,
        acceptedAt:new Date(now()).toISOString() };
      tx.update(ref, { billingTermsAcceptance:acceptance,
        updatedAt:FieldValue.serverTimestamp() });
      return { accepted:true, changed:true };
    });
  }
  async function prepare(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const voucherCode = String(request.data && request.data.voucherCode || '').trim().toUpperCase();
    if (voucherCode.length > 64) fail(HttpsError, 'invalid-argument', 'Voucher inválido.');
    return db.runTransaction(async tx => {
      const t = await current(tx, ref, uid);
      if (t.status !== 'closed') fail(HttpsError, 'failed-precondition', 'Feche as inscrições antes de calcular a taxa.');
      if (t.billingSettlement?.state === 'paid') {
        fail(HttpsError, 'failed-precondition', 'Pagamento já confirmado. Uma alteração posterior do elenco exige acerto financeiro assistido.');
      }
      if (t.billingSettlement?.state === 'reversed') {
        fail(HttpsError, 'failed-precondition', 'Pagamento estornado ou contestado; é necessário acerto financeiro assistido.');
      }
      if (hasDraw(t)) {
        fail(HttpsError, 'failed-precondition', 'A cobrança não pode ser recalculada depois do sorteio.');
      }
      const cfg = (await tx.get(configRef)).data() || {};
      if (!termsAccepted(t, termsCatalog(cfg, t))) {
        fail(HttpsError, 'failed-precondition', 'Aceite as condições financeiras atuais antes de calcular a cobrança.');
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.unreviewedProofCount > 0) {
        fail(HttpsError, 'failed-precondition', 'Confira os comprovantes de inscrição pendentes antes de calcular a cobrança.');
      }
      if (live.unsettledPaymentCount > 0) {
        fail(HttpsError, 'failed-precondition', 'Resolva as inscrições aguardando pagamento ou com comprovante recusado antes de calcular a cobrança.');
      }
      let discountCents = 0, voucherHash = '';
      if (voucherCode) {
        voucherHash = hash(voucherCode);
        const voucherSnap = await tx.get(db.collection('billingVouchers').doc(voucherHash));
        const voucher = voucherSnap.exists ? voucherSnap.data() || {} : {};
        if (voucher.active !== true || !money(voucher.discountCents)
          || voucher.expiresAt && (!Number.isFinite(Date.parse(voucher.expiresAt)) || Date.parse(voucher.expiresAt) < now())
          || voucher.organizerUid && voucher.organizerUid !== uid) {
          fail(HttpsError, 'failed-precondition', 'Voucher inválido ou expirado.');
        }
        discountCents = voucher.discountCents;
      }
      const amount = Core.quote(live, t.billingContract.feeCentsPerPerson, discountCents);
      const quoteId = hash([ref.id, live.fingerprint, amount.feeCentsPerPerson,
        amount.totalCents, voucherHash].join(':'));
      if (t.billingQuote && t.billingQuote.quoteId === quoteId) return response(t);
      if (t.billingQuote?.cardAttemptId) {
        fail(HttpsError, 'failed-precondition', 'Já existe uma tentativa de cartão que pode ser paga. A conciliação financeira é necessária antes de alterar esta cobrança.');
      }
      if (t.billingPixReport?.state === 'reported') {
        fail(HttpsError, 'failed-precondition', 'Há um Pix informado aguardando conferência financeira. Não recalcule esta cobrança.');
      }
      const quote = { schema:1, quoteId, fingerprint:live.fingerprint, currency:'BRL',
        ...amount, createdAt:new Date(now()).toISOString() };
      const contract = { ...t.billingContract, quoteId };
      const settlement = amount.totalCents === 0 ? {
        state:'paid', quoteId, fingerprint:live.fingerprint, method:'waiver',
        amountCents:0, paidAt:new Date(now()).toISOString()
      } : { state:'pending', quoteId, fingerprint:live.fingerprint };
      tx.update(ref, { billingContract:contract, billingQuote:quote,
        billingSettlement:settlement, billingPixReport:FieldValue.delete(),
        updatedAt:FieldValue.serverTimestamp() });
      return { contract, quote, settlement };
    });
  }
  async function reportPix(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const reference = String(request.data && request.data.reference || '').trim();
    if (reference.length < 8 || reference.length > 120 || /[\r\n<>]/.test(reference)) {
      fail(HttpsError, 'invalid-argument', 'Informe a referência do comprovante Pix (8 a 120 caracteres).');
    }
    return db.runTransaction(async tx => {
      const t = await current(tx, ref, uid), q = t.billingQuote || {};
      if (t.status !== 'closed' || t.billingSettlement?.state !== 'pending'
        || !q.quoteId || !money(q.totalCents) || q.totalCents <= 0) {
        fail(HttpsError, 'failed-precondition', 'Não há taxa Pix pendente para este torneio.');
      }
      if (q.cardAttemptId) fail(HttpsError, 'failed-precondition', 'Há uma tentativa de cartão. Aguarde a conciliação antes de informar Pix.');
      const cfg = (await tx.get(configRef)).data() || {};
      if (!cfg.scoreplacePixKey || !termsAccepted(t, termsCatalog(cfg, t))) {
        fail(HttpsError, 'failed-precondition', 'Pix ou condições financeiras indisponíveis.');
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.fingerprint !== q.fingerprint) fail(HttpsError, 'failed-precondition', 'O elenco mudou; atualize a cobrança.');
      const prior = t.billingPixReport;
      const privateRef = ref.collection('billingPixReports').doc(q.quoteId);
      if (prior?.state === 'reported') {
        const previous = prior.quoteId === q.quoteId ? await tx.get(privateRef) : null;
        if (previous?.exists && (previous.data() || {}).reference === reference) return { reported:true, changed:false };
        fail(HttpsError, 'failed-precondition', 'Já existe um Pix informado para esta cobrança. Aguarde a conferência.');
      }
      const reportedAt = new Date(now()).toISOString();
      const report = { state:'reported', quoteId:q.quoteId, fingerprint:q.fingerprint,
        amountCents:q.totalCents, reportedAt };
      if (prior?.quoteId === q.quoteId && prior.state === 'rejected') {
        tx.update(privateRef, { reference, reportedBy:uid, reportedAt, state:'reported',
          reviewedBy:FieldValue.delete(), reviewedAt:FieldValue.delete(), reviewEvidence:FieldValue.delete() });
      } else tx.create(privateRef, { ...report, reference, reportedBy:uid });
      tx.update(ref, { billingPixReport:report, updatedAt:FieldValue.serverTimestamp() });
      return { reported:true, changed:true };
    });
  }
  async function rejectPixReport(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const evidence = String(request.data && request.data.evidence || '').trim();
    if (evidence.length < 8 || evidence.length > 500) fail(HttpsError, 'invalid-argument', 'Registre o motivo da recusa.');
    return db.runTransaction(async tx => {
      const cfg = (await tx.get(configRef)).data() || {};
      if (!cfg.developerUid || uid !== cfg.developerUid) fail(HttpsError, 'permission-denied', 'Apenas o responsável financeiro pode recusar Pix.');
      const snap = await tx.get(ref);
      if (!snap.exists) fail(HttpsError, 'not-found', 'Torneio não encontrado.');
      const t = snap.data() || {}, report = t.billingPixReport || {}, q = t.billingQuote || {};
      if (t.isSandbox || t.billingContract?.schema !== 1 || t.status !== 'closed'
        || report.state !== 'reported' || report.quoteId !== q.quoteId || t.billingSettlement?.state !== 'pending') {
        fail(HttpsError, 'failed-precondition', 'Não há Pix informado pendente de conferência.');
      }
      const reviewedAt = new Date(now()).toISOString();
      tx.update(ref.collection('billingPixReports').doc(q.quoteId), { state:'rejected', reviewedBy:uid,
        reviewedAt, reviewEvidence:evidence });
      tx.update(ref, { billingPixReport:{ ...report, state:'rejected', reviewedAt },
        updatedAt:FieldValue.serverTimestamp() });
      return { rejected:true };
    });
  }
  async function listPixReports(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const cfgSnap = await configRef.get();
    const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {};
    if (!cfg.developerUid || uid !== cfg.developerUid) {
      fail(HttpsError, 'permission-denied', 'Apenas o responsável financeiro pode conferir Pix.');
    }
    // A consulta tem uma única igualdade e não precisa de índice composto.
    // Ao concluir/recusar os primeiros itens, os seguintes entram na próxima leitura.
    const pending = await db.collection('tournaments')
      .where('billingPixReport.state', '==', 'reported').limit(30).get();
    const reports = await Promise.all(pending.docs.map(async snap => {
      const t = snap.data() || {}, report = t.billingPixReport || {}, quote = t.billingQuote || {};
      if (!/^[a-f0-9]{64}$/.test(String(report.quoteId || ''))) return null;
      const privateSnap = await snap.ref.collection('billingPixReports').doc(report.quoteId).get();
      if (!privateSnap.exists) return null;
      const privateReport = privateSnap.data() || {};
      return { tournamentId:snap.id, tournamentName:String(t.name || 'Torneio').slice(0, 120),
        quoteId:report.quoteId, amountCents:report.amountCents, reportedAt:report.reportedAt,
        reference:String(privateReport.reference || '').slice(0, 120),
        current:quote.quoteId === report.quoteId && t.billingSettlement?.state === 'pending'
          && t.status === 'closed' && t.isSandbox !== true };
    }));
    return { reports:reports.filter(Boolean), hasMore:pending.size === 30 };
  }
  async function financeAdminStatus(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const cfgSnap = await configRef.get();
    const cfg = cfgSnap.exists ? cfgSnap.data() || {} : {};
    return { financeAdmin:!!(cfg.developerUid && uid === cfg.developerUid) };
  }
  async function checkout(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const attempt = await db.runTransaction(async tx => {
      const t = await current(tx, ref, uid);
      const q = t.billingQuote;
      if (t.status !== 'closed') fail(HttpsError, 'failed-precondition', 'Feche as inscrições antes de pagar a taxa.');
      if (t.billingSettlement?.state === 'reversed') {
        fail(HttpsError, 'failed-precondition', 'Pagamento estornado ou contestado; é necessário acerto financeiro assistido.');
      }
      if (!q || !money(q.totalCents) || q.totalCents <= 0 || t.billingSettlement?.state === 'paid') {
        fail(HttpsError, 'failed-precondition', 'Não há cobrança pendente para cartão.');
      }
      if (t.billingPixReport?.state === 'reported' && t.billingPixReport.quoteId === q.quoteId) {
        fail(HttpsError, 'failed-precondition', 'Pix informado aguarda conferência. Não inicie cartão para evitar pagamento duplo.');
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.fingerprint !== q.fingerprint) fail(HttpsError, 'failed-precondition', 'O elenco mudou; atualize a cobrança.');
      const cfg = (await tx.get(configRef)).data() || {};
      if (!termsAccepted(t, termsCatalog(cfg, t))) {
        fail(HttpsError, 'failed-precondition', 'As condições financeiras mudaram; aceite a versão atual antes de pagar.');
      }
      if (!cardCatalogReady(cfg, now())) {
        fail(HttpsError, 'failed-precondition', 'Pagamento por cartão indisponível até atualizar as taxas financeiras.');
      }
      const cardCents = grossUp(q.totalCents, cfg.cardFeeBps, cfg.cardFixedCents);
      // Depois de criar uma sessão, a tentativa fica vinculada ao preço que
      // será conciliado pelo webhook. Se a tabela mudar, não reutilizar a
      // idempotência antiga com um valor novo nem abrir uma segunda sessão
      // enquanto a primeira ainda pode ser paga (risco de cobrança dupla).
      if (q.cardAttemptId && q.cardCents !== cardCents) {
        fail(HttpsError, 'failed-precondition', 'As taxas mudaram após iniciar o pagamento. Aguarde a conciliação da tentativa anterior antes de criar outra.');
      }
      const attemptId = q.cardAttemptId || randomUUID();
      const attemptAt = q.cardAttemptId ? Date.parse(String(q.cardAttemptAt || '')) : now();
      if (!q.cardSessionId && (!Number.isFinite(attemptAt) || attemptAt > now()
        || now() - attemptAt > 23 * 3600000)) {
        fail(HttpsError, 'failed-precondition', 'Tentativa sem sessão confirmada pelo Stripe após o prazo de idempotência. Solicite conciliação financeira.');
      }
      if (!q.cardAttemptId) tx.update(ref, { 'billingQuote.cardAttemptId':attemptId,
        'billingQuote.cardAttemptAt':new Date(attemptAt).toISOString(),
        'billingQuote.cardCents':cardCents, updatedAt:FieldValue.serverTimestamp() });
      return { quoteId:q.quoteId, fingerprint:q.fingerprint, attemptId, cardCents,
        cardSessionId:q.cardSessionId || null, tournamentName:String(t.name || 'Torneio').slice(0, 100) };
    });
    if (attempt.cardSessionId) {
      const existing = await stripe().checkout.sessions.retrieve(attempt.cardSessionId);
      if (!sameCardSession(existing, ref.id, { ...attempt, cardAttemptId:attempt.attemptId })
        || existing.payment_status !== 'unpaid' || existing.status !== 'open' || !existing.url) {
        fail(HttpsError, 'failed-precondition', 'A sessão do cartão não está aberta. Cancele a tentativa ou aguarde a conciliação.');
      }
      await db.runTransaction(async tx => {
        const t = await current(tx, ref, uid), q = t.billingQuote || {};
        if (t.status !== 'closed' || t.billingSettlement?.state !== 'pending'
          || q.quoteId !== attempt.quoteId || q.fingerprint !== attempt.fingerprint
          || q.cardAttemptId !== attempt.attemptId || q.cardSessionId !== existing.id
          || q.cardCents !== attempt.cardCents) {
          fail(HttpsError, 'failed-precondition', 'A cobrança mudou durante a retomada do checkout.');
        }
      });
      return { url:existing.url, sessionId:existing.id };
    }
    const session = await stripe().checkout.sessions.create({
      mode:'payment', payment_method_types:['card'],
      line_items:[{ price_data:{ currency:'brl', unit_amount:attempt.cardCents,
        product_data:{ name:'Taxa Scoreplace — ' + attempt.tournamentName } }, quantity:1 }],
      payment_intent_data:{ metadata:{ kind:'tournament-fee', tournamentId:ref.id,
        quoteId:attempt.quoteId, fingerprint:attempt.fingerprint, attemptId:attempt.attemptId } },
      success_url:'https://scoreplace.app/#tournaments/' + encodeURIComponent(ref.id),
      cancel_url:'https://scoreplace.app/#tournaments/' + encodeURIComponent(ref.id),
      metadata:{ kind:'tournament-fee', tournamentId:ref.id, quoteId:attempt.quoteId,
        fingerprint:attempt.fingerprint, attemptId:attempt.attemptId }
    }, { idempotencyKey:'tournament-fee-' + attempt.attemptId });
    if (!sameCardSession(session, ref.id, { ...attempt, cardAttemptId:attempt.attemptId })
      || session.payment_status !== 'unpaid' || session.status !== 'open' || !session.url) {
      fail(HttpsError, 'failed-precondition', 'A sessão do cartão não foi confirmada pelo Stripe.');
    }
    await db.runTransaction(async tx => {
      const t = await current(tx, ref, uid), q = t.billingQuote || {};
      if (t.status !== 'closed' || t.billingSettlement?.state !== 'pending'
        || q.quoteId !== attempt.quoteId || q.fingerprint !== attempt.fingerprint
        || q.cardAttemptId !== attempt.attemptId || q.cardCents !== attempt.cardCents
        || q.cardSessionId && q.cardSessionId !== session.id) {
        fail(HttpsError, 'failed-precondition', 'A cobrança mudou durante a criação do checkout. Aguarde conciliação.');
      }
      if (!q.cardSessionId) tx.update(ref, { 'billingQuote.cardSessionId':session.id,
        updatedAt:FieldValue.serverTimestamp() });
    });
    return { url:session.url, sessionId:session.id };
  }
  async function cancelCardAttempt(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const attempt = await db.runTransaction(async tx => {
      const t = await current(tx, ref, uid), q = t.billingQuote || {};
      if (t.status !== 'closed' || t.billingSettlement?.state !== 'pending'
        || !q.quoteId || !q.fingerprint || !q.cardAttemptId || !q.cardSessionId || !money(q.cardCents)) {
        fail(HttpsError, 'failed-precondition', 'Não há tentativa de cartão cancelável.');
      }
      return { quoteId:q.quoteId, fingerprint:q.fingerprint, cardAttemptId:q.cardAttemptId,
        cardSessionId:q.cardSessionId, cardCents:q.cardCents };
    });
    const session = await stripe().checkout.sessions.retrieve(attempt.cardSessionId);
    if (!sameCardSession(session, ref.id, attempt) || session.payment_status !== 'unpaid') {
      fail(HttpsError, 'failed-precondition', 'Sessão de cartão divergente ou pagamento iniciado. É necessária conciliação financeira.');
    }
    let expired = session;
    if (session.status === 'open') {
      try { expired = await stripe().checkout.sessions.expire(session.id); }
      catch (_) { fail(HttpsError, 'failed-precondition', 'Não foi possível expirar a sessão. Aguarde a conciliação financeira.'); }
    }
    if (!sameCardSession(expired, ref.id, attempt) || expired.status !== 'expired'
      || expired.payment_status !== 'unpaid') {
      fail(HttpsError, 'failed-precondition', 'O Stripe não confirmou a expiração da sessão.');
    }
    return db.runTransaction(async tx => {
      const t = await current(tx, ref, uid), q = t.billingQuote || {};
      if (t.status !== 'closed' || t.billingSettlement?.state !== 'pending'
        || q.quoteId !== attempt.quoteId || q.fingerprint !== attempt.fingerprint
        || q.cardAttemptId !== attempt.cardAttemptId || q.cardSessionId !== attempt.cardSessionId
        || q.cardCents !== attempt.cardCents) {
        fail(HttpsError, 'failed-precondition', 'A cobrança mudou. A tentativa não foi liberada.');
      }
      const canceledAt = new Date(now()).toISOString();
      tx.update(ref, { 'billingQuote.cardAttemptId':FieldValue.delete(),
        'billingQuote.cardAttemptAt':FieldValue.delete(),
        'billingQuote.cardCents':FieldValue.delete(),
        'billingQuote.cardSessionId':FieldValue.delete(),
        updatedAt:FieldValue.serverTimestamp() });
      tx.create(ref.collection('billingCardAttempts').doc(attempt.cardAttemptId), {
        ...attempt, status:'expired', canceledAt, canceledBy:uid });
      return { canceled:true };
    });
  }
  async function confirmPix(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const evidence = String(request.data && request.data.evidence || '').trim();
    if (evidence.length < 8 || evidence.length > 500) fail(HttpsError, 'invalid-argument', 'Informe o comprovante verificável.');
    return db.runTransaction(async tx => {
      const cfg = (await tx.get(configRef)).data() || {};
      if (!cfg.developerUid || uid !== cfg.developerUid) fail(HttpsError, 'permission-denied', 'Apenas o responsável financeiro pode confirmar Pix.');
      const snap = await tx.get(ref);
      if (!snap.exists) fail(HttpsError, 'not-found', 'Torneio não encontrado.');
      const t = snap.data(), q = t.billingQuote;
      if (t.status !== 'closed') fail(HttpsError, 'failed-precondition', 'As inscrições ainda não foram encerradas.');
      if (t.isSandbox === true || !t.billingContract || !q || !q.quoteId || q.totalCents <= 0) {
        fail(HttpsError, 'failed-precondition', 'Não há cobrança pendente.');
      }
      if (t.billingSettlement?.state === 'reversed' || q.cardAttemptId) {
        fail(HttpsError, 'failed-precondition', 'Há uma tentativa de cartão ou estorno pendente de conciliação. Não confirme Pix nesta cobrança.');
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.fingerprint !== q.fingerprint) fail(HttpsError, 'failed-precondition', 'O elenco mudou; atualize a cobrança.');
      if (t.billingSettlement?.state === 'paid' && t.billingSettlement.quoteId === q.quoteId) return { paid:true, changed:false };
      const privateReportSnap = t.billingPixReport?.quoteId === q.quoteId
        ? await tx.get(ref.collection('billingPixReports').doc(q.quoteId)) : null;
      const paidAt = new Date(now()).toISOString();
      const settlement = { state:'paid', quoteId:q.quoteId, fingerprint:q.fingerprint,
        amountCents:q.totalCents, currency:'BRL', method:'pix_manual', paidAt };
      const confirmedReport = t.billingPixReport?.state === 'reported'
        && t.billingPixReport.quoteId === q.quoteId && privateReportSnap?.exists;
      if (confirmedReport) {
        tx.update(ref.collection('billingPixReports').doc(q.quoteId), {
          state:'confirmed', reviewedBy:uid, reviewedAt:paidAt, reviewEvidence:evidence });
      }
      tx.update(ref, { billingSettlement:settlement,
        ...(confirmedReport ? { billingPixReport:{ ...t.billingPixReport, state:'confirmed', reviewedAt:paidAt } } : {}),
        updatedAt:FieldValue.serverTimestamp() });
      tx.create(ref.collection('billingReceipts').doc(q.quoteId),
        { ...settlement, tournamentId:ref.id, evidence, approvedBy:uid,
          reportedReference:confirmedReport ? (privateReportSnap.data() || {}).reference || null : null });
      return { paid:true, changed:true };
    });
  }
  async function reconcileReversedTournamentFee(request) {
    const uid = request.auth && request.auth.uid;
    if (!uid) fail(HttpsError, 'unauthenticated', 'Entre na sua conta.');
    const ref = tournamentRef(request.data && request.data.tournamentId);
    const reference = String(request.data && request.data.reference || '').trim();
    const evidence = String(request.data && request.data.evidence || '').trim();
    const receivedCents = request.data && request.data.receivedCents;
    if (reference.length < 8 || reference.length > 120 || /[\r\n<>]/.test(reference)
      || evidence.length < 8 || evidence.length > 500 || !money(receivedCents) || receivedCents <= 0) {
      fail(HttpsError, 'invalid-argument', 'Referência, valor ou evidência da reposição Pix inválidos.');
    }
    const referenceHash = hash(reference);
    const referenceRef = db.collection('billingPixRecoveryReferences').doc(referenceHash);
    return db.runTransaction(async tx => {
      const cfg = (await tx.get(configRef)).data() || {};
      if (!cfg.developerUid || uid !== cfg.developerUid) {
        fail(HttpsError, 'permission-denied', 'Apenas o responsável financeiro pode regularizar um estorno.');
      }
      const snap = await tx.get(ref);
      if (!snap.exists) fail(HttpsError, 'not-found', 'Torneio não encontrado.');
      const t = snap.data() || {}, settlement = t.billingSettlement || {}, q = t.billingQuote || {};
      if (t.isSandbox === true || t.billingContract?.schema !== 1) {
        fail(HttpsError, 'failed-precondition', 'Este torneio não admite cobrança retroativa.');
      }
      if (settlement.state === 'paid' && settlement.method === 'pix_manual_recovery') {
        if (settlement.recoveryReferenceHash === referenceHash
          && settlement.amountCents === receivedCents) return { paid:true, changed:false };
        fail(HttpsError, 'failed-precondition', 'Esta reversão já foi regularizada com outra referência.');
      }
      if (settlement.state !== 'reversed' || settlement.method !== 'stripe_card'
        || !/^pi_[A-Za-z0-9]+$/.test(settlement.paymentIntentId || '')
        || !/^[a-f0-9]{64}$/.test(q.quoteId || '')
        || settlement.quoteId !== q.quoteId || t.billingContract.quoteId !== q.quoteId) {
        fail(HttpsError, 'failed-precondition', 'Não há estorno de cartão conciliável para esta cobrança.');
      }
      const reversalRef = db.collection('billingReversals').doc(settlement.paymentIntentId);
      const reversalSnap = await tx.get(reversalRef);
      const reversal = reversalSnap.exists ? reversalSnap.data() || {} : {};
      const originalReceiptSnap = await tx.get(ref.collection('billingReceipts').doc(q.quoteId));
      const originalReceipt = originalReceiptSnap.exists ? originalReceiptSnap.data() || {} : {};
      const usedReference = await tx.get(referenceRef);
      if (usedReference.exists || reversal.tournamentId !== ref.id
        || reversal.quoteId !== q.quoteId || reversal.paymentIntentId !== settlement.paymentIntentId
        || originalReceipt.paymentIntentId !== settlement.paymentIntentId
        || originalReceipt.quoteId !== q.quoteId || !money(originalReceipt.chargedCents)
        || originalReceipt.chargedCents <= 0) {
        fail(HttpsError, 'failed-precondition', 'Trilha financeira divergente; regularização assistida necessária.');
      }
      // Consultas somente leitura, repetidas se o Firestore reexecutar a transação.
      // O estado do Stripe pode mudar após esta leitura; não há atomicidade entre sistemas.
      let intent, charge;
      try {
        intent = await stripe().paymentIntents.retrieve(settlement.paymentIntentId);
        const chargeId = typeof intent.latest_charge === 'string' ? intent.latest_charge : intent.latest_charge?.id;
        if (!/^ch_[A-Za-z0-9]+$/.test(chargeId || '')) throw new Error('Charge ausente');
        charge = await stripe().charges.retrieve(chargeId);
      } catch (_) {
        fail(HttpsError, 'unavailable', 'Não foi possível conferir o estorno no Stripe. Nenhuma quitação foi gravada.');
      }
      const metadata = intent.metadata || {};
      const chargeIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
      if (intent.id !== settlement.paymentIntentId || metadata.kind !== 'tournament-fee'
        || metadata.tournamentId !== ref.id || metadata.quoteId !== q.quoteId
        || chargeIntentId !== intent.id || charge.currency !== 'brl'
        || charge.refunded !== true || charge.disputed !== false
        || !money(charge.amount) || charge.amount !== originalReceipt.chargedCents
        || charge.amount_refunded !== charge.amount) {
        fail(HttpsError, 'failed-precondition', 'O estorno integral e sem disputa não foi confirmado no Stripe.');
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.unreviewedProofCount > 0 || live.unsettledPaymentCount > 0) {
        fail(HttpsError, 'failed-precondition', 'Resolva as inscrições com pagamento pendente antes da regularização.');
      }
      let amount;
      try { amount = Core.quote(live, t.billingContract.feeCentsPerPerson, q.discountCents || 0); }
      catch (_) { fail(HttpsError, 'failed-precondition', 'Não foi possível calcular a dívida atual.'); }
      if (amount.totalCents !== receivedCents) {
        fail(HttpsError, 'failed-precondition', 'O Pix recebido não corresponde à dívida atual do torneio.');
      }
      const quoteId = hash(['recovery', ref.id, q.quoteId, settlement.paymentIntentId,
        live.fingerprint, amount.totalCents, referenceHash].join(':'));
      const paidAt = new Date(now()).toISOString();
      const quote = { schema:1, quoteId, fingerprint:live.fingerprint, currency:'BRL',
        ...amount, recoveryOf:q.quoteId, createdAt:paidAt };
      const recovered = { state:'paid', quoteId, fingerprint:live.fingerprint,
        amountCents:receivedCents, currency:'BRL', method:'pix_manual_recovery', paidAt,
        recoveryOf:q.quoteId, recoveredPaymentIntentId:settlement.paymentIntentId,
        recoveryReferenceHash:referenceHash };
      tx.create(referenceRef, { tournamentId:ref.id, paymentIntentId:settlement.paymentIntentId,
        quoteId, recordedAt:paidAt });
      tx.create(ref.collection('billingReceipts').doc(quoteId), {
        ...recovered, tournamentId:ref.id, reference, evidence, approvedBy:uid });
      tx.update(ref, { billingQuote:quote,
        billingContract:{ ...t.billingContract, quoteId }, billingSettlement:recovered,
        updatedAt:FieldValue.serverTimestamp() });
      return { paid:true, changed:true };
    });
  }
  async function webhookEvent(event) {
    if (event && ['charge.refunded', 'charge.dispute.created'].includes(event.type)) {
      return reverseCardSettlement(event);
    }
    if (!event || !['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return { ignored:true };
    const session = event.data && event.data.object || {};
    if (session.payment_status !== 'paid') return { ignored:true };
    const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId || '')) throw new Error('Checkout pago sem PaymentIntent identificável.');
    const metadata = session.metadata || {}, ref = tournamentRef(metadata.tournamentId);
    if (!event.id || !/^evt_[A-Za-z0-9]+$/.test(event.id)) throw new Error('Evento Stripe sem ID válido.');
    const eventRef = db.collection('billingPaymentEvents').doc(event.id);
    const reversalRef = db.collection('billingReversals').doc(paymentIntentId);
    return db.runTransaction(async tx => {
      const prior = await tx.get(eventRef);
      if (prior.exists) return { duplicate:true };
      const reversal = await tx.get(reversalRef);
      if (reversal.exists) {
        tx.create(eventRef, { tournamentId:ref.id, sessionId:session.id || '',
          quoteId:metadata.quoteId, paymentIntentId, status:'reversal_before_confirmation',
          eventType:event.type, receivedAt:FieldValue.serverTimestamp() });
        return { reviewRequired:true };
      }
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Torneio da cobrança inexistente.');
      const t = snap.data(), q = t.billingQuote;
      if (t.billingSettlement?.state === 'paid' && t.billingSettlement.quoteId === metadata.quoteId
        && t.billingSettlement.sessionId === session.id) {
        tx.create(eventRef, { tournamentId:ref.id, sessionId:session.id,
          quoteId:metadata.quoteId, status:'already_applied', eventType:event.type,
          receivedAt:FieldValue.serverTimestamp() });
        return { duplicate:true };
      }
      const valid = t.isSandbox !== true && t.status === 'closed' && t.billingContract?.schema === 1 && q
        && sameCardSession(session, ref.id, q)
        && (!q.cardSessionId || q.cardSessionId === session.id)
        && t.billingSettlement?.state !== 'paid';
      if (!valid) {
        tx.create(eventRef, { tournamentId:ref.id, sessionId:session.id || '',
          status:'review_required', eventType:event.type, receivedAt:FieldValue.serverTimestamp() });
        return { reviewRequired:true };
      }
      const live = await liveSnapshot(tx, ref, t);
      if (live.fingerprint !== q.fingerprint) {
        tx.create(eventRef, { tournamentId:ref.id, sessionId:session.id || '',
          status:'stale_roster', eventType:event.type, receivedAt:FieldValue.serverTimestamp() });
        return { reviewRequired:true };
      }
      const paidAt = new Date(now()).toISOString();
      const settlement = { state:'paid', quoteId:q.quoteId, fingerprint:q.fingerprint,
        amountCents:q.totalCents, chargedCents:session.amount_total,
        currency:'BRL', method:'stripe_card', sessionId:session.id, paymentIntentId,
        eventId:event.id, paidAt };
      tx.update(ref, { billingSettlement:settlement, updatedAt:FieldValue.serverTimestamp() });
      tx.create(eventRef, { tournamentId:ref.id, sessionId:session.id,
        quoteId:q.quoteId, status:'applied', eventType:event.type,
        receivedAt:FieldValue.serverTimestamp() });
      tx.create(ref.collection('billingReceipts').doc(q.quoteId), { ...settlement, tournamentId:ref.id });
      return { paid:true };
    });
  }
  async function reverseCardSettlement(event) {
    if (!event.id || !/^evt_[A-Za-z0-9]+$/.test(event.id)) throw new Error('Evento Stripe sem ID válido.');
    const object = event.data && event.data.object || {};
    if (event.type === 'charge.refunded' && !(Number(object.amount_refunded) > 0)) return { ignored:true };
    let paymentIntentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
    if (!paymentIntentId && typeof object.charge === 'string') {
      const charge = await stripe().charges.retrieve(object.charge);
      paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    }
    if (!paymentIntentId) return { ignored:true };
    if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) throw new Error('PaymentIntent inválido no estorno.');
    const intent = await stripe().paymentIntents.retrieve(paymentIntentId);
    const metadata = intent.metadata || {};
    if (metadata.kind !== 'tournament-fee') return { ignored:true };
    const ref = tournamentRef(metadata.tournamentId);
    const eventRef = db.collection('billingPaymentEvents').doc(event.id);
    const reversalRef = db.collection('billingReversals').doc(paymentIntentId);
    return db.runTransaction(async tx => {
      if ((await tx.get(eventRef)).exists) return { duplicate:true };
      const reversal = await tx.get(reversalRef);
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Torneio da cobrança estornada inexistente.');
      const t = snap.data() || {}, settlement = t.billingSettlement || {};
      const matches = settlement.method === 'stripe_card' && settlement.state === 'paid'
        && settlement.paymentIntentId === paymentIntentId && settlement.quoteId === metadata.quoteId;
      const at = new Date(now()).toISOString();
      const reversalUpdate = { tournamentId:ref.id, quoteId:metadata.quoteId,
        paymentIntentId, lastEventId:event.id, lastEventType:event.type, updatedAt:at,
        ...(event.type === 'charge.refunded' ? {
          amountRefundedCents:Number(object.amount_refunded),
          ...(money(Number(object.amount)) ? { amountCents:Number(object.amount) } : {}),
          ...(typeof object.currency === 'string' ? { currency:object.currency } : {})
        } : { disputed:true }) };
      if (!reversal.exists) tx.create(reversalRef, { ...reversalUpdate,
        firstEventId:event.id, firstEventType:event.type, at });
      else tx.update(reversalRef, reversalUpdate);
      if (matches) tx.update(ref, { billingSettlement:{ ...settlement, state:'reversed',
        reversalEventId:event.id, reversalType:event.type, reversedAt:at,
        needsReview:hasDraw(t) }, updatedAt:FieldValue.serverTimestamp() });
      tx.create(eventRef, { tournamentId:ref.id, quoteId:metadata.quoteId,
        paymentIntentId, status:matches ? 'reversed' : 'review_required',
        eventType:event.type, receivedAt:FieldValue.serverTimestamp() });
      return { reversed:matches, reviewRequired:!matches };
    });
  }
  return { status, estimate, acceptTerms, prepare, reportPix, rejectPixReport, listPixReports, financeAdminStatus,
    checkout, cancelCardAttempt, confirmPix, reconcileReversedTournamentFee, webhookEvent };
}

module.exports = { makeService, grossUp, cardCatalogReady, hasDraw, termsCatalog, termsAccepted };
