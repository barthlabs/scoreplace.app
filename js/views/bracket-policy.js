/* bracket-policy.js — contrato puro da política de chave.
 *
 * Este módulo não desenha jogos. Ele torna explícita a decisão que o desenho
 * receberá: repescagem, BYE ou sobra única. Mantê-la fora de chaves.js evita
 * que uma heurística de topologia volte a escolher a política pelo organizador.
 */
(function (root) {
  'use strict';

  var POLICIES = Object.freeze({
    REPESCAGEM: 'repescagem',
    BYE: 'bye',
    SOBRA_UNICA: 'sobra_unica'
  });
  var VALID = Object.freeze([POLICIES.REPESCAGEM, POLICIES.BYE, POLICIES.SOBRA_UNICA]);

  function _isInteger(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }

  function isPowerOfTwo(n) {
    return _isInteger(n) && n > 0 && (n & (n - 1)) === 0;
  }

  function requiresPolicy(entrants) {
    if (!_isInteger(entrants) || entrants < 2) throw new Error('entrants deve ser inteiro maior ou igual a 2');
    return !isPowerOfTwo(entrants);
  }

  function assertPolicy(policy) {
    if (VALID.indexOf(policy) === -1) {
      throw new Error('política de chave inválida: ' + String(policy));
    }
    return policy;
  }

  // Escolhe entre a ordem recebida do sorteio/semeadura. Quem ainda não recebeu
  // sobra tem prioridade; quando todas as elegíveis já receberam, a menor
  // contagem vence e a própria ordem recebida desempata de forma determinística.
  function selectSurplusRecipient(eligibleIds, priorRecipients) {
    if (!Array.isArray(eligibleIds) || eligibleIds.length === 0) {
      throw new Error('sobra única exige ao menos uma equipe elegível');
    }
    var seen = Object.create(null);
    eligibleIds.forEach(function (id) {
      id = String(id || '');
      if (!id || seen[id]) throw new Error('elegíveis da sobra devem ter identificadores únicos');
      seen[id] = true;
    });
    var counts = Object.create(null);
    (priorRecipients || []).forEach(function (id) {
      id = String(id || '');
      if (id) counts[id] = (counts[id] || 0) + 1;
    });
    return eligibleIds.map(String).reduce(function (best, id) {
      if (!best) return id;
      return (counts[id] || 0) < (counts[best] || 0) ? id : best;
    }, '');
  }

  // Devolve somente a decisão de UMA rodada. O chamador continua responsável por
  // formar os confrontos e por informar quem é elegível conforme a chave viva.
  function planRound(opts) {
    opts = opts || {};
    var entrants = opts.entrants;
    if (!_isInteger(entrants) || entrants < 2) throw new Error('entrants deve ser inteiro maior ou igual a 2');
    var policy = assertPolicy(opts.policy);
    if (entrants % 2 === 0) return { action: 'normal', entrants: entrants, policy: policy };

    if (policy === POLICIES.REPESCAGEM) {
      return { action: 'repescagem', entrants: entrants, policy: policy };
    }
    if (policy === POLICIES.BYE) {
      return { action: 'bye', entrants: entrants, policy: policy };
    }
    // Três entradas na semifinal nunca recebem folga: a sobra disputa a
    // repescagem. A marca explícita evita que a UI a descreva como BYE.
    if (opts.isSemifinal === true && entrants === 3) {
      return { action: 'repescagem', entrants: entrants, policy: policy, reason: 'semifinal-com-tres' };
    }
    return {
      action: 'sobra_unica',
      entrants: entrants,
      policy: policy,
      recipientId: selectSurplusRecipient(opts.eligibleIds, opts.priorRecipients)
    };
  }

  var api = Object.freeze({
    POLICIES: POLICIES,
    VALID: VALID,
    isPowerOfTwo: isPowerOfTwo,
    requiresPolicy: requiresPolicy,
    assertPolicy: assertPolicy,
    selectSurplusRecipient: selectSurplusRecipient,
    planRound: planRound
  });
  if (root) root._bracketPolicy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
