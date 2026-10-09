'use strict';

/* Decide se a projeção lossless de fases precisa ser persistida. A função não
 * conhece Firestore e não muta o torneio: o escritor escolhe a transação e
 * grava apenas `phases`. Assim uma migração nunca toca elenco, chave, rodada,
 * jogo ou placar. `project` é a única implementação da tradução (FORMAT2). */
function planLegacyPhaseProjection(tournament, project) {
  if (!tournament || typeof tournament !== 'object') {
    return { changed: false, reason: 'invalid-tournament' };
  }
  if (typeof project !== 'function') {
    throw new Error('projector de fases indisponível');
  }
  const out = project(tournament) || {};
  const phases = Array.isArray(out.phases) ? out.phases : [];
  if (!phases.length) throw new Error('projeção de fases vazia');
  if (!out.changed) return { changed: false, reason: 'already-canonical', phases };
  return { changed: true, reason: out.created ? 'created-from-legacy' : 'completed-canonical-fields', phases };
}

module.exports = { planLegacyPhaseProjection };
