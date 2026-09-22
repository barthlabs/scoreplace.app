// Projeção pura de histórico de partidas de torneio.
//
// O registro é derivado do jogo JÁ aceito pelo motor na Function. Este módulo não
// conhece Firestore, auth nem payload do navegador: recebe apenas o torneio e o
// match canônicos já presentes na transação. Isso impede que `players`, placar
// ou destinatários sejam declarados por quem chama a Function.

function uniqueUids(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(String).filter((uid) => {
    if (!uid || seen.has(uid)) return false;
    seen.add(uid);
    return true;
  });
}

function slotUids(match, side) {
  if (!match) return [];
  const team = side === 1 ? match.team1Uids : match.team2Uids;
  if (Array.isArray(team) && team.length) return uniqueUids(team);
  const single = side === 1 ? match.p1Uid : match.p2Uid;
  return single ? [String(single)] : [];
}

function sameUidSet(a, b) {
  const left = uniqueUids(a).sort();
  const right = uniqueUids(b).sort();
  return left.length === right.length && left.every((uid, i) => uid === right[i]);
}

// Não usa rótulo nem placar como autoridade do vencedor. Resultado novo precisa
// trazer winnerUids, gravado por `_stampWinner`; os registros antigos continuam
// legíveis, mas não são materializados de novo com uma inferência por nome.
function winnerTeam(match) {
  if (!match) return null;
  if (match.draw === true || match.winner === 'draw') return 0;
  const winner = uniqueUids(match.winnerUids || (match.winnerUid ? [match.winnerUid] : []));
  if (!winner.length) return null;
  if (sameUidSet(winner, slotUids(match, 1))) return 1;
  if (sameUidSet(winner, slotUids(match, 2))) return 2;
  return null;
}

function safeNumber(value) {
  return (typeof value === 'number' && Number.isFinite(value)) ? value : 0;
}

function cleanSets(match) {
  if (!Array.isArray(match && match.sets)) return [];
  return match.sets.map((set) => {
    const out = { gamesP1: safeNumber(set && set.gamesP1), gamesP2: safeNumber(set && set.gamesP2) };
    if (set && set.tiebreak && typeof set.tiebreak === 'object') {
      const p1 = safeNumber(set.tiebreak.p1 != null ? set.tiebreak.p1 : set.tiebreak.pointsP1);
      const p2 = safeNumber(set.tiebreak.p2 != null ? set.tiebreak.p2 : set.tiebreak.pointsP2);
      out.tiebreak = { p1, p2 };
    }
    if (set && set.fixedSet === true) out.fixedSet = true;
    return out;
  });
}

function scoreSummary(match, sets) {
  if (sets.length) return sets.map((set) => {
    let text = String(set.gamesP1) + '-' + String(set.gamesP2);
    if (set.tiebreak) text += '(' + String(Math.min(set.tiebreak.p1, set.tiebreak.p2)) + ')';
    return text;
  }).join(' ');
  if (match && match.scoreP1 != null && match.scoreP2 != null) return String(match.scoreP1) + '-' + String(match.scoreP2);
  return '';
}

function teamStats(match, sets, side) {
  const isOne = side === 1;
  const games = sets.length
    ? sets.reduce((sum, set) => sum + (isOne ? set.gamesP1 : set.gamesP2), 0)
    : safeNumber(isOne ? match.totalGamesP1 != null ? match.totalGamesP1 : match.scoreP1 : match.totalGamesP2 != null ? match.totalGamesP2 : match.scoreP2);
  const setWins = sets.length
    ? sets.reduce((sum, set) => sum + ((isOne ? set.gamesP1 > set.gamesP2 : set.gamesP2 > set.gamesP1) ? 1 : 0), 0)
    : safeNumber(isOne ? match.setsWonP1 : match.setsWonP2);
  // Métricas de ponto/saque só existem quando a fonte canônica as tiver. Não
  // copiamos uma contagem declarada pelo cliente para preencher zeros aparentes.
  return {
    points: games, games, sets: setWins,
    holdServed: 0, held: 0, longestStreak: 0, biggestLead: 0,
    servePtsPlayed: 0, servePtsWon: 0, receivePtsPlayed: 0, receivePtsWon: 0,
    deucePtsPlayed: 0, deucePtsWon: 0, breaks: 0
  };
}

function buildTournamentRecord(tournament, match, finishedAt) {
  if (!tournament || !match || !tournament.id || !match.id) return null;
  if (match.isBye || match.isSitOut || match.wo) return null;
  const team1 = slotUids(match, 1);
  const team2 = slotUids(match, 2);
  if (!team1.length || !team2.length) return null;
  const winner = winnerTeam(match);
  if (winner == null) return null;
  const sets = cleanSets(match);
  const summary = scoreSummary(match, sets);
  if (!summary) return null;
  const players = team1.map((uid) => ({ uid, team: 1 })).concat(team2.map((uid) => ({ uid, team: 2 })));
  const matchId = 't_' + String(tournament.id) + '_' + String(match.id);
  return {
    matchId,
    recipients: uniqueUids(team1.concat(team2)),
    record: {
      schema: 2,
      matchId,
      matchType: 'tournament',
      tournamentId: String(tournament.id),
      tournamentName: typeof tournament.name === 'string' ? tournament.name : null,
      sport: typeof tournament.sport === 'string' ? tournament.sport : (typeof tournament.modality === 'string' ? tournament.modality : ''),
      isDoubles: team1.length > 1 || team2.length > 1,
      finishedAt: String(finishedAt || ''),
      startedAt: match.startedAt != null ? match.startedAt : null,
      durationMs: null,
      timeStats: null,
      players,
      playerUids: uniqueUids(team1.concat(team2)),
      winnerTeam: winner,
      scoreSummary: summary,
      sets,
      stats: { team1: teamStats(match, sets, 1), team2: teamStats(match, sets, 2) },
      playerStats: {}
    }
  };
}

module.exports = { uniqueUids, slotUids, winnerTeam, buildTournamentRecord };
