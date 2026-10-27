'use strict';

// Valores escolhidos pela organização, em centavos. Cobrança e repasse exigem
// checkout e confirmação de pagamento separados; este módulo não os simula.
function validate(value, categories) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuração de inscrições inválida.');
  if (!['scoreplace', 'external'].includes(value.source)) throw new Error('Escolha a origem das inscrições.');
  if (value.source === 'external') {
    if (value.pricing != null) throw new Error('Inscrição externa não usa valores no Scoreplace.');
    return { source:'external', pricing:null };
  }
  const pricing = value.pricing;
  if (!pricing || typeof pricing !== 'object' || Array.isArray(pricing)) throw new Error('Defina os valores das inscrições.');
  const cents = n => Number.isSafeInteger(n) && n >= 0 && n <= 100000000;
  if (pricing.mode === 'single' && cents(pricing.cents)) return { source:'scoreplace', pricing:{ mode:'single', cents:pricing.cents } };
  if (pricing.mode !== 'category') throw new Error('Escolha valor único ou por categoria.');
  const labels = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];
  const unique = [...new Set(labels)];
  const map = pricing.centsByCategory;
  if (!unique.length || !map || typeof map !== 'object' || Array.isArray(map) ||
      Object.keys(map).length !== unique.length ||
      unique.some(label => !Object.prototype.hasOwnProperty.call(map, label) || !cents(map[label]))) {
    throw new Error('Informe um valor válido para cada categoria atual.');
  }
  return { source:'scoreplace', pricing:{ mode:'category', centsByCategory:Object.fromEntries(unique.map(label => [label, map[label]])) } };
}

function requiresClosedEnrollment(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.source === 'external') return true;
  const pricing = value.pricing;
  if (!pricing || value.source !== 'scoreplace') return false;
  if (pricing.mode === 'single') return Number(pricing.cents) > 0;
  return pricing.mode === 'category' && Object.values(pricing.centsByCategory || {}).some(cents => Number(cents) > 0);
}

module.exports = { validate, requiresClosedEnrollment };
