'use strict';

const active = require('./config-ativa-core');

// A fase classificatória já sorteada continua intacta. Somente a eliminatória
// ainda não materializada e os parâmetros que selecionam quem entra nela podem
// mudar; o compilador do servidor produz o novo plano da próxima fase.
function plan(t, proposed, compile, validate, ErrorType) {
  if (!t || !(t.rulesContractVersion >= 2) || t.status === 'finished' ||
      Number(t.currentPhaseIndex || 0) !== 0 || !Array.isArray(t.phases) ||
      !t.phases[0] || t.phases[0].kind !== 'classification' ||
      !t.fmt2 || !t.fmt2.eliminatoria || t.fmt2.eliminatoria.ativa !== true ||
      !proposed || !proposed.eliminatoria || proposed.eliminatoria.ativa !== true ||
      !Array.isArray(t.phases.slice(1)) ||
      t.phases.slice(1).some(p => p && (p.startedAt || p.materializedAt)) ||
      Object.values((t.phaseTieDecisions || {})['0'] || {}).some(Boolean)) return null;
  const futureGames = (t.matches || []).some(m => m && Number(m.phaseIndex || 0) > 0) ||
    (Array.isArray(t.phaseRounds) ? t.phaseRounds : []).slice(1)
      .some(p => p && (p.rounds || []).some(r => (r.matches || []).length));
  if (futureGames || Number(t._phaseMaterialized || 0) > 0) return null;
  const allowed = active.CAMINHOS_ATIVOS_FMT2.concat(['eliminatoria', 'classificados', 'classifScope']);
  const merged = active.fmt2Atualizavel(t.fmt2, proposed, allowed);
  if (!merged.ok) return null;
  validate(merged.valor, ErrorType, t, t.teamSize);
  require('./elimination-policy-config-core').validateAndCanonicalizeExplicitPolicy(merged.valor, ErrorType);
  const compiled = compile(merged.valor, { sport: t.sport, resultEntry: t.resultEntry || ['organizer'],
    lateEnrollment: t.lateEnrollment, newMatchups: t.newMatchups });
  if (!compiled || !Array.isArray(compiled.phases) || compiled.phases.length < 2 ||
      !compiled.phases[0] || compiled.phases[0].kind !== 'classification' ||
      compiled.phases.slice(1).some(p => !p || p.kind !== 'elimination' && p.kind !== 'classification')) {
    throw new ErrorType('failed-precondition', 'A configuração futura não produziu fases executáveis.');
  }
  return { fmt2: compiled.cfg, phases: compiled.phases.slice(1),
    gruposClassified: compiled.topLevel.gruposClassified,
    politicaDaChave: compiled.topLevel.politicaDaChave };
}

module.exports = { plan };
