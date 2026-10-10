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

/* Reconstroi a fotografia após uma transição pura antes de qualquer write. A
 * atualização tem de referir um registro que já pertence ao recibo: não há
 * upsert silencioso, mudança de identidade ou alteração de categoria durante
 * retirada/formação de dupla. */
function applyUpdates(tournament, registrations, updates) {
  const before = verifiedRoster(tournament, registrations);
  const replacements = new Map();
  (Array.isArray(updates) ? updates : []).forEach((update) => {
    const id = text(update && update.registrationId);
    if (!id) throw new Error('atualização canônica sem registrationId');
    if (replacements.has(id)) throw new Error('atualização canônica duplicada');
    replacements.set(id, update);
  });
  const existing = new Set(before.registrations.map((item) => item.registrationId));
  replacements.forEach((_, id) => {
    if (!existing.has(id)) throw new Error('atualização canônica fora do elenco');
  });
  return verifiedRoster(tournament, before.registrations.map((item) => replacements.get(item.registrationId) || item));
}

/*
 * Inclusões também precisam atravessar a fronteira. O recibo contém a
 * contagem do conjunto materializado; criar documentos sem avançá-la faria a
 * próxima leitura legítima parecer corrupção. Esta função constrói a próxima
 * fotografia inteira ANTES de a Function tocar Firestore e devolve o recibo
 * já ajustado para a mesma transação gravar ambos atomically.
 */
function applyCreates(tournament, registrations, creates) {
  const before = verifiedRoster(tournament, registrations);
  const additions = Array.isArray(creates) ? creates.slice() : [];
  const existing = new Set(before.registrations.map((item) => item.registrationId));
  const seen = new Set();
  additions.forEach((item) => {
    const id = text(item && item.registrationId);
    if (!id) throw new Error('nova inscrição canônica sem registrationId');
    if (existing.has(id) || seen.has(id)) throw new Error('nova inscrição canônica duplicada');
    seen.add(id);
  });
  const migration = Object.assign({}, tournament.canonicalRegistrationMigration, {
    registrationCount: before.registrations.length + additions.length,
  });
  const nextTournament = Object.assign({}, tournament, { canonicalRegistrationMigration: migration });
  const next = verifiedRoster(nextTournament, before.registrations.concat(additions));
  return Object.assign({ tournament: nextTournament }, next);
}

/* Uma transição pode trocar a identidade estrutural de uma vaga no mesmo
 * commit (por exemplo, vaga manual -> conta). Nesse caso validar primeiro só
 * as atualizações produziria uma dupla órfã temporária, embora a fotografia
 * final seja íntegra. Por isso esta operação monta a fotografia FINAL inteira
 * e a valida uma única vez antes de qualquer write. */
function applyChanges(tournament, registrations, updates, creates) {
  const before = verifiedRoster(tournament, registrations);
  const replacements = new Map();
  (Array.isArray(updates) ? updates : []).forEach((update) => {
    const id = text(update && update.registrationId);
    if (!id) throw new Error('atualização canônica sem registrationId');
    if (replacements.has(id)) throw new Error('atualização canônica duplicada');
    replacements.set(id, update);
  });
  const existing = new Set(before.registrations.map((item) => item.registrationId));
  replacements.forEach((_, id) => {
    if (!existing.has(id)) throw new Error('atualização canônica fora do elenco');
  });

  const additions = Array.isArray(creates) ? creates.slice() : [];
  const seen = new Set();
  additions.forEach((item) => {
    const id = text(item && item.registrationId);
    if (!id) throw new Error('nova inscrição canônica sem registrationId');
    if (existing.has(id) || seen.has(id)) throw new Error('nova inscrição canônica duplicada');
    seen.add(id);
  });
  const nextRegistrations = before.registrations.map((item) => replacements.get(item.registrationId) || item).concat(additions);
  const migration = Object.assign({}, tournament.canonicalRegistrationMigration, {
    registrationCount: nextRegistrations.length,
  });
  const nextTournament = Object.assign({}, tournament, { canonicalRegistrationMigration: migration });
  const next = verifiedRoster(nextTournament, nextRegistrations);
  return Object.assign({ tournament: nextTournament }, next);
}

/* `memberUids` é o índice de entrega do torneio no cliente, não uma cópia de
 * nomes. Ele deve acompanhar qualquer transição canônica, inclusive espera e
 * retirada, ou o registro estará correto mas a pessoa não verá (ou continuará
 * vendo) o torneio. Organização e co-hosts ativos continuam membros mesmo
 * sem inscrição esportiva. */
function memberUids(tournament, registrations) {
  const checked = verifiedRoster(tournament, registrations);
  const values = new Set();
  const add = (value) => { const uid = text(value); if (uid) values.add(uid); };
  add(tournament && tournament.creatorUid);
  (Array.isArray(tournament && tournament.coHosts) ? tournament.coHosts : []).forEach((coHost) => {
    if (coHost && (coHost.status === 'active' || coHost.status === 'accepted')) add(coHost.uid);
  });
  checked.registrations.forEach((registration) => {
    if (registration.status !== 'withdrawn' && registration.participantKind === 'account') add(registration.participantUid);
  });
  return Array.from(values).sort();
}

module.exports = { migrationOf, verifiedRoster, applyUpdates, applyCreates, applyChanges, memberUids };
