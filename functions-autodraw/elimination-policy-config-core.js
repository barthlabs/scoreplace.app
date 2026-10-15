'use strict';

const VALID_POLICIES = new Set(['repescagem', 'bye', 'sobra_unica']);
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

// Datas, nomes e demais ajustes da ficha não revalidam uma política histórica
// que a edição não tocou. A projeção contém somente os campos que determinam
// a compatibilidade da política com o formato e a fase.
function policyShape(config) {
  const c = config && typeof config === 'object' ? config : {};
  const elimination = value => value && typeof value === 'object' ? {
    politicaDaChave: value.politicaDaChave,
    dupla: value.dupla
  } : null;
  return JSON.stringify({
    politicaDaChave: c.politicaDaChave,
    fmt2: elimination(c.fmt2 && c.fmt2.eliminatoria),
    eliminatoria: elimination(c.eliminatoria),
    phases: Array.isArray(c.phases) ? c.phases.map(phase => phase && typeof phase === 'object' ? {
      kind: phase.kind,
      formatCode: phase.formatCode,
      format: phase.format,
      politicaDaChave: phase.politicaDaChave,
      bracketType: phase.elimination && phase.elimination.bracketType
    } : null) : []
  });
}

function canonicalizePolicyAliases(config, stored) {
  if (!config || typeof config !== 'object') return;
  const old = stored && typeof stored === 'object' ? stored : {};
  if (config.politicaDaChave === 'playin' && old.politicaDaChave !== 'playin') config.politicaDaChave = 'repescagem';
  [
    [config.fmt2 && config.fmt2.eliminatoria, old.fmt2 && old.fmt2.eliminatoria],
    [config.eliminatoria, old.eliminatoria]
  ].forEach(([elimination, previous]) => {
    if (elimination && elimination.politicaDaChave === 'playin' &&
        (!previous || previous.politicaDaChave !== 'playin')) elimination.politicaDaChave = 'repescagem';
  });
  if (Array.isArray(config.phases)) config.phases.forEach((phase, index) => {
    const previous = Array.isArray(old.phases) ? old.phases[index] : null;
    if (phase && phase.politicaDaChave === 'playin' &&
        (!previous || previous.politicaDaChave !== 'playin')) phase.politicaDaChave = 'repescagem';
  });
}

function validateAndCanonicalizeExplicitPolicy(config, HttpsError) {
  if (!config || typeof config !== 'object') return;
  const entries = [];
  if (own(config, 'politicaDaChave')) entries.push([config, 'politicaDaChave', 'politicaDaChave']);
  // A ficha pode enviar ambos os envelopes; applyTournamentFormat recebe fmt2
  // diretamente. Nenhum deles pode esconder uma política ou um toggle do outro.
  const eliminations = [
    [config.fmt2 && config.fmt2.eliminatoria, 'fmt2.eliminatoria.politicaDaChave'],
    [config.eliminatoria, 'eliminatoria.politicaDaChave']
  ].filter(([value]) => value && typeof value === 'object' && !Array.isArray(value));
  eliminations.forEach(([elimination, path]) => {
    if (own(elimination, 'politicaDaChave')) entries.push([elimination, 'politicaDaChave', path]);
  });
  entries.forEach(([target, key, path]) => {
    const value = target[key];
    if (typeof value !== 'string' || (value !== 'playin' && !VALID_POLICIES.has(value))) {
      throw new HttpsError('invalid-argument', 'Política de chave inválida em ' + path + '.');
    }
  });
  const canonical = ([target, key]) => target[key] === 'playin' ? 'repescagem' : target[key];
  if (entries.length > 1) {
    if (entries.some(entry => canonical(entry) !== canonical(entries[0]))) {
      throw new HttpsError('invalid-argument', 'As políticas de chave informadas não coincidem.');
    }
  }
  const doubleValues = eliminations.filter(([elimination]) => own(elimination, 'dupla'))
    .map(([elimination]) => elimination.dupla === true);
  if (doubleValues.length > 1 && doubleValues.some(value => value !== doubleValues[0])) {
    throw new HttpsError('invalid-argument', 'Os formatos de eliminação informados não coincidem.');
  }
  if (doubleValues.includes(true) && entries.some(entry => canonical(entry) !== 'repescagem')) {
    throw new HttpsError('invalid-argument', 'BYE e sobra única são incompatíveis com dupla eliminação.');
  }
  // A política pode ser diferente em cada fase. Validar a fase com seu próprio
  // formato (e, se não declarada, com o fallback do torneio), sem exigir que
  // fases distintas repitam a política do topo.
  const phases = Array.isArray(config.phases) ? config.phases : [];
  phases.forEach((phase, index) => {
    if (!phase || typeof phase !== 'object' || Array.isArray(phase)) return;
    const path = 'phases[' + index + '].politicaDaChave';
    if (own(phase, 'politicaDaChave')) {
      if (typeof phase.politicaDaChave !== 'string' ||
          (phase.politicaDaChave !== 'playin' && !VALID_POLICIES.has(phase.politicaDaChave))) {
        throw new HttpsError('invalid-argument', 'Política de chave inválida em ' + path + '.');
      }
    }
    const isElimination = phase.kind === 'elimination' ||
      (phase.kind !== 'classification' &&
        (phase.formatCode === 'elim_dupla' || phase.formatCode === 'elim_simples' ||
          /eliminat|mata.mata/i.test(String(phase.format || ''))));
    const isDouble = phase.elimination && phase.elimination.bracketType === 'double' ||
      (phase.kind !== 'elimination' &&
        (phase.formatCode === 'elim_dupla' || /dupla eliminat/i.test(String(phase.format || ''))));
    const phasePolicy = own(phase, 'politicaDaChave') ? phase.politicaDaChave :
      (entries.length ? entries[0][0][entries[0][1]] : 'repescagem');
    if (isElimination && isDouble && phasePolicy !== 'repescagem' && phasePolicy !== 'playin') {
      throw new HttpsError('invalid-argument', 'BYE e sobra única são incompatíveis com dupla eliminação em phases[' + index + '].');
    }
  });
  // O request já foi clonado pela fronteira de escrita. Só esse clone é alterado;
  // `playin` continua legível em documentos antigos, mas não nasce em novos writes.
  entries.forEach(([target, key]) => { if (target[key] === 'playin') target[key] = 'repescagem'; });
  phases.forEach(phase => {
    if (phase && phase.politicaDaChave === 'playin') phase.politicaDaChave = 'repescagem';
  });
}

module.exports = { validateAndCanonicalizeExplicitPolicy, policyShape, canonicalizePolicyAliases };
