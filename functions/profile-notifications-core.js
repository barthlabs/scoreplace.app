'use strict';
const LEVELS = new Set(['todas', 'importantes', 'fundamentais', 'none']);
const KEYS = ['notifyPlatform', 'notifyEmail', 'notifyWhatsApp', 'notifyLevel'];
function normalizeNotificationPreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('preferências inválidas');
  const keys = Object.keys(input);
  if (!keys.length || keys.some((key) => KEYS.indexOf(key) === -1)) throw new Error('campo de notificação não permitido');
  const out = {};
  ['notifyPlatform', 'notifyEmail', 'notifyWhatsApp'].forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      if (typeof input[key] !== 'boolean') throw new Error('canal de notificação inválido');
      out[key] = input[key];
    }
  });
  if (Object.prototype.hasOwnProperty.call(input, 'notifyLevel')) {
    if (!LEVELS.has(input.notifyLevel)) throw new Error('nível de notificação inválido');
    out.notifyLevel = input.notifyLevel;
  }
  return out;
}
module.exports = { LEVELS, normalizeNotificationPreferences };
