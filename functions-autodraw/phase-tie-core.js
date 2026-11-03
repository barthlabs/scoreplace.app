'use strict';

// Desempate esportivo da fronteira entre destinos. Os jogos daqui não pontuam na
// classificatória que já terminou: ordenam somente os atletas ainda empatados.
function key(row) {
  if (!row) return '';
  return row.uid ? 'uid:' + String(row.uid) : 'name:' + String(row.name || '');
}

function canonicalizeTieFallback(config) {
  if (!config || !config.fmt2 || !['draw_order', 'singles_then_draw'].includes(config.fmt2.tieResolution)) return config;
  if (Array.isArray(config.tiebreakers)) {
    config.tiebreakers = config.tiebreakers.filter(item => item !== 'sorteio').concat('sorteio');
  }
  if (Array.isArray(config.tiebreakersExcluded)) {
    config.tiebreakersExcluded = config.tiebreakersExcluded.filter(item => item !== 'sorteio');
  }
  return config;
}

function originalDrawMatches(phaseGames) {
  return (phaseGames || []).filter(entry => entry && entry.match).map((entry, index) =>
    Object.assign({}, entry.match, {
      round: entry.roundIdx != null ? Number(entry.roundIdx) + 1 : (entry.match.round || 1),
      gameNumber: index + 1
    }));
}

function drawPosition(row, originalOrder) {
  if (!row || !originalOrder) return null;
  const uid = row.uid && originalOrder[String(row.uid)];
  if (uid != null) return uid;
  const name = row.name && originalOrder[String(row.name)];
  return name == null ? null : name;
}

function rankInitialRows(rows, compare, originalOrder) {
  return rows.map((row, index) => ({ row, index })).sort((a, b) => {
    const merit = compare(a.row, b.row);
    if (merit) return merit;
    const ia = drawPosition(a.row, originalOrder), ib = drawPosition(b.row, originalOrder);
    if (ia != null && ib != null && ia !== ib) return ia - ib;
    if (ia != null && ib == null) return -1;
    if (ia == null && ib != null) return 1;
    return a.index - b.index;
  }).map(item => item.row);
}

function findBoundaryTie(rows, boundaries, compare) {
  if (!Array.isArray(rows) || typeof compare !== 'function') return null;
  const cuts = (boundaries || []).filter(n => Number.isInteger(n) && n > 0 && n < rows.length);
  for (const cut of cuts) {
    let from = cut - 1, to = cut;
    if (compare(rows[from], rows[to]) !== 0) continue;
    while (from > 0 && compare(rows[from - 1], rows[from]) === 0) from--;
    while (to + 1 < rows.length && compare(rows[to], rows[to + 1]) === 0) to++;
    const players = rows.slice(from, to + 1);
    if (players.some(p => !key(p)) || new Set(players.map(key)).size !== players.length) {
      throw new Error('identidade ambígua no desempate');
    }
    return { from, to, cut, players: players.map(p => ({ uid: p.uid || null, name: String(p.name || ''), key: key(p) })) };
  }
  return null;
}

function allBoundaryTies(rows, boundaries, compare) {
  const found = [];
  (boundaries || []).forEach(cut => {
    const tie = findBoundaryTie(rows, [cut], compare);
    if (tie && !found.some(previous => previous.from === tie.from && previous.to === tie.to)) found.push(tie);
  });
  return found;
}

function boundariesFor(nextPhase, count) {
  const source = (nextPhase && nextPhase.source) || {};
  const mapping = Array.isArray(source.mapping) ? source.mapping : [];
  const limitRaw = mapping.reduce((max, m) => Math.max(max, Number(m.rankTo) || 0), 0);
  const limit = !limitRaw || limitRaw >= 999 ? count : Math.min(count, limitRaw);
  const cuts = [];
  const lines = mapping.length;
  if (lines > 1 && limit > 1) {
    const strategy = nextPhase.pairingStrategy || 'top';
    const fixedPairs = nextPhase.fixedPairs !== false && source.rankingBasis !== 'team';
    const teamCount = fixedPairs ? Math.ceil(limit / 2) : limit;
    const perLine = Math.max(Math.ceil(teamCount / lines), 1);
    const destination = rank => {
      if (strategy === 'draw_among') return null;
      if (strategy === 'seed') return rank < lines ? rank : null;
      const teamIndex = fixedPairs
        ? strategy === 'balanced' ? Math.min(rank, limit - 1 - rank) : Math.floor(rank / 2)
        : rank;
      return Math.min(Math.floor(teamIndex / perLine), lines - 1);
    };
    for (let cut = 1; cut < limit; cut++) {
      const before = destination(cut - 1), after = destination(cut);
      if (before !== null && after !== null && before !== after) cuts.push(cut);
      if (strategy === 'seed' && cut === lines) cuts.push(cut);
    }
  }
  if (limit < count) cuts.push(limit);
  return Array.from(new Set(cuts)).sort((a, b) => a - b);
}

