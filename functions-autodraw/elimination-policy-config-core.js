'use strict';

const VALID_POLICIES = new Set(['repescagem', 'bye', 'sobra_unica', 'playin']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validateExplicitPolicy(config, HttpsError) {
  if (!config || typeof config !== 'object') return;
  const entries = [];
  if (own(config, 'politicaDaChave')) entries.push(['politicaDaChave', config.politicaDaChave]);
  const elimination = config.fmt2 && config.fmt2.eliminatoria;
  if (elimination && typeof elimination === 'object' && own(elimination, 'politicaDaChave')) {
    entries.push(['fmt2.eliminatoria.politicaDaChave', elimination.politicaDaChave]);
  }
  entries.forEach(([path, value]) => {
    if (typeof value !== 'string' || !VALID_POLICIES.has(value)) {
      throw new HttpsError('invalid-argument', 'Política de chave inválida em ' + path + '.');
    }
  });
}

module.exports = { validateExplicitPolicy };
