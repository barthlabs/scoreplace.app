'use strict';
const PLATFORMS = new Set(['web', 'ios', 'android']);
function normalizeSessionStamp(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => k !== 'version' && k !== 'platform')) throw new Error('carimbo de sessão inválido');
  if (typeof input.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.version)) throw new Error('versão inválida');
  if (!PLATFORMS.has(input.platform)) throw new Error('plataforma inválida');
  return { version: input.version, platform: input.platform };
}
module.exports = { PLATFORMS, normalizeSessionStamp };
