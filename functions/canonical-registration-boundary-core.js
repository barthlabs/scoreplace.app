'use strict';

/* Fronteira pura do elenco após materialização.
 *
 * Toda rota que lê ou vier a mutar `registrations` passa por aqui antes de
 * decidir qualquer coisa. Assim não há uma callable que aceite o marcador,
 * outra que ignore contagem e uma terceira que reconstrua o roster de modo
 * diferente. Não lê Firestore, não autoriza usuário e não escreve projeção
 * legada: essas responsabilidades ficam na Function chamadora.
 */
const mutations = require('./registration-mutations-core');
const roster = require('./vendor/registration-roster.js');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function migrationOf(tournament) {
  const raw = tournament && tournament.canonicalRegistrationMigration;
  const migration = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const fingerprint = text(migration.fingerprint);
  if (!fingerprint) throw new Error('torneio ainda não usa inscrições canônicas');
  const expectedCount = Number(migration.registrationCount);
  if (!Number.isInteger(expectedCount) || expectedCount < 0) {
    throw new Error('recibo de migração canônica inválido');
  }
  return { fingerprint, expectedCount };
}

function verifiedRoster(tournament, registrations) {
  const tournamentId = text(tournament && (tournament.id || tournament.tournamentId));
  if (!tournamentId) throw new Error('torneio sem identidade estável');
  const migration = migrationOf(tournament);
  const items = Array.isArray(registrations) ? registrations.slice() : [];
  if (items.length !== migration.expectedCount) {
    throw new Error('inscrições canônicas divergentes; abertura interrompida');
  }
  mutations.indexRegistrations(tournamentId, items);
  let participants;
  try { participants = roster.rosterFromRegistrations(items); }
  catch (error) { throw new Error('elenco canônico inválido: ' + error.message); }
  return { migration, registrations: items, participants };
}

module.exports = { migrationOf, verifiedRoster };
