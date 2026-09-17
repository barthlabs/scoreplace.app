'use strict';

/*
 * Avisos de confronto liberado e de prazo de rodada.
 *
 * A identidade é exclusivamente o UID do slot. Nome, e-mail e celular não entram
 * na decisão nem na chave do recibo. O prazo usa o domínio tipado que desenha a
 * régua das rodadas no aplicativo; assim o texto da notificação não inventa uma
 * data diferente da configurada pelo organizador.
 */
// O codebase das Functions recebe somente a própria árvore. Esta cópia é gerada
// por copy-vendor.js e é verificada byte a byte contra js/domain/round-bounds.js.
const RoundBounds = require('./vendor/round-bounds.js');

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean).map(String)));
}

function slotUids(match, side) {
  if (!match) return [];
  const team = side === 'p1' ? match.team1Uids : match.team2Uids;
  if (Array.isArray(team) && team.length) return unique(team);
  const uid = side === 'p1' ? match.p1Uid : match.p2Uid;
  return uid ? [String(uid)] : [];
}

function phaseIndexOf(match) {
  const value = Number(match && match.phaseIndex);
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function phaseOf(tournament, phaseIndex) {
  return (Array.isArray(tournament && tournament.phases) && tournament.phases[phaseIndex]) || {};
}

function configuredDateMs(value, time, endOfDay) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim();
  if (!text) return null;
  if (!text.includes('T')) text += 'T' + (time || (endOfDay ? '23:59:59' : '00:00'));
  const ms = RoundBounds.toMillis(text);
  return Number.isFinite(ms) ? ms : null;
}

function phaseStartMs(tournament, phaseIndex) {
  const phase = phaseOf(tournament, phaseIndex);
  let start = configuredDateMs(phase.startDate, phase.startTime, false);
  if (start != null) return start;
  const stamped = tournament && tournament.phaseStartedAt && tournament.phaseStartedAt[String(phaseIndex)];
  start = configuredDateMs(stamped, '', false);
  if (start != null) return start;
  return phaseIndex === 0
    ? configuredDateMs(tournament && tournament.startDate, tournament && tournament.startTime, false)
    : null;
}

function phaseEndMs(tournament, phaseIndex) {
  const phase = phaseOf(tournament, phaseIndex);
  const own = configuredDateMs(phase.endDate, phase.endTime, true);
  if (own != null) return own;
  return phaseIndex === 0
    ? configuredDateMs(tournament && tournament.endDate, tournament && tournament.endTime, true)
    : null;
}

function rawBoundsOf(tournament, phaseIndex) {
  const phase = phaseOf(tournament, phaseIndex);
  if (Array.isArray(phase.roundBounds) && phase.roundBounds.length) return phase.roundBounds;
  return phaseIndex === 0 && Array.isArray(tournament && tournament.roundBounds)
    ? tournament.roundBounds : [];
}

function roundCountOf(tournament, phaseIndex, matches) {
  const phase = phaseOf(tournament, phaseIndex);
  const configured = Number.parseInt(String(phase.rounds || ''), 10);
  if (configured > 0) return configured;
  const raw = rawBoundsOf(tournament, phaseIndex);
  if (raw.length) return raw.length + 1;
  let max = 0;
  (matches || []).forEach((match) => {
    if (phaseIndexOf(match) !== phaseIndex) return;
    const round = Number(match && match.round);
    if (Number.isInteger(round) && round > max) max = round;
  });
  return Math.max(1, max);
}

/** Retorna o prazo canônico da rodada do jogo ou null sem configuração suficiente. */
function roundDeadlineMs(tournament, match, matches) {
  if (!tournament || !match) return null;
  const phaseIndex = phaseIndexOf(match);
  const rounds = roundCountOf(tournament, phaseIndex, matches);
  const round = Math.max(1, Number.parseInt(String(match.round == null ? 1 : match.round), 10) || 1);
  if (round > rounds) return null;
  const start = phaseStartMs(tournament, phaseIndex);
  const end = phaseEndMs(tournament, phaseIndex);
  if (!(end > 0)) return null;
  if (rounds === 1) return end;
  if (!(start > 0) || !(end > start)) return null;
  const configured = RoundBounds.limitsOf(tournament, phaseIndex, start, end, rounds);
  const cuts = configured == null ? RoundBounds.equalBounds(start, end, rounds) : configured;
  if (round === rounds) return end;
  return cuts[round - 1] || null;
}

function isReady(match) {
  if (!match || !match.id || match.isBye || match.isSitOut || match.winner || match.pendingResult) return false;
  const p1 = slotUids(match, 'p1');
  const p2 = slotUids(match, 'p2');
  if (!p1.length || !p2.length) return false;
  const all = p1.concat(p2);
  return new Set(all).size === all.length;
}

function isUnfinished(match) {
  if (!match || !match.id || match.isBye || match.isSitOut || match.winner) return false;
  const all = slotUids(match, 'p1').concat(slotUids(match, 'p2'));
  return all.length > 1 && new Set(all).size === all.length;
}

function dayMonth(ms) {
  return RoundBounds.toDayMonthBrt(ms);
}

function readySpecs(tournament, matches) {
  const specs = [];
  (matches || []).forEach((match) => {
    if (!isReady(match)) return;
    const matchUids = unique(slotUids(match, 'p1').concat(slotUids(match, 'p2')));
    const deadlineMs = roundDeadlineMs(tournament, match, matches);
    const deadlineText = deadlineMs ? ' Prazo da rodada: ' + dayMonth(deadlineMs) + '.' : '';
    matchUids.forEach((uid) => {
      specs.push({
        eventId: 'match-ready-' + String(match.id) + '-' + uid,
        type: 'match-ready',
        title: '🎾 Seu próximo jogo já está liberado',
        message: 'O confronto está definido. Vocês já podem combinar e jogar.' + deadlineText,
        matchId: String(match.id),
        matchUids,
        recipientUid: uid,
        deadlineMs: deadlineMs || null,
        deadlineText: deadlineMs ? dayMonth(deadlineMs) : ''
      });
    });
  });
  return specs;
}

function deadlineReminderSpecs(tournament, matches, nowMs) {
  const specs = [];
  const now = Number(nowMs);
  const week = 7 * RoundBounds.DAY_MS;
  (matches || []).forEach((match) => {
    if (!isUnfinished(match)) return;
    const deadlineMs = roundDeadlineMs(tournament, match, matches);
    if (!(deadlineMs > now) || deadlineMs - now > week) return;
    const matchUids = unique(slotUids(match, 'p1').concat(slotUids(match, 'p2')));
    matchUids.forEach((uid) => {
      specs.push({
        eventId: 'match-deadline-' + String(match.id) + '-' + String(deadlineMs) + '-' + uid,
        type: 'match-round-deadline',
        title: '⏰ Prazo da rodada se aproxima',
        message: 'Este jogo ainda está pendente. A rodada encerra em ' + dayMonth(deadlineMs) + '.',
        matchId: String(match.id),
        matchUids,
        recipientUid: uid,
        deadlineMs,
        deadlineText: dayMonth(deadlineMs)
      });
    });
  });
  return specs;
}

module.exports = {
  slotUids,
  phaseStartMs,
  phaseEndMs,
  roundDeadlineMs,
  isReady,
  isUnfinished,
  readySpecs,
  deadlineReminderSpecs
};
