'use strict';

/*
 * Pré-checagem pura para fundir contas que já têm registros canônicos.
 *
 * A função não escolhe uma categoria e não altera documentos. Quando duas
 * contas possuem categorias diferentes no mesmo grupo exclusivo do mesmo
 * torneio, uma transferência automática violaria a regra de inscrição. O
 * chamador encaminha o caso à organização. A decisão precisa ocorrer antes do
 * sorteio; a pessoa não entra em qualquer chave enquanto houver conflito.
 */

function active(registration) {
  return registration && registration.participantKind === 'account' &&
    ['pending', 'confirmed', 'waitlisted'].includes(registration.status);
}

function findExclusiveConflicts(input) {
  const definitionsByTournament = (input && input.definitionsByTournament) || {};
  const registrations = ([]).concat((input && input.keepRegistrations) || [], (input && input.dropRegistrations) || [])
    .filter(active);
  const byTournament = new Map();
  registrations.forEach((registration) => {
    const tournamentId = String(registration.tournamentId || '');
    if (!tournamentId) return;
    if (!byTournament.has(tournamentId)) byTournament.set(tournamentId, []);
    byTournament.get(tournamentId).push(registration);
  });
  const conflicts = [];
  for (const [tournamentId, entries] of byTournament) {
    const definitions = Array.isArray(definitionsByTournament[tournamentId]) ? definitionsByTournament[tournamentId] : [];
    const byId = new Map(definitions.map((definition) => [String(definition.id || ''), definition]));
    const groups = new Map();
    entries.forEach((entry) => {
      const definition = byId.get(String(entry.categoryId || ''));
      const group = definition && definition.exclusivityGroup;
      if (!group) return;
      if (!groups.has(group)) groups.set(group, new Set());
      groups.get(group).add(String(entry.categoryId));
    });
    for (const [exclusivityGroup, categoryIds] of groups) {
      if (categoryIds.size > 1) conflicts.push({
        tournamentId, exclusivityGroup, categoryIds: Array.from(categoryIds).sort(),
        reason: 'exclusive_category_merge_conflict', requiresOrganizerReview: true,
        blocksDraw: true,
      });
    }
  }
  return conflicts.sort((a, b) => a.tournamentId.localeCompare(b.tournamentId) || a.exclusivityGroup.localeCompare(b.exclusivityGroup));
}

module.exports = { findExclusiveConflicts };
