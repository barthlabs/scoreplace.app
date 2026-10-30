'use strict';

// Pure estimate. The caller, not this module, is responsible for sourcing and
// authorizing the service fee and the dated financial-rate catalog.
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const DEFAULT_SERVICE_FEE_CENTS = 2000;
const FINANCIAL_KINDS = new Set(['card_domestic', 'card_international', 'stripe_pix', 'boleto']);

function integer(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function result(value) {
  if (value > MAX || value < -MAX) return null;
  return Number(value);
}

function simulateTournamentFees(input) {
  if (!input || typeof input !== 'object') return { ok:false, reason:'invalid_input' };
  const { currency, registrationCents, participantCount, serviceFeeCents,
    passFinancialFee, passServiceFee, method } = input;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)
    || !integer(registrationCents) || !integer(participantCount) || !integer(serviceFeeCents)
    || typeof passFinancialFee !== 'boolean' || typeof passServiceFee !== 'boolean') {
    return { ok:false, reason:'invalid_input' };
  }

  const base = BigInt(registrationCents);
  const service = BigInt(serviceFeeCents);
  const count = BigInt(participantCount);
  let total = 0n;
  let financial = 0n;

  // A free entry does not initiate a payment, even when a selected payment
  // method normally has a fixed processor fee. The service obligation remains.
  if (base !== 0n || (passServiceFee && service !== 0n)) {
    if (!method || typeof method !== 'object') return { ok:false, reason:'catalog_missing' };
    if (method.kind !== 'pix_proprio' && !FINANCIAL_KINDS.has(method.kind)) {
      return { ok:false, reason:'invalid_input' };
    }
    if (method.currency !== currency) return { ok:false, reason:'invalid_input' };
    if (!integer(method.rateBps) || method.rateBps >= 10000 || !integer(method.fixedCents)) {
      return { ok:false, reason:'invalid_input' };
    }
    if (method.kind === 'pix_proprio') {
      if (currency !== 'BRL' || method.rateBps !== 0 || method.fixedCents !== 0) {
        return { ok:false, reason:'invalid_input' };
      }
    } else if (typeof method.version !== 'string' || !method.version.trim()
      || typeof method.verifiedAt !== 'string' || !method.verifiedAt.trim()) {
      return { ok:false, reason:'catalog_missing' };
    }

    const rate = BigInt(method.rateBps);
    const fixed = BigInt(method.fixedCents);
    const target = base + (passServiceFee ? service : 0n);
    if (target > MAX) return { ok:false, reason:'overflow' };
    const fee = (cents) => (cents * rate + 5000n) / 10000n + fixed;

    if (!passFinancialFee || target === 0n) {
      total = target;
    } else {
      const denominator = 10000n - rate;
      let low = target + fixed;
      let high = ((target + fixed) * 10000n + 5000n + denominator - 1n) / denominator;
      if (low > MAX) return { ok:false, reason:'overflow' };
      if (high > MAX) high = MAX;
      if (high - fee(high) < target) return { ok:false, reason:'overflow' };
      while (low < high) {
        const middle = (low + high) / 2n;
        if (middle - fee(middle) >= target) high = middle;
        else low = middle + 1n;
      }
      total = low;
    }
    financial = total === 0n ? 0n : fee(total);
  }

  const organizer = total - financial - service;
  const output = {
    ok:true,
    currency,
    totalCents:result(total),
    financialFeeCents:result(financial),
    serviceFeeCents:serviceFeeCents,
    organizerCents:result(organizer),
    eventOrganizerCents:result(organizer * count),
    eventServiceCents:result(service * count),
    eventFinancialCents:result(financial * count),
  };
  if (Object.values(output).some((value) => value === null)) return { ok:false, reason:'overflow' };
  return output;
}

module.exports = { simulateTournamentFees, DEFAULT_SERVICE_FEE_CENTS };
