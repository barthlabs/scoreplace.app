'use strict';

// Fonte única do compromisso financeiro, copiada ao deploy do autoDraw.
const { createHash } = require('crypto');
function hash(value) { return createHash('sha256').update(String(value)).digest('hex'); }
function termsCatalog(cfg, tournament) {
  const terms = cfg && cfg.organizerTerms;
  const contract = tournament && tournament.billingContract;
  if (!terms || typeof terms !== 'object' || !contract || contract.schema !== 1) return null;
  const fields = ['version', 'refundPolicy'];
  if (fields.some(key => typeof terms[key] !== 'string' || !terms[key].trim()
    || terms[key].length > 1000)) return null;
  const paymentMethods = tournament.registrationSettings && tournament.registrationSettings.paymentMethods || null;
  const platformReceives = !!(paymentMethods && (paymentMethods.scoreplacePix === true || paymentMethods.stripeConnect === true));
  if (terms.refundPolicy.trim().length < 20 || (platformReceives
    && (!Number.isSafeInteger(terms.payoutWithinDays) || terms.payoutWithinDays < 1
      || terms.payoutWithinDays > 365))) return null;
  const disclosure = {
    version:terms.version.trim(), currency:contract.currency,
    feeCentsPerPerson:contract.feeCentsPerPerson,
    registrationPricing:tournament.registrationSettings && tournament.registrationSettings.pricing || null,
    paymentMethods,
    ...(tournament.registrationSettings && tournament.registrationSettings.passServiceFeeToParticipant === true
      ? { passServiceFeeToParticipant:true } : {}),
    paymentDeadline:'Após fechar as inscrições e antes do sorteio',
    payoutDeadline:platformReceives
      ? 'Até ' + terms.payoutWithinDays + ' dias corridos após conciliar o pagamento'
      : 'Não se aplica: os pagamentos próprios são recebidos diretamente pela organização',
    refundPolicy:terms.refundPolicy.trim()
  };
  if (disclosure.currency !== 'BRL' || !Number.isSafeInteger(disclosure.feeCentsPerPerson)
    || disclosure.feeCentsPerPerson < 0 || disclosure.feeCentsPerPerson > 100000000) return null;
  return { ...disclosure, hash:hash(JSON.stringify(disclosure)) };
}
function termsAccepted(t, terms) {
  return !!(terms && t && t.billingTermsAcceptance
    && t.billingTermsAcceptance.hash === terms.hash
    && t.billingTermsAcceptance.version === terms.version);
}
module.exports = { termsCatalog, termsAccepted };
