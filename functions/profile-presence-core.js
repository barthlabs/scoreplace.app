'use strict';

const PRESENCE_VISIBILITY = new Set(['friends', 'public', 'off']);
const STATS_VISIBILITY = new Set(['public', 'friends', 'private']);
const KEYS = ['presenceVisibility', 'statsVisibility', 'presenceMuteDays', 'presenceMuteUntil', 'presenceAutoCheckin'];

function normalizePresencePreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('preferências de presença inválidas');
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => KEYS.indexOf(key) === -1)) throw new Error('campo de presença não permitido');
  const out = {};
  if (Object.prototype.hasOwnProperty.call(input, 'presenceVisibility')) {
    if (!PRESENCE_VISIBILITY.has(input.presenceVisibility)) throw new Error('visibilidade de presença inválida');
    out.presenceVisibility = input.presenceVisibility;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'statsVisibility')) {
    if (!STATS_VISIBILITY.has(input.statsVisibility)) throw new Error('visibilidade de estatísticas inválida');
    out.statsVisibility = input.statsVisibility;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'presenceMuteDays')) {
    if (!Number.isInteger(input.presenceMuteDays) || input.presenceMuteDays < 1 || input.presenceMuteDays > 365) throw new Error('duração de silenciamento inválida');
    out.presenceMuteDays = input.presenceMuteDays;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'presenceMuteUntil')) {
    if (!Number.isSafeInteger(input.presenceMuteUntil) || input.presenceMuteUntil < 0) throw new Error('fim de silenciamento inválido');
    out.presenceMuteUntil = input.presenceMuteUntil;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'presenceAutoCheckin')) {
    if (typeof input.presenceAutoCheckin !== 'boolean') throw new Error('check-in automático inválido');
    out.presenceAutoCheckin = input.presenceAutoCheckin;
  }
  return out;
}

module.exports = { PRESENCE_VISIBILITY, STATS_VISIBILITY, normalizePresencePreferences };
