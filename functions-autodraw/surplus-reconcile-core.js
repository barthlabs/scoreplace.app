'use strict';

// Executado exclusivamente sobre o torneio fresco dentro da transação que
// lançou/corrigiu placar ou W.O. Não grava nem consulta Firestore.
const draw = require('./draw-core.js');
const win = draw._window;
const policy = win._bracketPolicy;
const MATCH_ID = /^(.*)VC-R(\d+)-P(\d+)$/;

function allMatches(t) {
  return typeof win._collectAllMatches === 'function' ? win._collectAllMatches(t) : (t.matches || []);
}
function played(m) {
  if (!m) return false;
  if (m.winner && !(m.isBye || m.isSitOut)) return true;
  if (m.wo || m.draw || m.startedAt || m.resultAt || m.liveScored || m.pendingResult) return true;
  if (Array.isArray(m.sets) && m.sets.length) return true;
  return [m.scoreP1, m.scoreP2].some(v => typeof v === 'number' && v > 0);
}
function pendingSurplusForMatch(t, match) {
  const target = match && MATCH_ID.exec(String(match.id || ''));
  if (!target) return null;
  return allMatches(t).find(bye => {
    if (!bye || bye.sobraAguardaDecisao !== true || !bye.isBye) return false;
    const source = MATCH_ID.exec(String(bye.id || ''));
    return source && source[1] === target[1] && Number(target[2]) >= Number(source[2]) &&
      Number(bye.phaseIndex || 0) === Number(match.phaseIndex || 0) &&
      String(bye.category || '') === String(match.category || '') &&
      String(bye.bracket || 'main') === String(match.bracket || 'main');
  }) || null;
}
function assertSurplusMatchMayStart(t, matchId) {
  const match = allMatches(t).find(m => m && String(m.id) === String(matchId));
  if (match && pendingSurplusForMatch(t, match)) {
    throw new Error('Aguarde a decisão da folga antes de iniciar a rodada seguinte.');
  }
}
// W.O. e substituições podem afetar mais de um jogo. Compara os dois retratos
// da mesma transação; lançar um resultado posterior enquanto a folga ainda está
// pendente aborta a transação inteira, sem gravar nem placar nem W.O.
function assertNoPrematureLaterPlay(before, after) {
  if (!before || !after) return;
  const previous = new Map(allMatches(before).filter(Boolean).map(m => [String(m.id), m]));
  for (const match of allMatches(after)) {
    if (match && played(match) && !played(previous.get(String(match.id))) &&
        pendingSurplusForMatch(before, match)) {
      throw new Error('Aguarde a decisão da folga antes de iniciar a rodada seguinte.');
    }
  }
}
function slotIdentity(m) {
  const winnerIds = Array.isArray(m.winnerUids) && m.winnerUids.length
    ? m.winnerUids.map(String).sort() : (m.winnerUid ? [String(m.winnerUid)] : []);
  function sideIds(side) {
    const obj = m[side === 'p1' ? 'team1Obj' : 'team2Obj'] || {};
    const stored = m[side === 'p1' ? 'team1Uids' : 'team2Uids'];
    const ids = Array.isArray(stored) && stored.length ? stored
      : (Array.isArray(obj.uids) && obj.uids.length ? obj.uids
        : [m[side + 'Uid'] || obj.uid].filter(Boolean));
    return ids.map(String).sort();
  }
  let side = null;
  if (winnerIds.length) {
    const winnerKey = winnerIds.join('\u0000');
    const ids1 = sideIds('p1'), ids2 = sideIds('p2');
    const p1 = ids1.join('\u0000') === winnerKey;
    const p2 = ids2.join('\u0000') === winnerKey;
    if (p1 !== p2) side = p1 ? 'p1' : 'p2';
    else if (ids1.length || ids2.length) throw new Error('UID vencedor não identifica lado único na sobra');
  }
  if (!side && m.p1 !== m.p2) side = m.winner === m.p1 ? 'p1' : (m.winner === m.p2 ? 'p2' : null);
  if (!side) {
    throw new Error('vencedor sem lado canônico na rodada da sobra');
  }
  const obj = m[side === 'p1' ? 'team1Obj' : 'team2Obj'] || {};
  const entry = Object.assign({}, obj);
  if (winnerIds.length) entry.uids = winnerIds;
  if (!winnerIds.length && m[side + 'Uid']) entry.uid = m[side + 'Uid'];
  const identity = policy.surplusEntryIdentity(entry);
  if (!identity) throw new Error('vencedor sem identidade persistente na rodada da sobra');
  return identity;
}
function clearSlot(m, side) {
  if (!m || (side !== 'p1' && side !== 'p2')) throw new Error('slot de sobra inválido');
  m[side] = 'TBD';
  delete m[side + 'FromBye'];
  delete m[side + 'PromotedFromLower'];
  m[side + 'Uid'] = null;
  if (side === 'p1') { m.team1Uids = []; m.team1Obj = null; }
  else { m.team2Uids = []; m.team2Obj = null; }
}
function undoAutoBye(t, m, seen) {
  if (!m || !m.isBye || !m.winner) return;
  if (played(m)) throw new Error('folga derivada já foi disputada');
  seen = seen || new Set();
  if (seen.has(String(m.id))) throw new Error('ciclo na rota da sobra');
  seen.add(String(m.id));
  const target = m.nextMatchId && win._findMatch(t, m.nextMatchId);
  if (m.nextMatchId && !target) throw new Error('destino da folga ausente');
  if (target) {
    if (target.isBye && target.winner) undoAutoBye(t, target, seen);
    if (target[m.nextSlot] === m.winner) clearSlot(target, m.nextSlot);
  }
  delete m.winner; delete m.winnerUid; delete m.winnerUids;
}
function swapWinnerRoutes(t, a, b) {
  if (!a || !b || a === b) return;
  const first = win._findMatch(t, a.nextMatchId);
  const second = win._findMatch(t, b.nextMatchId);
  if (!first || !second || !['p1', 'p2'].includes(a.nextSlot) ||
      !['p1', 'p2'].includes(b.nextSlot)) throw new Error('rota da sobra incompleta');
  if (played(first) || played(second)) throw new Error('confronto posterior já iniciado');
  undoAutoBye(t, first); undoAutoBye(t, second);
  const routeA = { id: a.nextMatchId, slot: a.nextSlot };
  const routeB = { id: b.nextMatchId, slot: b.nextSlot };
  clearSlot(first, routeA.slot); clearSlot(second, routeB.slot);
  a.nextMatchId = routeB.id; a.nextSlot = routeB.slot;
  b.nextMatchId = routeA.id; b.nextSlot = routeA.slot;
  if (a.winner) win._advanceWinner(t, a);
  if (b.winner) win._advanceWinner(t, b);
}

