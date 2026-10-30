'use strict';

// Decisões puras. Nenhum valor ou status financeiro enviado pelo navegador é
// aceito como confirmação; a Function deve verificar o recebimento/comprovante.
const STATES = new Set(['awaiting_payment', 'proof_submitted', 'rejected', 'paid']);

function cents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 100000000;
}

function priceForCategory(settings, definitions, categoryId) {
  if (!settings || settings.source !== 'scoreplace' || !settings.pricing) {
    throw new Error('Inscrição pelo Scoreplace não configurada.');
  }
  const pricing = settings.pricing;
  if (pricing.mode === 'single') {
    if (!cents(pricing.cents)) throw new Error('Valor de inscrição inválido.');
    return pricing.cents;
  }
  if (pricing.mode !== 'category' || !Array.isArray(definitions)) {
    throw new Error('Valores por categoria inválidos.');
  }
  const definition = definitions.find(item => item && item.id === categoryId);
  const label = definition && definition.label;
  const map = pricing.centsByCategory;
  if (!label || !map || typeof map !== 'object' || Array.isArray(map)
    || !Object.prototype.hasOwnProperty.call(map, label) || !cents(map[label])) {
    throw new Error('Categoria sem valor de inscrição configurado.');
  }
  return map[label];
}

function amountForCategory(settings, definitions, categoryId, contract) {
  const base = priceForCategory(settings, definitions, categoryId);
  if (!settings || settings.passServiceFeeToParticipant !== true) return base;
  if (!contract || contract.schema !== 1 || contract.currency !== 'BRL'
    || !cents(contract.feeCentsPerPerson)) throw new Error('Tarifa de serviço não homologada neste torneio.');
  const total = base + contract.feeCentsPerPerson;
  if (!cents(total)) throw new Error('Valor total da inscrição acima do limite.');
  return total;
}

