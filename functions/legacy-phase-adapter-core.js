'use strict';

/*
 * Leitura de fase histórica para o vocabulário do domínio novo.
 *
 * O resultado é um diagnóstico, não uma migração nem um plano de sorteio. Em
 * especial, `elim_simples` não ganha uma política inventada: o motor antigo
 * ignorava bracketResolution, portanto ela precisa de confirmação humana antes
 * de virar phaseConfig canônico.
 */

function classifyLegacyPhase(phase) {
  if (!phase || typeof phase !== 'object' || Array.isArray(phase)) {
    return { supported: false, reason: 'invalid_phase' };
  }
  const code = String(phase.formatCode || '');
  const monarch = phase.drawMode === 'rei_rainha' || phase.ligaRoundFormat === 'rei_rainha' || phase.reiRainha === true;
  if (code === 'liga') {
    return {
      supported: true, migratable: true, kind: 'classification',
      structure: 'round_robin', drawModality: monarch ? 'monarch' : 'standard',
      source: 'legacy_liga',
    };
  }
  if (code === 'grupos_mata') {
    return {
      supported: true, migratable: true, kind: 'classification',
      structure: 'groups', drawModality: monarch ? 'monarch' : 'standard',
      source: 'legacy_groups',
    };
  }
  if (code === 'elim_dupla') {
    return {
      supported: true, migratable: true, kind: 'elimination',
      bracketPolicy: 'repescagem', drawModality: 'standard', source: 'legacy_double_elimination',
    };
  }
  if (code === 'elim_simples' || code === 'elim') {
    return {
      supported: true, migratable: false, kind: 'elimination',
      bracketPolicy: null, drawModality: 'standard', source: 'legacy_single_elimination',
      reason: 'missing_historical_bracket_policy',
    };
  }
  return { supported: false, reason: 'unsupported_format_code', formatCode: code || null };
}

module.exports = { classifyLegacyPhase };
