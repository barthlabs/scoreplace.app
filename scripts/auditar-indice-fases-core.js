'use strict';

const split = require('../js/views/tournament-split-core.js');

function classify(record) {
  if (!record || typeof record !== 'object') return 'ambiguo';
  const phase = split.faseIndexavel(record.jogo, record._loc);
  if (phase === null) return 'ambiguo';
  if (!Object.prototype.hasOwnProperty.call(record, '_phaseIndex')) return 'ausente';
  return record._phaseIndex === phase ? 'ok' : 'divergente';
}

function report(tournament, records) {
  const games = Array.isArray(records) ? records : [];
  const counts = { ok: 0, ausente: 0, ambiguo: 0, divergente: 0 };
  const structures = { matches: 0, rounds: 0, phaseRounds: 0, desconhecida: 0 };
  for (const record of games) {
    counts[classify(record)]++;
    const type = record && record._loc && record._loc.tipo;
    structures[Object.prototype.hasOwnProperty.call(structures, type) ? type : 'desconhecida']++;
  }
  const expected = tournament && tournament._nPartes && tournament._nPartes.matches;
  const counterMatches = Number.isSafeInteger(expected) && expected === games.length;
  const coverage = !games.length ? 'sem_jogos' :
    counterMatches && counts.ok === games.length ? 'completa' : 'incompleta';
  const backfillCandidate = games.length > 0 && counterMatches && counts.ambiguo === 0 && counts.divergente === 0;
  return { coverage, games: games.length, counts, structures, counterMatches, backfillCandidate };
}

function aggregate(reports) {
  const total = {
    tournaments: 0, games: 0, coverage: { completa: 0, incompleta: 0, sem_jogos: 0 },
    counts: { ok: 0, ausente: 0, ambiguo: 0, divergente: 0 },
    structures: { matches: 0, rounds: 0, phaseRounds: 0, desconhecida: 0 },
    counterMismatches: 0, backfillCandidates: { tournaments: 0, missingIndexes: 0 }
  };
  for (const item of reports) {
    total.tournaments++;
    total.games += item.games;
    total.coverage[item.coverage]++;
    if (!item.counterMatches) total.counterMismatches++;
    if (item.backfillCandidate && item.counts.ausente > 0) {
      total.backfillCandidates.tournaments++;
      total.backfillCandidates.missingIndexes += item.counts.ausente;
    }
    for (const key of Object.keys(total.counts)) total.counts[key] += item.counts[key];
    for (const key of Object.keys(total.structures)) total.structures[key] += item.structures[key];
  }
  return total;
}

module.exports = { classify, report, aggregate };
