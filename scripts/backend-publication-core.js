'use strict';

// O manifesto de um corte direcionado não substitui o carimbo do codebase:
// ele só prova as callables declaradas, no commit exato que tocou autodraw.
function autodrawExports(source) {
  return new Set(Array.from(String(source || '').matchAll(/^exports\.([A-Za-z0-9_]+)\s*=/gm), match => match[1]));
}

function checkTargetedPublication(manifest, receipt, backendCommit, exportedNames) {
  if (!manifest || manifest.schema !== 1 || manifest.backendCommit !== backendCommit ||
      !Array.isArray(manifest.functions) || manifest.functions.length === 0) {
    return { ok:false, reason:'manifesto ausente, vazio ou de outro commit' };
  }
  const names = manifest.functions;
  const unique = new Set(names);
  if (unique.size !== names.length || names.some(name =>
    typeof name !== 'string' || !/^[A-Za-z0-9_]+$/.test(name) || !exportedNames.has(name))) {
    return { ok:false, reason:'manifesto contém função repetida ou inexistente' };
  }
  const entries = receipt && receipt.schema === 1 && receipt.entries && typeof receipt.entries === 'object'
    ? receipt.entries : {};
  const missing = names.filter(name => {
    const entry = entries[name];
    return !entry || entry.backendCommit !== backendCommit || entry.mode !== 'only' ||
      entry.result !== 'success' || !/^\d{4}-\d\d-\d\dT/.test(String(entry.deployedAt || ''));
  });
  return missing.length ? { ok:false, reason:'funções sem recibo confirmado: ' + missing.join(', ') }
    : { ok:true, verified:names, unverified:exportedNames.size - names.length };
}

module.exports = { autodrawExports, checkTargetedPublication };
