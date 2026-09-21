'use strict';
const FIELDS = new Set(['favorites', 'hiddenTournaments']);
const MAX_ITEMS = 300;
function normalizeTournamentPreference(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((k) => !['field', 'tournamentId', 'add'].includes(k))) throw new Error('preferência de torneio inválida');
  if (!FIELDS.has(input.field)) throw new Error('campo de preferência não permitido');
  if (typeof input.tournamentId !== 'string' || !input.tournamentId.trim() || input.tournamentId.trim().length > 160) throw new Error('torneio inválido');
  if (typeof input.add !== 'boolean') throw new Error('operação de preferência inválida');
  return { field: input.field, tournamentId: input.tournamentId.trim(), add: input.add };
}
module.exports = { FIELDS, MAX_ITEMS, normalizeTournamentPreference };