function matchesFor(tie, idPrefix) {
  if (!tie || ![2, 3].includes(tie.players.length)) throw new Error('simples exige dois ou três atletas');
  const pairs = tie.players.length === 2 ? [[0, 1]] : [[0, 1], [0, 2], [1, 2]];
  return pairs.map((pair, index) => ({
    id: String(idPrefix) + '-' + index,
    p1: tie.players[pair[0]], p2: tie.players[pair[1]],
    sets: [], winnerKey: null
  }));
}

function scoreMatch(match, sets, setsToWin) {
  if (!match || !Array.isArray(sets) || !sets.length) throw new Error('placar da simples ausente');
  const target = Number.isInteger(setsToWin) && setsToWin >= 1 && setsToWin <= 5 ? setsToWin : 1;
  if (sets.length > target * 2 - 1) throw new Error('sets demais para o formato escolhido');
  let w1 = 0, w2 = 0;
  const clean = sets.map((set, index) => {
    if (!set || (typeof set.p1 !== 'number' && typeof set.p1 !== 'string') ||
        (typeof set.p2 !== 'number' && typeof set.p2 !== 'string')) {
      throw new Error('placar inválido no set ' + (index + 1));
    }
    const p1 = Number(set.p1), p2 = Number(set.p2);
    if (!Number.isInteger(p1) || !Number.isInteger(p2) || p1 < 0 || p2 < 0 || p1 > 99 || p2 > 99 || p1 === p2) {
      throw new Error('placar inválido no set ' + (index + 1));
    }
    if (w1 >= target || w2 >= target) throw new Error('set após a partida já estar decidida');
    if (p1 > p2) w1++; else w2++;
    return { p1, p2 };
  });
  if (Math.max(w1, w2) !== target) throw new Error('partida incompleta');
  return Object.assign({}, match, { sets: clean, winnerKey: w1 > w2 ? match.p1.key : match.p2.key });
}

function rankPlayers(tie, matches) {
  if (!tie || !Array.isArray(matches) || matches.some(m => !m.winnerKey)) throw new Error('desempate ainda incompleto');
  const stats = new Map(tie.players.map((p, i) => [p.key, { key: p.key, original: i, wins: 0, setDiff: 0, gameDiff: 0 }]));
  matches.forEach(m => {
    const a = stats.get(m.p1.key), b = stats.get(m.p2.key);
    if (!a || !b || a === b || (m.winnerKey !== a.key && m.winnerKey !== b.key)) throw new Error('jogo fora do empate');
    stats.get(m.winnerKey).wins++;
    (m.sets || []).forEach(s => {
      a.setDiff += s.p1 > s.p2 ? 1 : -1;
      b.setDiff += s.p2 > s.p1 ? 1 : -1;
      a.gameDiff += s.p1 - s.p2;
      b.gameDiff += s.p2 - s.p1;
    });
  });
  return Array.from(stats.values()).sort((a, b) =>
    b.wins - a.wins || b.setDiff - a.setDiff || b.gameDiff - a.gameDiff || a.original - b.original
  ).map(s => s.key);
}

function applyOrder(rows, tie, orderKeys) {
  if (!tie || !Array.isArray(orderKeys) || orderKeys.length !== tie.players.length ||
      new Set(orderKeys).size !== orderKeys.length) throw new Error('ordem do desempate inválida');
  const segment = rows.slice(tie.from, tie.to + 1);
  const byKey = new Map(segment.map(p => [key(p), p]));
  if (byKey.size !== segment.length || orderKeys.some(k => !byKey.has(k))) throw new Error('atletas do desempate mudaram');
  return rows.slice(0, tie.from).concat(orderKeys.map(k => byKey.get(k)), rows.slice(tie.to + 1));
}

