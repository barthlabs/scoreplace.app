'use strict';

// O cliente informa somente a intenção. O servidor relê jogos e classificação
// do documento fresco e decide novamente dentro da transação.
function decide(t, complete, engine, requestedIds) {
  if (requestedIds != null && (!Array.isArray(requestedIds) || requestedIds.length > 128 ||
      requestedIds.some(id => typeof id !== 'string' || !id.trim()) ||
      new Set(requestedIds).size !== requestedIds.length)) {
    return { ok: false, reason: 'invalid-argument' };
  }
  const accepted = (requestedIds || []).slice().sort();
  if (complete) return accepted.length
    ? { ok: false, reason: 'seed-choice-stale' }
    : { ok: true, ignoredPendingIds: [], seedChoiceAccepted: false };
  if (!engine || typeof engine.pendingMatches !== 'function' ||
      typeof engine.pendingIrrelevantForAdvance !== 'function' ||
      typeof engine.pendingSeedOnlyForAdvance !== 'function') {
    return { ok: false, reason: 'phase-incomplete' };
  }
  const pending = engine.pendingMatches(t);
  const ids = pending.map(item => item && item.match && item.match.id).filter(Boolean).map(String);
  if (engine.pendingIrrelevantForAdvance(t)) {
    return accepted.length
      ? { ok: false, reason: 'seed-choice-stale' }
      : { ok: true, ignoredPendingIds: ids, seedChoiceAccepted: false };
  }
  const seedOnly = engine.pendingSeedOnlyForAdvance(t).map(String).sort();
  if (!seedOnly.length) return { ok: false, reason: accepted.length ? 'seed-choice-stale' : 'phase-incomplete' };
  if (JSON.stringify(accepted) !== JSON.stringify(seedOnly)) {
    return { ok: false, reason: accepted.length ? 'seed-choice-stale' : 'seed-choice-required',
      pendingMatchIds: seedOnly };
  }
  return { ok: true, ignoredPendingIds: ids, seedChoiceAccepted: true };
}

function isFrozenMatch(t, matchId) {
  return !!(t && Array.isArray(t.history) && t.history.some(entry =>
    entry && entry.seedChoiceAccepted === true &&
    Array.isArray(entry.ignoredPendingMatchIds) &&
    entry.ignoredPendingMatchIds.some(id => String(id) === String(matchId))));
}

module.exports = { decide, isFrozenMatch };