function directMethods(settings) {
  const methods = settings && settings.paymentMethods || {};
  const pixKey = String(methods.organizerPixKey || '').trim();
  const pixName = String(methods.organizerPixName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const pixCity = String(methods.organizerPixCity || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const paymentUrl = String(methods.organizerPaymentUrl || '').trim();
  if (!pixKey && !paymentUrl) throw new Error('Configure um meio de pagamento antes de abrir inscrições pagas.');
  if (pixKey.length > 77 || !/^[\x20-\x7e]*$/.test(pixKey) || /[<>]/.test(pixKey)) {
    throw new Error('Chave Pix inválida.');
  }
  if (pixKey && (!pixName || pixName.length > 25 || !/^[A-Za-z0-9 .-]+$/.test(pixName)
    || !pixCity || pixCity.length > 15 || !/^[A-Za-z0-9 .-]+$/.test(pixCity))) {
    throw new Error('Nome e cidade do recebedor Pix inválidos.');
  }
  if (!pixKey && (pixName || pixCity)) throw new Error('Nome e cidade Pix exigem uma chave Pix.');
  if (paymentUrl) {
    let parsed;
    try { parsed = new URL(paymentUrl); }
    catch (_) { throw new Error('Link de pagamento inválido.'); }
    if (paymentUrl.length > 2048 || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new Error('O link de pagamento precisa usar HTTPS e não conter credenciais.');
    }
  }
  return { organizerPixKey:pixKey, organizerPixName:pixName,
    organizerPixCity:pixCity, organizerPaymentUrl:paymentUrl };
}

// A inclusão manual pode continuar nos torneios externos e gratuitos, mas não
// pode transformar uma inscrição paga em confirmada sem recibo de pagamento.
function paidEnrollmentRequired(settings, organizerManualRequested, isOrganizer) {
  if (!settings) return false;
  const manualAuthorized = organizerManualRequested === true && isOrganizer === true;
  if (settings.source === 'external') {
    if (!manualAuthorized) throw new Error('As inscrições deste torneio são externas.');
    return false;
  }
  if (settings.source !== 'scoreplace') throw new Error('Origem das inscrições inválida.');
  const pricing = settings.pricing;
  const paid = pricing && (pricing.mode === 'single' ? Number(pricing.cents) > 0
    : pricing.mode === 'category' && Object.values(pricing.centsByCategory || {}).some(value => Number(value) > 0))
    || settings.passServiceFeeToParticipant === true;
  if (paid && organizerManualRequested === true) {
    throw new Error('Inclusão manual em torneio pago exige confirmação auditada do recebimento. Convide a pessoa a concluir a inscrição pelo app.');
  }
  return !!paid;
}

function awaitingPayment(registration, amountCents) {
  if (!registration || !cents(amountCents) || amountCents === 0) {
    throw new Error('Inscrição paga inválida.');
  }
  if (!registration.registrationId || !registration.participantUid || registration.participantKind !== 'account') {
    throw new Error('Inscrição paga exige conta e identidade estáveis.');
  }
  if (registration.status === 'waitlisted') throw new Error('Lista de espera não é cobrada antes da vaga.');
  assertReactivationSafe(registration);
  return { ...registration, status:'pending', paymentState:'awaiting_payment',
    paymentDueCents:amountCents, paymentCurrency:'BRL', proofPath:null, paymentMethod:null,
    paymentReviewedBy:null, paymentReviewEvidence:null };
}

function assertReactivationSafe(registration) {
  if (registration && ['paid', 'proof_submitted'].includes(registration.paymentState)) {
    throw new Error('Reativação de inscrição com pagamento conferido ou em análise exige acerto financeiro assistido.');
  }
}

const FINANCIAL_FIELDS = ['paymentState', 'paymentDueCents', 'paymentCurrency', 'proofPath',
  'paymentMethod', 'paymentReviewedBy', 'paymentReviewEvidence'];
function clearedFinancialFields() {
  return Object.fromEntries(FINANCIAL_FIELDS.map(key => [key, null]));
}
function hasFinancialHistory(item) {
  return !!item && (FINANCIAL_FIELDS.some(key => item[key] !== null && item[key] !== undefined)
    || !!item.paymentTransferredToRegistrationId || !!item.reclassifiedFromRegistrationId);
}
function destinationHasActiveFinancialFields(item) {
  return !!item && FINANCIAL_FIELDS.some(key => item[key] !== null && item[key] !== undefined);
}
function prepareWithdrawal(registration) {
  if (!registration || typeof registration !== 'object') throw new Error('Inscrição inválida para retirada.');
  const state = registration.paymentState == null ? '' : String(registration.paymentState).trim();
  if (state && !STATES.has(state)) throw new Error('Estado financeiro desconhecido; retirada exige acerto financeiro assistido.');
  if (state === 'paid' || state === 'proof_submitted') {
    throw new Error('Pagamento conferido ou em análise; retirada exige acerto financeiro assistido.');
  }
  if (!state && FINANCIAL_FIELDS.some(key => registration[key] !== null && registration[key] !== undefined)) {
    throw new Error('Inscrição com dados financeiros sem estado; retirada exige acerto financeiro assistido.');
  }
  // Não houve quitação: cancela a cobrança atual. Comprovantes recusados já
  // constam em paymentAudit e não são apagados por esta transição.
  return state ? { ...registration, ...clearedFinancialFields() } : { ...registration };
}
function planReclassificationPayment(changes, originals, settings, definitions, contract) {
  const before = Array.isArray(originals) ? originals : [];
  const next = { ...changes, updates:(changes.updates || []).map(item => ({ ...item })),
    creates:(changes.creates || []).map(item => ({ ...item })) };
  const oldById = new Map(before.map(item => [item.registrationId, item]));
  const sources = next.updates.filter(item => item.status === 'withdrawn'
    && item.categoryId === changes.fromCategoryId);
  if (!sources.length) throw new Error('Inscrição de origem ausente para ajuste financeiro.');
  for (const withdrawn of sources) {
    const source = oldById.get(withdrawn.registrationId);
    if (!source || source.status === 'withdrawn') throw new Error('Inscrição de origem inválida para ajuste financeiro.');
    const destination = next.creates.concat(next.updates).find(item => item.participantKey === source.participantKey
      && item.categoryId === changes.toCategoryId && item.status !== 'withdrawn');
    if (!destination) throw new Error('Inscrição de destino ausente para ajuste financeiro.');
    const priorDestination = oldById.get(destination.registrationId);
    if (priorDestination && (priorDestination.status !== 'withdrawn'
      || destinationHasActiveFinancialFields(priorDestination))) {
      throw new Error('Categoria de destino conserva dados financeiros ativos; exige acerto antes da transferência.');
    }
    Object.assign(destination, { paymentTransferredToRegistrationId:null,
      withdrawnReason:null, validationState:source.validationState });
    if (!settings || settings.source !== 'scoreplace') {
      if (hasFinancialHistory(source)) throw new Error('Configuração financeira da inscrição não encontrada.');
      continue;
    }
    const oldPrice = source.categoryId === '__uncategorized__' ? 0
      : amountForCategory(settings, definitions, source.categoryId, contract);
    const newPrice = amountForCategory(settings, definitions, destination.categoryId, contract);
    if (!hasFinancialHistory(source) && source.status !== 'waitlisted' && oldPrice > 0) {
      throw new Error('Pagamento anterior sem estado financeiro; categoria não alterada.');
    }
    if (source.status === 'waitlisted' && !hasFinancialHistory(source)) continue;
    if (newPrice > 0 && (destination.participantKind !== 'account' || !destination.participantUid)) {
      throw new Error('Inscrição paga exige conta identificada.');
    }
    const state = source.paymentState || null;
    if (state && !STATES.has(state)) throw new Error('Estado financeiro desconhecido.');
    if (state && source.paymentCurrency && source.paymentCurrency !== 'BRL') {
      throw new Error('Moeda de pagamento anterior não homologada para esta transferência.');
    }
    if (['paid', 'proof_submitted'].includes(state) && newPrice !== source.paymentDueCents) {
      throw new Error('Categoria não alterada: há pagamento confirmado ou comprovante em análise. Nenhuma cobrança ou devolução foi feita; o acerto financeiro precisa ser concluído antes da troca.');
    }
    let financial = clearedFinancialFields();
    if (state === 'paid' || state === 'proof_submitted') {
      financial = Object.fromEntries(FINANCIAL_FIELDS.map(key => [key, source[key] === undefined ? null : source[key]]));
    } else if (newPrice > 0) {
      financial = { ...financial, paymentState:'awaiting_payment', paymentDueCents:newPrice,
        paymentCurrency:'BRL' };
      destination.status = 'pending';
    } else if (state) {
      destination.status = source.validationState === 'approved' ? 'confirmed' : 'pending';
    }
    Object.assign(withdrawn, clearedFinancialFields(), {
      paymentTransferredToRegistrationId:destination.registrationId
    });
    Object.assign(destination, financial, {
      reclassifiedFromRegistrationId:source.registrationId,
      paymentTransferredToRegistrationId:null
    });
  }
  return next;
}

function reclassificationNotices(changes, originals, definitions, tournament) {
  if (!tournament || tournament.isSandbox || tournament.notificationsMuted || tournament.organizerOnly) return [];
  const before = new Map((originals || []).map(item => [item.registrationId, item]));
  const labels = new Map((definitions || []).map(item => [item.id, item.label]));
  const destinations = (changes.creates || []).concat(changes.updates || []);
  const notices = [];
  for (const withdrawn of changes.updates || []) {
    if (withdrawn.status !== 'withdrawn' || withdrawn.categoryId !== changes.fromCategoryId) continue;
    const source = before.get(withdrawn.registrationId);
    if (!source || source.status === 'withdrawn') continue;
    const destination = destinations.find(item => item.participantKey === source.participantKey
      && item.categoryId === changes.toCategoryId && item.status !== 'withdrawn');
    if (!destination) continue;
    const priorOpen = ['awaiting_payment', 'rejected'].includes(source.paymentState)
      && cents(source.paymentDueCents) && source.paymentDueCents > 0;
    const targetName = String(labels.get(destination.categoryId) || 'nova categoria');
    if (destination.paymentState === 'awaiting_payment' && cents(destination.paymentDueCents)
      && destination.paymentDueCents > 0 && destination.participantKind === 'account'
      && destination.participantUid) {
      const value = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' })
        .format(destination.paymentDueCents / 100);
      const previous = priorOpen
        ? ' Esta cobrança substitui a anterior de ' + new Intl.NumberFormat('pt-BR',
          { style:'currency', currency:'BRL' }).format(source.paymentDueCents / 100) + '; não pague a anterior.'
        : '';
      notices.push({ sourceRegistrationId:source.registrationId, destinationRegistrationId:destination.registrationId,
        type:'registration_payment_pending', title:'Pagamento da inscrição atualizado', level:'important',
        recipients:[destination.participantUid],
        message:'Sua categoria mudou para ' + targetName + '. O valor atual da inscrição é ' + value
          + '. A vaga depende do pagamento e da conferência pela organização.' + previous });
    } else if (priorOpen && !destination.paymentState && source.participantKind === 'account'
      && source.participantUid) {
      notices.push({ sourceRegistrationId:source.registrationId, destinationRegistrationId:destination.registrationId,
        type:'category-change-result', title:'Cobrança anterior cancelada', level:'important',
        recipients:[source.participantUid],
        message:'Sua categoria mudou para ' + targetName
          + '. A cobrança anterior foi cancelada; não pague o valor antigo. Sua inscrição nesta categoria é gratuita.' });
    }
  }
  return notices;
}

function submittedProof(registration, proofPath, method) {
  const state = registration && registration.paymentState;
  if (!['awaiting_payment', 'rejected', 'proof_submitted'].includes(state)
    || registration.status !== 'pending' || !registration.participantUid) {
    throw new Error('Esta inscrição não aceita comprovante.');
  }
  const prefix = 'tournamentPaymentProofs/' + registration.tournamentId + '/' + registration.participantUid + '/';
  if (typeof proofPath !== 'string' || !proofPath.startsWith(prefix)
    || !/^[A-Za-z0-9_-]{16,100}$/.test(proofPath.slice(prefix.length))) {
    throw new Error('Comprovante fora da pasta privada da pessoa.');
  }
  if (state === 'rejected' && proofPath === registration.proofPath) {
    throw new Error('Envie um novo comprovante para revisão.');
  }
  if (!['organizer_pix', 'organizer_link'].includes(method)) {
    throw new Error('Selecione o meio usado para pagar antes de enviar o comprovante.');
  }
  return { ...registration, paymentState:'proof_submitted', proofPath,
    paymentMethod:method, paymentReviewedBy:null, paymentReviewEvidence:null };
}

function confirmDirectPayment(registration, reviewerUid, evidence) {
  if (!registration || registration.paymentState !== 'proof_submitted'
    || registration.status !== 'pending' || !cents(registration.paymentDueCents)
    || registration.paymentDueCents === 0 || !registration.proofPath) {
    throw new Error('Não há pagamento pendente de conferência.');
  }
  if (typeof reviewerUid !== 'string' || !reviewerUid.trim()
    || typeof evidence !== 'string' || evidence.trim().length < 8 || evidence.length > 500) {
    throw new Error('Conferência exige responsável e evidência.');
  }
  return { ...registration, paymentState:'paid',
    status:registration.validationState === 'approved' ? 'confirmed' : 'pending',
    paymentReviewedBy:reviewerUid.trim(), paymentReviewEvidence:evidence.trim() };
}

function rejectDirectPayment(registration, reviewerUid, evidence) {
  if (!registration || registration.paymentState !== 'proof_submitted'
    || registration.status !== 'pending' || !registration.proofPath) {
    throw new Error('Não há comprovante pendente de conferência.');
  }
  if (typeof reviewerUid !== 'string' || !reviewerUid.trim()
    || typeof evidence !== 'string' || evidence.trim().length < 8 || evidence.length > 500) {
    throw new Error('Rejeição exige responsável e motivo.');
  }
  return { ...registration, paymentState:'rejected',
    paymentReviewedBy:reviewerUid.trim(), paymentReviewEvidence:evidence.trim() };
}

function canPair(registration) {
  if (!registration || !['confirmed', 'pending'].includes(registration.status)) return false;
  if (!registration.paymentState) return true;
  return registration.paymentState === 'paid' && registration.status === 'confirmed';
}

module.exports = { STATES, FINANCIAL_FIELDS, priceForCategory, amountForCategory, directMethods, paidEnrollmentRequired, awaitingPayment,
  prepareWithdrawal,
  assertReactivationSafe, planReclassificationPayment, reclassificationNotices,
  submittedProof, confirmDirectPayment, rejectDirectPayment, canPair };
