'use strict';

const crypto = require('crypto');

function stable(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
}

function hash(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}

// Tudo fora de `phases` é protegido: a migração não tem autoridade para
// modificar elenco, chave, agenda, resultados nem metadados do torneio.
function protectedFingerprint(tournament) {
  // Cópia rasa basta: esta migração nunca muta o documento de entrada.
  const copy = Object.assign({}, tournament || {});
  delete copy.phases;
  // A posição da fase também é derivada pela projeção de legado. Ela é a
  // tradução segura de `currentStage`, não conteúdo competitivo protegido.
  delete copy.currentPhaseIndex;
  return hash(copy);
}

/* Decide se a projeção lossless de fases precisa ser persistida. A função não
 * conhece Firestore e não muta o torneio: o escritor escolhe a transação e
 * grava apenas `phases`. Assim uma migração nunca toca elenco, chave, rodada,
 * jogo ou placar. `project` é a única implementação da tradução (FORMAT2). */
function planLegacyPhaseProjection(tournament, project, options) {
  if (!tournament || typeof tournament !== 'object') {
    return { changed: false, reason: 'invalid-tournament' };
  }
  if (typeof project !== 'function') {
    throw new Error('projector de fases indisponível');
  }
  const out = project(tournament) || {};
  const phases = Array.isArray(out.phases) ? out.phases : [];
  if (!phases.length) throw new Error('projeção de fases vazia');
  const opts = options || {};
  const tournamentId = String(opts.tournamentId || tournament.id || '').trim();
  const updateTime = String(opts.updateTime || '').trim();
  const receipt = {
    schema: 'legacy-phase-projection-v1',
    tournamentId,
    updateTime,
    // Documento inteiro: evolução de schema exige nova prévia e revisão.
    source: tournament,
    projectedPhases: phases,
  };
  const base = {
    phases,
    currentPhaseIndex: Number.isInteger(out.currentPhaseIndex) ? out.currentPhaseIndex : undefined,
    protectedFingerprint: protectedFingerprint(tournament),
    fingerprint: hash(receipt),
  };
  if (!out.changed) return Object.assign({ changed: false, reason: 'already-canonical' }, base);
  return Object.assign({ changed: true, reason: out.created ? 'created-from-legacy' : 'completed-canonical-fields' }, base);
}

function verifyProjectedDocument(tournamentId, before, after, plan, project) {
  if (!plan || !Array.isArray(plan.phases)) throw new Error('plano de fases inválido');
  if (protectedFingerprint(before) !== protectedFingerprint(after)) {
    throw new Error('campo protegido mudou durante a migração de fases');
  }
  if (stable((after || {}).phases || []) !== stable(plan.phases)) {
    throw new Error('phases persistidas divergem do plano aprovado');
  }
  if (Number.isInteger(plan.currentPhaseIndex) && Number((after || {}).currentPhaseIndex) !== plan.currentPhaseIndex) {
    throw new Error('índice de fase persistido diverge do plano aprovado');
  }
  const afterPlan = planLegacyPhaseProjection(after, project, { tournamentId });
  if (afterPlan.changed) throw new Error('projeção de fases continuou pendente após a escrita');
  return { ok: true, fingerprint: afterPlan.fingerprint };
}

module.exports = { stable, hash, protectedFingerprint, planLegacyPhaseProjection, verifyProjectedDocument };
