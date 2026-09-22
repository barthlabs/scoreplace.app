// Projeção pura do histórico de uma partida casual já encerrada.
//
// Este módulo aceita o DOCUMENTO canônico relido pela Function, nunca um payload
// de estatística do navegador. Nomes e fotos da sala são apresentação transitória:
// a projeção de conta conserva somente UID e lado.

function uniqueUids(value) {
  const seen = new Set();
  return (Array.isArray(value) ? value : []).map(String).filter((uid) => {
    if (!uid || seen.has(uid)) return false;
    seen.add(uid);
    return true;
  });
}

function safeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function cleanSets(result) {
  if (!Array.isArray(result && result.sets)) return [];
  return result.sets.map((set) => {
    const out = { gamesP1: safeNumber(set && set.gamesP1), gamesP2: safeNumber(set && set.gamesP2) };
    if (set && set.tiebreak && typeof set.tiebreak === 'object') {
      out.tiebreak = {
        p1: safeNumber(set.tiebreak.p1 != null ? set.tiebreak.p1 : set.tiebreak.pointsP1),
        p2: safeNumber(set.tiebreak.p2 != null ? set.tiebreak.p2 : set.tiebreak.pointsP2)
      };
    }
    return out;
  });
}

function playersFromMatch(match) {
  const byUid = new Map();
  (Array.isArray(match && match.players) ? match.players : []).forEach((player) => {
    if (!player || !player.uid || (player.team !== 1 && player.team !== 2)) return;
    const uid = String(player.uid);
    // Um UID em dois lados é um documento corrompido, não uma estatística para
    // "consertar" por inferência.
    if (byUid.has(uid) && byUid.get(uid).team !== player.team) {
      byUid.set(uid, null);
      return;
    }
    if (!byUid.has(uid)) byUid.set(uid, { uid, team: player.team });
  });
  return Array.from(byUid.values()).filter(Boolean);
}

function teamStats(sets, result, side) {
  const isOne = side === 1;
  const games = sets.length
    ? sets.reduce((total, set) => total + (isOne ? set.gamesP1 : set.gamesP2), 0)
    : safeNumber(isOne ? result.p1Score : result.p2Score);
  const setWins = sets.reduce((total, set) => total +
    ((isOne ? set.gamesP1 > set.gamesP2 : set.gamesP2 > set.gamesP1) ? 1 : 0), 0);
  return {
    points: games, games, sets: setWins,
    holdServed: 0, held: 0, longestStreak: 0, biggestLead: 0,
    servePtsPlayed: 0, servePtsWon: 0, receivePtsPlayed: 0, receivePtsWon: 0,
    deucePtsPlayed: 0, deucePtsWon: 0, breaks: 0
  };
}

function buildCasualRecord(matchId, match) {
  const id = String(matchId || '').trim();
  if (!id || !match || match.status !== 'finished' || !match.result) return null;
  const winner = match.result.winner;
  if (winner !== 0 && winner !== 1 && winner !== 2) return null;
  const players = playersFromMatch(match);
  const recipients = uniqueUids(players.map((player) => player.uid));
  if (!players.length || !recipients.length) return null;
  const team1 = players.filter((player) => player.team === 1);
  const team2 = players.filter((player) => player.team === 2);
  if (!team1.length || !team2.length) return null;
  const sets = cleanSets(match.result);
  const scoreSummary = typeof match.result.summary === 'string' ? match.result.summary : '';
  if (!scoreSummary) return null;
  const historyId = 'casual_' + id;
  return {
    matchId: historyId,
    recipients,
    record: {
      schema: 2,
      matchId: historyId,
      matchType: 'casual',
      tournamentId: null,
      tournamentName: null,
      sport: typeof match.sport === 'string' ? match.sport : '',
      isDoubles: match.isDoubles === true || team1.length > 1 || team2.length > 1,
      finishedAt: match.finishedAt != null ? match.finishedAt : null,
      startedAt: match.startedAt != null ? match.startedAt : null,
      durationMs: null,
      timeStats: null,
      players,
      playerUids: recipients,
      winnerTeam: winner,
      scoreSummary,
      sets,
      stats: { team1: teamStats(sets, match.result, 1), team2: teamStats(sets, match.result, 2) },
      playerStats: {}
    }
  };
}

module.exports = { uniqueUids, playersFromMatch, buildCasualRecord };
