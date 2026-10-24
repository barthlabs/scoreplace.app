'use strict';

// A ordem é o resultado de um sorteio feito pela organização. Este módulo não sorteia.
function hasFrozenClassification(tournament) {
  const t = tournament || {};
  if (Number(t.currentPhaseIndex || 0) > 0) return true;
  if (t.classifFinalDaLinha && Object.keys(t.classifFinalDaLinha).length) return true;
  const seen = new Set();
  const stack = [t];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node.classifCongelada) || node.classifCongeladaAt) return true;
    for (const key of ['rounds', 'phaseRounds', 'phases', 'groups', 'monarchGroups']) {
      const children = node[key];
      if (Array.isArray(children)) stack.push(...children);
      else if (children && typeof children === 'object') stack.push(...Object.values(children));
    }
  }
  return false;
}

function validateTeamTieDrawOrder(tournament, orderedTeamIds) {
  const t = tournament || {};
  if (t.status === 'finished' || t.finishedAt || hasFrozenClassification(t)) {
    return { code: 'failed-precondition', message: 'A classificação já foi encerrada ou publicada.' };
  }
  const config = t.teamCompetition || {};
  if (config.enabled !== true || config.classificationUnit === 'pair' ||
      !Array.isArray(config.tiebreakers) || !config.tiebreakers.includes('sorteio')) {
    return { code: 'failed-precondition', message: 'O sorteio de desempate por times não está configurado.' };
  }
  const teams = Array.isArray(t.competitionTeams) ? t.competitionTeams : [];
  const ids = teams.map(team => typeof team?.id === 'string' ? team.id.trim() : '');
  if (ids.length < 2 || ids.length > 128 || ids.some(id => !id) || new Set(ids).size !== ids.length) {
    return { code: 'failed-precondition', message: 'Os times canônicos ainda não estão definidos.' };
  }
  if (!Array.isArray(orderedTeamIds) || orderedTeamIds.length !== ids.length ||
      orderedTeamIds.some(id => typeof id !== 'string' || !ids.includes(id)) ||
      new Set(orderedTeamIds).size !== ids.length) {
    return { code: 'invalid-argument', message: 'A ordem deve conter todos os times, uma vez cada.' };
  }
  return null;
}

module.exports = { hasFrozenClassification, validateTeamTieDrawOrder };