// O servidor chama esta função dentro de sua transação. `action` é uma intenção
// administrativa; a classificação e os atletas sempre vêm do documento fresco.
function resolvePhaseTies(t, phaseIndex, pools, nextPhase, compareForPool, action, setsToWin, autoDraw) {
  const book = t.phaseTieDecisions || {};
  const phaseBook = book[String(phaseIndex)] || {};
  let changed = false, usedAction = false;
  const orderedPools = [];
  for (const pool of pools) {
    const compare = compareForPool(pool);
    let rows = rankInitialRows(pool.rows, compare, compare.originalOrder);
    const ties = allBoundaryTies(rows, boundariesFor(nextPhase, rows.length), compare);
    for (const tie of ties) {
      if (tie.players.some(player => drawPosition(player, compare.originalOrder) == null)) {
        throw new Error('ordem do sorteio original ausente para atleta empatado');
      }
      const decisionId = pool.id + ':' + tie.from + ':' + tie.to;
      let decision = phaseBook[decisionId];
      const keys = tie.players.map(p => p.key);
      if (decision && (decision.contenders.length !== keys.length ||
          decision.contenders.some((key, index) => key !== keys[index]))) {
        throw new Error('classificação mudou depois da decisão de desempate');
      }
      if (!decision) {
        const type = autoDraw && !action ? 'draw' : action && action.decisionId === decisionId && !usedAction ? action.type : null;
        if (!type) {
          if (changed) { book[String(phaseIndex)] = phaseBook; t.phaseTieDecisions = book; }
          return { status: 'choice', tie: Object.assign({ decisionId, poolId: pool.id }, tie), changed, orderedPools };
        }
        if (!autoDraw) usedAction = true;
        if (type !== 'play' && type !== 'draw') throw new Error('escolha de desempate inválida');
        if (type === 'play' && ![2, 3].includes(keys.length)) throw new Error('simples disponível só para dois ou três atletas');
        decision = { contenders: keys, players: tie.players.map(p => ({ key: p.key, name: p.name })),
          originalOrder: keys.slice(), choice: type,
          status: type === 'draw' ? 'complete' : 'pending',
          order: type === 'draw' ? keys.slice() : null,
          matches: type === 'play' ? matchesFor(tie, 'tie-' + phaseIndex + '-' + decisionId.replace(/[^a-zA-Z0-9_-]/g, '-')) : [],
          setsToWin: Number.isInteger(setsToWin) && setsToWin >= 1 && setsToWin <= 5 ? setsToWin : 1,
          reason: type === 'draw' ? (autoDraw ? 'rule-original-draw-order' : 'organizer-used-original-draw-order') : 'organizer-chose-singles' };
        phaseBook[decisionId] = decision;
        changed = true;
      }
      if (decision.status === 'pending') {
        if (action && action.type === 'score' && action.decisionId === decisionId && !usedAction) {
          usedAction = true;
          const index = decision.matches.findIndex(m => m.id === action.matchId);
          if (index < 0) throw new Error('partida de desempate não encontrada');
          if (decision.matches[index].winnerKey) throw new Error('placar da partida já registrado');
          decision.matches[index] = scoreMatch(decision.matches[index], action.sets, decision.setsToWin);
          changed = true;
          if (decision.matches.every(m => m.winnerKey)) {
            decision.order = rankPlayers(tie, decision.matches);
            decision.status = 'complete';
          }
        }
        if (decision.status === 'pending') {
          t.phaseTieDecisions = book;
          book[String(phaseIndex)] = phaseBook;
          return { status: 'pending', tie: Object.assign({ decisionId, poolId: pool.id }, tie), decision, changed, orderedPools };
        }
      }
      rows = applyOrder(rows, tie, decision.order);
    }
    orderedPools.push({ id: pool.id, rows });
  }
  if (action && !usedAction) throw new Error('decisão de desempate desatualizada');
  if (changed) { book[String(phaseIndex)] = phaseBook; t.phaseTieDecisions = book; }
  return { status: 'ready', orderedPools, changed };
}

module.exports = { key, canonicalizeTieFallback, originalDrawMatches, drawPosition, rankInitialRows, findBoundaryTie, allBoundaryTies, boundariesFor, matchesFor, scoreMatch, rankPlayers, applyOrder, resolvePhaseTies };
