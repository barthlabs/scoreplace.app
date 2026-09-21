'use strict';

function normalize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('token de push inválido');
  const token = typeof input.token === 'string' ? input.token.trim() : '';
  const platform = typeof input.platform === 'string' ? input.platform.trim() : '';
  if (token.length < 20 || token.length > 4096) throw new Error('token de push inválido');
  if (!(platform === 'web' || /^native-[a-z0-9_-]{1,32}$/i.test(platform))) throw new Error('plataforma de push inválida');
  return { token, platform };
}

module.exports = { normalize };
