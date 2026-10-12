'use strict';

/*
 * A fronteira de avisos in-app.
 *
 * O navegador pode pedir um aviso, mas nunca escolhe a identidade do remetente,
 * o instante, o estado de leitura ou um destino sem relação verificável. Esta
 * camada é deliberadamente pura: a Function fornece os fatos (amizade,
 * torneio, papéis) e ela decide a autorização e reduz o payload.
 */

const SOCIAL_TYPES = new Set([
  'casual_invite', 'casual_link_request', 'casual_link_accepted',
  'casual_link_rejected', 'presence_checkin', 'presence_plan',
  'tournament_created', 'tournament_invite',
  'tournament_nearby'
]);

const TOURNAMENT_TYPES = new Set([
  'category-data-request', 'enrollment_new', 'enrollment_cancelled',
  'enrollments_closed', 'liga-sub-invite', 'liga-sub-result',
  'match-pending-approval', 'new_round', 'player_to_organizer', 'poll',
  'schedule', 'swiss_to_elimination', 'tournament_deleted',
  'tournament_finished', 'tournament_update', 'tournament_updated',
  'wa_group', 'wo-claim', 'cohost_invite', 'cohost_invite_sent',
  'cohost_removed', 'host_invite_accepted', 'host_invite_rejected',
  'host_transfer_invite', 'host_transfer_sent', 'tournament_reminder',
  'live_score_started', 'match-rejected', 'result', 'draw', 'new_phase',
  'pair_invite', 'enrollment_confirm', 'enrollment_cancelled_confirm',
  'enrollments_reopened', 'category-change-request', 'category-change-result',
  'category_assignment', 'organizer_communication', 'org_communication',
  'participant_removed', 'tournament_auto_close_warning', 'tournament_auto_closed'
]);

const SELF_TYPES = new Set(['account_update']);

function text(value, max, field, required) {
  if (value == null) {
    if (required) throw new Error(field + ' obrigatório');
    return '';
  }
  if (typeof value !== 'string') throw new Error(field + ' inválido');
  const out = value.trim();
  if ((required && !out) || out.length > max) throw new Error(field + ' inválido');
  return out;
}

function primitive(value, max, field) {
  if (value == null) return value;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return text(value, max, field, false);
  throw new Error(field + ' inválido');
}

function safeValue(value, depth, field) {
  if (depth > 3) throw new Error(field + ' profundo demais');
  if (value == null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') return primitive(value, 300, field);
  if (Array.isArray(value)) {
    if (value.length > 24) throw new Error(field + ' grande demais');
    return value.map((item, index) => safeValue(item, depth + 1, field + '[' + index + ']'));
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 24) throw new Error(field + ' grande demais');
    const out = {};
    keys.forEach((key) => { out[key] = safeValue(value[key], depth + 1, field + '.' + key); });
    return out;
  }
  throw new Error(field + ' inválido');
}

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('aviso inválido');
  const type = text(input.type, 80, 'tipo', true);
  const tournamentId = text(input.tournamentId, 200, 'tournamentId', false);
  if (!SOCIAL_TYPES.has(type) && !TOURNAMENT_TYPES.has(type) && !SELF_TYPES.has(type)) throw new Error('tipo de aviso não permitido');

  const out = {
    type,
    tournamentId,
    tournamentName: text(input.tournamentName, 240, 'tournamentName', false),
    matchId: text(input.matchId, 200, 'matchId', false),
    title: text(input.title, 240, 'title', false),
    message: text(input.message, 2000, 'message', true),
    level: ['fundamental', 'important', 'all'].includes(input.level) ? input.level : 'all'
  };

  // Campos de ação usados pelos cards são permitidos somente como primitivos;
  // objetos arbitrários no payload transformariam esta coleção em canal de dados.
  const allowedExtras = [
    'casualMatchDocId', 'casualRoomCode', 'casualSlotIndex', 'casualGuestName', 'casualSport',
    'roomCode', 'sport', 'openProfile', 'missingFields', 'scheduleId', 'placeId',
    'round', 'phase', 'participantUid', 'inviteId', 'claimId', 'requestId',
    'pairRequestId', 'groupId', 'groupUrl', 'waGroupLink', 'action', 'url',
    'inviteType', 'liveId', 'scoreboard'
  ];
  allowedExtras.forEach((key) => {
    if (input[key] === undefined) return;
    if (key === 'missingFields') {
      if (!Array.isArray(input[key]) || input[key].length > 16 || input[key].some((v) => typeof v !== 'string' || v.length > 80)) {
        throw new Error(key + ' inválido');
      }
      out[key] = input[key].slice();
      return;
    }
    out[key] = key === 'scoreboard' ? safeValue(input[key], 0, key) : primitive(input[key], 300, key);
  });
  return out;
}

function authorize(notification, facts) {
  const f = facts || {};
  if (!f.callerUid || !f.targetUid) return { allowed: false, reason: 'missing' };
  if (f.callerUid === f.targetUid) {
    if (SELF_TYPES.has(notification.type)) return { allowed: true, scope: 'self' };
    // Alguns avisos operacionais pertencem também ao organizador/participante
    // que os disparou (por exemplo, o convite do grupo oficial). A relação com
    // o torneio continua obrigatória; a exceção não abre uma caixa autoescrita
    // genérica.
    if (notification.tournamentId && TOURNAMENT_TYPES.has(notification.type) &&
        (f.callerOrganizer || f.callerParticipant)) return { allowed: true, scope: 'tournament-self' };
    return { allowed: false, reason: 'self' };
  }
  if (SOCIAL_TYPES.has(notification.type) && f.areFriends) {
    return f.areFriends ? { allowed: true, scope: 'friend' } : { allowed: false, reason: 'friendship-required' };
  }
  if (!notification.tournamentId) return { allowed: false, reason: 'tournament-required' };
  const callerRelated = !!f.callerOrganizer || !!f.callerParticipant;
  const targetRelated = !!f.targetOrganizer || !!f.targetParticipant;
  // Convites de torneio e de coorganização podem chegar antes da inscrição,
  // mas apenas a uma amizade já aceita do remetente.
  const inviteToFriend = (notification.type === 'tournament_invite' ||
    notification.type === 'cohost_invite' || notification.type === 'host_transfer_invite') && !!f.areFriends;
  if (callerRelated && (targetRelated || inviteToFriend)) return { allowed: true, scope: 'tournament' };
  return { allowed: false, reason: 'tournament-relation-required' };
}

function notificationId(targetUid, notification, now, senderUid) {
  const day = new Date(now || Date.now()).toISOString().slice(0, 10);
  // O destinatário pode receber o mesmo evento de mais de uma pessoa no mesmo
  // dia. O remetente deriva do token, não do navegador, e evita que um aviso
  // válido sobrescreva outro apenas por ter o mesmo texto.
  const raw = [notification.type, notification.tournamentId || '', notification.matchId || '', day, notification.message, targetUid, senderUid || ''].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) hash = ((hash * 31) + raw.charCodeAt(i)) | 0;
  return [notification.type, notification.tournamentId || '', notification.matchId || '', day, (hash >>> 0).toString(36), targetUid]
    .join('|').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

module.exports = { SOCIAL_TYPES, TOURNAMENT_TYPES, normalize, authorize, notificationId };