function reconcileSurplusDecisions(t) {
  if (!t || !policy) return { changed: false };
  const matches = allMatches(t);
  const pendingByes = matches.filter(m => m && Object.prototype.hasOwnProperty.call(m, 'sobraAguardaDecisao') &&
    m.isBye && MATCH_ID.test(String(m.id || '')) && Number(m.round) > 1);
  if (!pendingByes.length) return { changed: false };
  const byId = new Map(matches.filter(Boolean).map(m => [String(m.id), m]));
  pendingByes.sort((a, b) => Number(a.round) - Number(b.round));
  let changed = false;
  for (const bye of pendingByes) {
    const parsed = MATCH_ID.exec(String(bye.id));
    const prefix = parsed[1], round = Number(parsed[2]);
    const sources = matches.filter(m => {
      const p = m && MATCH_ID.exec(String(m.id || ''));
      return p && p[1] === prefix && Number(p[2]) === round - 1 &&
        Number(m.phaseIndex || 0) === Number(bye.phaseIndex || 0) &&
        String(m.category || '') === String(bye.category || '');
    }).sort((a, b) => Number(MATCH_ID.exec(a.id)[3]) - Number(MATCH_ID.exec(b.id)[3]));
    if (sources.length < 3 || sources.length % 2 !== 1) throw new Error('fontes da sobra incompletas');
    const nextRound = matches.filter(m => {
      const p = m && MATCH_ID.exec(String(m.id || ''));
      return p && p[1] === prefix && Number(p[2]) >= round &&
        Number(m.phaseIndex || 0) === Number(bye.phaseIndex || 0) &&
        String(m.category || '') === String(bye.category || '') &&
        String(m.bracket || 'main') === String(bye.bracket || 'main');
    });
    const scope = { phaseIndex: Number(bye.phaseIndex || 0), category: bye.category || '',
      line: prefix, bracket: bye.bracket || 'main', round };
    const key = policy.surplusDecisionKey(scope);
    const map = t.sobraUnicaDecisoesV1 || {};
    const old = map[key];
    const complete = sources.every(m => !!m.winner);
    let eligible = null;
    if (complete) eligible = sources.map(m => ({ sourceId: 'winner:' + MATCH_ID.exec(m.id)[0].slice(prefix.length),
      identity: slotIdentity(m) }));
    const revision = eligible && eligible.map(e => e.sourceId + '\u0001' + e.identity).join('\u0002');
    if (old && (!complete || old.revision !== revision)) {
      if (nextRound.some(played)) throw new Error('não é possível corrigir a sobra após começar a rodada seguinte');
      const chosen = byId.get(prefix + String(old.recipientSourceId || '').replace(/^winner:/, ''));
      const defaultSource = sources[sources.length - 1];
      if (!chosen || !old.sourceIds.includes('winner:' + MATCH_ID.exec(defaultSource.id)[0].slice(prefix.length))) {
        throw new Error('decisão da sobra não corresponde à chave publicada');
      }
      bye.sobraAguardaDecisao = true;
      undoAutoBye(t, bye);
      swapWinnerRoutes(t, chosen, defaultSource);
      delete map[key]; changed = true;
    }
    if (!complete || map[key]) continue;
    if (nextRound.some(played)) throw new Error('rodada posterior começou antes da decisão da sobra');
    const receipt = policy.prepareTournamentSurplusDecision(t, scope, eligible);
    const chosen = byId.get(prefix + String(receipt.decision.recipientSourceId).replace(/^winner:/, ''));
    const defaultSource = sources[sources.length - 1];
    if (!chosen) throw new Error('beneficiário da sobra não pertence à rodada');
    swapWinnerRoutes(t, chosen, defaultSource);
    bye.sobraAguardaDecisao = false;
    win._autoResolveBye(t, bye);
    if (!bye.winner) throw new Error('folga decidida não avançou');
    changed = true;
  }
  return { changed };
}

module.exports = { reconcileSurplusDecisions, assertSurplusMatchMayStart, assertNoPrematureLaterPlay };
