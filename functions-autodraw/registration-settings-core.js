'use strict';

// Valores escolhidos pela organização, em centavos. Cobrança e repasse exigem
// checkout e confirmação de pagamento separados; este módulo não os simula.
function validate(value, categories) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração de inscrições inválida.');
  if (!['scoreplace', 'external'].includes(value.source)) throw new Error('Escolha a origem das inscrições.');
  if (value.source === 'external') {
    if (value.pricing != null || value.passServiceFeeToParticipant != null) throw new Error('Inscrição externa não usa valores no Scoreplace.');
    return { source:'external', pricing:null };
  }
  const pricing = value.pricing;
  if (value.passServiceFeeToParticipant != null && typeof value.passServiceFeeToParticipant !== 'boolean') {
    throw new Error('Escolha de repasse da taxa de serviço inválida.');
  }
  const passThrough = value.passServiceFeeToParticipant === true
    ? { passServiceFeeToParticipant:true } : {};
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) throw new Error('Defina os valores das inscrições.');
  const cents = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  let normalizedPricing;
  if (pricing.mode === 'single' && cents(pricing.cents)) {
    normalizedPricing = { mode:'single', cents:pricing.cents };
  } else {
    if (pricing.mode !== 'category') throw new Error('Escolha valor único ou por categoria.');
    const labels = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];
    const unique = [...new Set(labels)];
    const map = pricing.centsByCategory;
    if (!unique.length || !map || typeof map !== 'object' || Array.isArray(map) ||
        Object.keys(map).length !== unique.length ||
        unique.some(label => !Object.prototype.hasOwnProperty.call(map, label) || !cents(map[label]))) {
      throw new Error('Informe um valor válido para cada categoria atual.');
    }
    normalizedPricing = { mode:'category', centsByCategory:Object.fromEntries(unique.map(label => [label, map[label]])) };
  }
  const methods = value.paymentMethods;
  if (methods == null) return { source:'scoreplace', pricing:normalizedPricing, ...passThrough };
  if (typeof methods !== 'object' || Array.isArray(methods)) throw new Error('Meios de pagamento inválidos.');
  if (methods.organizerPixKey != null && typeof methods.organizerPixKey !== 'string'
    || methods.organizerPixName != null && typeof methods.organizerPixName !== 'string'
    || methods.organizerPixCity != null && typeof methods.organizerPixCity !== 'string'
    || methods.organizerPaymentUrl != null && typeof methods.organizerPaymentUrl !== 'string') {
    throw new Error('Meios de pagamento inválidos.');
  }
  const pixKey = String(methods.organizerPixKey || '').trim();
  const pixName = String(methods.organizerPixName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const pixCity = String(methods.organizerPixCity || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const paymentUrl = String(methods.organizerPaymentUrl || '').trim();
  if (pixKey.length > 77 || !/^[\x20-\x7e]*$/.test(pixKey) || /[<>]/.test(pixKey)) throw new Error('Chave Pix inválida.');
  if (pixKey && (!pixName || pixName.length > 25 || !/^[A-Za-z0-9 .-]+$/.test(pixName)
    || !pixCity || pixCity.length > 15 || !/^[A-Za-z0-9 .-]+$/.test(pixCity))) {
    throw new Error('Informe nome e cidade válidos do recebedor Pix.');
  }
  if (!pixKey && (pixName || pixCity)) throw new Error('Nome e cidade Pix exigem uma chave Pix.');
  if (paymentUrl) {
    let parsed;
    try { parsed = new URL(paymentUrl); } catch (_) { throw new Error('Link de pagamento inválido.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || paymentUrl.length > 2048) {
      throw new Error('O link de pagamento precisa usar HTTPS e não conter credenciais.');
    }
  }
  return { source:'scoreplace', pricing:normalizedPricing, ...passThrough,
    paymentMethods:{ organizerPixKey:pixKey, organizerPixName:pixName,
      organizerPixCity:pixCity, organizerPaymentUrl:paymentUrl } };
}

function requiresClosedEnrollment(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.source === 'external') return true;
  const pricing = value.pricing;
  if (!pricing || value.source !== 'scoreplace') return false;
  if (value.passServiceFeeToParticipant === true) return true;
  if (pricing.mode === 'single') return Number(pricing.cents) > 0;
  return pricing.mode === 'category' && Object.values(pricing.centsByCategory || {}).some(cents => Number(cents) > 0);
}

// Apenas o recebimento direto com aceite financeiro permite abrir inscrições
// pagas. O split/checkout de inscrições ainda não está ativo.
function paidDirectReady(tournament) {
  const t = tournament || {};
  const settings = t.registrationSettings;
  if (!requiresClosedEnrollment(settings) || settings.source !== 'scoreplace') return false;
  const methods = settings.paymentMethods || {};
  const hasPix = !!String(methods.organizerPixKey || '').trim();
  const pixReady = hasPix && !!String(methods.organizerPixName || '').trim()
    && !!String(methods.organizerPixCity || '').trim();
  return !!(t.billingContract && t.billingContract.schema === 1
    && t.canonicalRegistrationMigration && t.canonicalRegistrationMigration.fingerprint
    && t.billingTermsAcceptance && t.billingTermsAcceptance.hash
    && (!hasPix || pixReady)
    && (pixReady || String(methods.organizerPaymentUrl || '').trim()));
}

module.exports = { validate, requiresClosedEnrollment, paidDirectReady };
