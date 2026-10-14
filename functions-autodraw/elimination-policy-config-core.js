'use strict';

const VALID_POLICIES = new Set(['repescagem', 'bye', 'sobra_unica']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

function validateAndCanonicalizeExplicitPolicy(config, HttpsError) {
  if (!config || typeof config !== 'object') return;
  const entries = [];
  if (own(config, 'politicaDaChave')) entries.push([config, 'politicaDaChave', 'politicaDaChave']);
  const elimination = config.fmt2 && config.fmt2.eliminatoria;
  if (elimination && typeof elimination === 'object' && own(elimination, 'politicaDaChave')) {
    entries.push([elimination, 'politicaDaChave', 'fmt2.eliminatoria.politicaDaChave']);
  }
  entries.forEach(([target, key, path]) => {
    const value = target[key];
    if (typeof value !== 'string' || (value !== 'playin' && !VALID_POLICIES.has(value))) {
      throw new HttpsError('invalid-argument', 'Política de chave inválida em ' + path + '.');
    }
  });
  // O request já foi clonado pela fronteira de escrita. Só esse clone é alterado;
  // `playin` continua legível em documentos antigos, mas não nasce em novos writes.
  entries.forEach(([target, key]) => { if (target[key] === 'playin') target[key] = 'repescagem'; });
}

module.exports = { validateAndCanonicalizeExplicitPolicy };
