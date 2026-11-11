'use strict';

// Chama a próxima simples pendente na primeira quadra realmente livre. A
// decisão fica no documento do torneio e participa da mesma transação do placar.
function callPending(t, regularMatches, released, occupiesCourt, nowIso) {
  const courts = Array.isArray(t && t.courtNames) && t.courtNames.length
    ? t.courtNames.map(String)
    : Array.from({ length: Math.max(0, Number(t && t.courtCount) || 0) }, (_, i) => 'Quadra ' + (i + 1));
  if (!courts.length) return [];
  const busy = new Set((regularMatches || []).filter(m => m && !((released || {})[String(m.id)]) && occupiesCourt(m))
    .map(m => String(m.court)));
  const activeKeys = new Set();
  const books = t && t.phaseTieDecisions || {};
  Object.values(books).forEach(book => Object.values(book || {}).forEach(decision => {
    (decision && decision.matches || []).forEach(m => {
      if (!m || !m.courtCalledAt || m.courtReleasedAt || m.winnerKey) return;
      busy.add(String(m.court));
      if (m.p1 && m.p1.key) activeKeys.add(m.p1.key);
      if (m.p2 && m.p2.key) activeKeys.add(m.p2.key);
    });
  }));
  const current = books[String(Number(t && t.currentPhaseIndex || 0))] || {};
  const pending = Object.entries(current).filter(([, d]) => d && d.choice === 'play' && d.status === 'pending')
    .sort((a, b) => String(a[1].createdAt || '').localeCompare(String(b[1].createdAt || '')) ||
      Number(a[1].baseGameNumber || 0) - Number(b[1].baseGameNumber || 0) || a[0].localeCompare(b[0]));
  const called = [];
  pending.forEach(([decisionId, decision]) => {
    const next = (decision.matches || []).find(m => m && !m.winnerKey);
    if (!next || next.courtCalledAt || next.callCancelledAt ||
        activeKeys.has(next.p1 && next.p1.key) || activeKeys.has(next.p2 && next.p2.key)) return;
    const court = courts.find(name => !busy.has(name));
    if (!court) return;
    next.court = court;
    next.courtCalledAt = String(nowIso);
    busy.add(court);
    if (next.p1 && next.p1.key) activeKeys.add(next.p1.key);
    if (next.p2 && next.p2.key) activeKeys.add(next.p2.key);
    called.push({ decisionId, matchId: next.id, court });
  });
  return called;
}

module.exports = { callPending };
