'use strict';

// Moves the court to the next game of a three-game Rei/Rainha group in the same
// score transaction. The first call and warmup belong to the series, not each game.
function advance(tournament, completed, matches, nowIso, occupancy, timing, released) {
  if (!completed || completed.isMonarch !== true || completed.isTieBreak ||
      !Array.isArray(tournament?.scheduleWindow?.days) || tournament.scheduleWindow.days.length !== 1 ||
      completed.monarchGroup == null || completed.round == null || !completed.category ||
      !completed.court || !completed.courtCalledAt || !occupancy.isFinished(completed) ||
      released && released[String(completed.id)]) return null;
  const unique = new Map();
  (matches || []).forEach(match => {
    if (match && match.id != null && !unique.has(String(match.id))) unique.set(String(match.id), match);
  });
  const group = Array.from(unique.values()).filter(match => match.isMonarch === true && !match.isTieBreak &&
    String(match.category || '') === String(completed.category) &&
    Number(match.phaseIndex || 0) === Number(completed.phaseIndex || 0) &&
    String(match.round) === String(completed.round) &&
    String(match.monarchGroup) === String(completed.monarchGroup));
  if (group.length !== 3) return null;
  group.sort((a, b) => {
    const an = Number(a._gameNum || a.scheduledGameNumber || 0);
    const bn = Number(b._gameNum || b.scheduledGameNumber || 0);
    if (an > 0 && bn > 0 && an !== bn) return an - bn;
    return (Date.parse(a.scheduledAt || '') || 0) - (Date.parse(b.scheduledAt || '') || 0) ||
      String(a.id).localeCompare(String(b.id));
  });
  const at = group.findIndex(match => String(match.id) === String(completed.id));
  if (at < 0 || at === 2) return null;
  const next = group[at + 1];
  if (!next || occupancy.isFinished(next) || next.courtCalledAt || next.startedAt ||
      next.pendingResult || next.isBye || next.isSitOut || released && released[String(next.id)]) return null;
  const court = String(completed.court);
  if (Array.from(unique.values()).some(match => String(match.id) !== String(completed.id) &&
      String(match.id) !== String(next.id) && String(match.court || '') === court &&
      !released?.[String(match.id)] && occupancy.occupiesCourt(match))) return null;
  const offset = timing.config(tournament);
  next.court = court;
  next.courtCalledAt = nowIso;
  next.startedAt = nowIso;
  next.courtClockBaseAt = new Date(Date.parse(nowIso) - (offset.call + offset.warmup) * 60000).toISOString();
  return { matchId: String(next.id), court, courtCalledAt: next.courtCalledAt,
    startedAt: next.startedAt, courtClockBaseAt: next.courtClockBaseAt };
}

// Séries chamadas antes do relógio individual não têm fronteiras confiáveis
// entre os três jogos. Ao encerrar a série, repartir o tempo efetivo total em
// três durações iguais, sem reescrever horários de chamada ou placares.
function estimateLegacyDurations(tournament, group, endedAt, timing) {
  if (!Array.isArray(group) || group.length !== 3 || !timing || typeof timing.config !== 'function') return null;
  const first = group[0];
  if (!first || first.isMonarch !== true || first.monarchTimingMode === 'perGame' ||
      group.some(match => Number.isFinite(match && match.estimatedDurationMs) && match.estimatedDurationMs > 0) ||
      !group.every(match => match && match.isMonarch === true && !match.isTieBreak &&
        String(match.category || '') === String(first.category || '') &&
        Number(match.phaseIndex || 0) === Number(first.phaseIndex || 0) &&
        String(match.round) === String(first.round) &&
        String(match.monarchGroup) === String(first.monarchGroup))) return null;
  const anchor = Date.parse(String(first.courtClockBaseAt || first.courtCalledAt || ''));
  const end = Date.parse(String(endedAt || ''));
  const phases = timing.config(tournament);
  const playStart = anchor + (phases.call + phases.warmup) * 60000;
  if (!Number.isFinite(playStart) || !Number.isFinite(end) || end <= playStart ||
      end - playStart > 24 * 60 * 60 * 1000) return null;
  const eachMs = Math.round((end - playStart) / 3000) * 1000;
  if (eachMs < 1000) return null;
  group.forEach(match => { match.estimatedDurationMs = eachMs; });
  return eachMs;
}

function estimateAfterFinalResult(tournament, match, matches, endedAt, timing, occupancy) {
  if (!match || match.isMonarch !== true || !Array.isArray(matches)) return null;
  const group = matches.filter(item => item && item.isMonarch === true && !item.isTieBreak &&
    String(item.category || '') === String(match.category || '') &&
    Number(item.phaseIndex || 0) === Number(match.phaseIndex || 0) &&
    String(item.round) === String(match.round) &&
    String(item.monarchGroup) === String(match.monarchGroup));
  if (group.length !== 3) return null;
  group.sort((a, b) => Number(a._gameNum || a.scheduledGameNumber || 0) -
    Number(b._gameNum || b.scheduledGameNumber || 0) ||
    (Date.parse(a.scheduledAt || '') || 0) - (Date.parse(b.scheduledAt || '') || 0) ||
    String(a.id).localeCompare(String(b.id)));
  if (String(group[2].id) !== String(match.id) || !group.every(occupancy.isFinished)) return null;
  return estimateLegacyDurations(tournament, group, endedAt, timing);
}

module.exports = { advance, estimateLegacyDurations, estimateAfterFinalResult };
