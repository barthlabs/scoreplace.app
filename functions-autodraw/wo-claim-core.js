'use strict';

// Núcleo puro do consenso de W.O.  Não conhece Firestore nem DOM: recebe o
// contexto já lido do documento fresco e devolve a intenção de motor que a CF
// deve executar dentro da mesma transação.
function claimsOf(t) {
  if (!Array.isArray(t.woClaims)) t.woClaims = [];
  return t.woClaims;
}
function claimOf(t, id) { return claimsOf(t).find(c => c && String(c.id) === String(id)) || null; }
function unique(values) { return [...new Set((values || []).filter(Boolean).map(String))]; }
function isMember(ctx, uid) { return (ctx.memberUids || []).map(String).includes(String(uid || '')); }
function confirmers(ctx, claim) {
  const absent = new Set((claim.absentUids || []).map(String));
  return unique(ctx.memberUids).filter(uid => uid !== String(claim.byUid || '') && !absent.has(uid));
}
function outcomeContext(t, claim, ctx) {
  if (!claim || claim.scope !== 'match' || !ctx || !ctx.match || !ctx.matchSides) return null;
  if ((t.woScope || 'individual') !== 'individual' || ctx.isLeague) return null;
  const absent = new Set((claim.absentUids || []).map(String));
  const side = Object.keys(ctx.matchSides).find(key => (ctx.matchSides[key].uids || []).some(uid => absent.has(String(uid))));
  if (!side) return null;
  const own = ctx.matchSides[side];
  if ((own.uids || []).length < 2 || (own.uids || []).every(uid => absent.has(String(uid)))) return null;
  const opposite = side === 'p1' ? 'p2' : 'p1';
  const opp = ctx.matchSides[opposite];
  if (!opp || !opp.name || opp.name === 'TBD' || opp.name === 'BYE') return null;
  const partnerUid = (own.uids || []).map(String).find(uid => !absent.has(uid));
  return partnerUid ? { partnerUid, oppUids: unique(opp.uids), oppName: opp.name, matchId: ctx.match.id } : null;
}

function transition(t, input) {
  const action = String(input.action || '');
  const uid = String(input.uid || '');
  const ctx = input.context || null;
  const admin = !!input.isAdmin;
  const now = input.now || new Date().toISOString();
  if (!uid) return { ok: false, reason: 'unauthenticated' };
  if (action === 'declare') {
    if (!ctx || !isMember(ctx, uid) && !admin) return { ok: false, reason: 'permission-denied' };
    const absentUid = String(input.absentUid || '');
    const absentName = String(input.absentName || '');
    const target = (ctx.members || []).find(m => (absentUid && String(m.uid || '') === absentUid) || (!absentUid && String(m.name || '') === absentName)) || null;
    if (!target) return { ok: false, reason: 'target-not-in-context' };
    const existing = claimsOf(t).find(c => c && c.status !== 'cancelled' && c.status !== 'applied' && String(c.contextKey) === String(ctx.key));
    if (existing) return { ok: true, changed: false, claim: existing, reason: 'already-open' };
    const claim = {
      id: String(input.claimId || ''), contextKey: ctx.key, scope: ctx.scope,
      matchId: ctx.matchId || null, roundIndex: ctx.roundIndex == null ? null : ctx.roundIndex,
      groupName: ctx.groupName || null, matchIds: (ctx.matchIds || []).slice(),
      players: (ctx.members || []).map(m => m.name), playerUids: (ctx.members || []).map(m => m.uid || ''),
      byUid: uid, byName: String(input.byName || ''), absentName: target.name,
      absentUids: target.uid ? [String(target.uid)] : [], status: 'pending', confirms: {}, createdAt: now
    };
    const self = !!absentUid && absentUid === uid;
    const outcome = self ? outcomeContext(t, claim, ctx) : null;
    if (self) {
      claim.selfDeclared = true; claim.factConfirmed = true; claim.confirms[uid] = true;
      if (outcome) { claim.outcomeStage = 'awaiting-proposal'; claim.outcomePartnerUid = outcome.partnerUid; claim.outcomeOppUids = outcome.oppUids; }
    }
    claimsOf(t).push(claim);
    return { ok: true, changed: true, claim, apply: self && !outcome, outcome };
  }
  const claim = claimOf(t, input.claimId);
  if (!claim || !ctx) return { ok: false, reason: 'claim-not-found' };
  const mayConfirm = admin || confirmers(ctx, claim).includes(uid);
  if (action === 'confirm') {
    if (claim.status !== 'pending' || !mayConfirm) return { ok: false, reason: 'permission-denied' };
    const outcome = outcomeContext(t, claim, ctx);
    if (outcome && isMember(ctx, uid) && !admin) {
      claim.confirms = claim.confirms || {}; claim.confirms[uid] = true; claim.factConfirmed = true;
      claim.outcomeStage = 'awaiting-proposal'; claim.outcomePartnerUid = outcome.partnerUid; claim.outcomeOppUids = outcome.oppUids;
      return { ok: true, changed: true, claim, outcome };
    }
    claim.confirms = claim.confirms || {}; claim.confirms[uid] = true;
    return { ok: true, changed: true, claim, apply: true, offerOutcomeChoice: !!(outcome && admin), outcome };
  }
  if (action === 'contest') {
    if (claim.status !== 'pending' || !mayConfirm) return { ok: false, reason: 'permission-denied' };
    claim.status = 'disputed'; claim.disputedByUid = uid; return { ok: true, changed: true, claim };
  }
  if (action === 'cancel') {
    if (claim.status === 'cancelled' || (uid !== String(claim.byUid || '') && !admin)) return { ok: false, reason: 'permission-denied' };
    claim.status = 'cancelled'; claim.resolvedAt = now; return { ok: true, changed: true, claim };
  }
  if (action === 'resolve') {
    if (!admin || !['pending', 'disputed'].includes(claim.status)) return { ok: false, reason: 'permission-denied' };
    return { ok: true, changed: false, claim, apply: true, offerOutcomeChoice: true, outcome: outcomeContext(t, claim, ctx) };
  }
  if (action === 'propose') {
    if (claim.outcomeStage !== 'awaiting-proposal' || (uid !== String(claim.outcomePartnerUid || '') && !admin)) return { ok: false, reason: 'permission-denied' };
    claim.outcomeProposal = { choice: String(input.choice || ''), byUid: uid, at: now }; claim.outcomeStage = 'proposed';
    return { ok: true, changed: true, claim };
  }
  if (action === 'reject') {
    if (claim.outcomeStage !== 'proposed' || (!(claim.outcomeOppUids || []).map(String).includes(uid) && !admin)) return { ok: false, reason: 'permission-denied' };
    claim.outcomeStage = 'escalated'; claim.outcomeRejectedByUid = uid; return { ok: true, changed: true, claim };
  }
  if (action === 'accept') {
    if (claim.outcomeStage !== 'proposed' || (!(claim.outcomeOppUids || []).map(String).includes(uid) && !admin)) return { ok: false, reason: 'permission-denied' };
    return { ok: true, changed: false, claim, apply: true, choice: claim.outcomeProposal && claim.outcomeProposal.choice };
  }
  if (action === 'choose') {
    if (!admin || !String(input.choice || '')) return { ok: false, reason: 'permission-denied' };
    return { ok: true, changed: false, claim, apply: true, choice: String(input.choice), outcome: outcomeContext(t, claim, ctx) };
  }
  return { ok: false, reason: 'invalid-action' };
}

module.exports = { claimsOf, claimOf, transition, outcomeContext, confirmers };
