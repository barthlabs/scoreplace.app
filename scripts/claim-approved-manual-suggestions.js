#!/usr/bin/env node
'use strict';

// One-off organizer-approved import claim. Preview is the default; --apply is explicit.
// The original registration remains withdrawn as an audit trail. The account takes
// its category and draw slots, while its public profile supplies the display name.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');
const boundary = require('../functions/canonical-registration-boundary-core');
const claim = require('../functions/registration-claim-core');
const slots = require('../functions/vendor/participant-slot-core');

const tournamentId = 'tour_1793227218863_f9a70f41fdf7250b0199ba263caa424a';
const apply = process.argv.includes('--apply');
if (process.argv.slice(2).some((arg) => arg !== '--apply')) throw new Error('Use apenas --apply.');
const active = (item) => ['pending', 'confirmed', 'waitlisted'].includes(item.status);
const norm = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const auditId = (manualId) => crypto.createHash('sha256').update(manualId).digest('hex');
const digest = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const frozenKeys = new Set(['standings', 'classification', 'rankingRows', 'classifCongelada']);
function frozenFields(value) {
  if (!value || typeof value !== 'object') return 0;
  return Object.entries(value).reduce((total, [key, item]) => total +
    (frozenKeys.has(key) && item != null && (Array.isArray(item) ? item.length > 0 :
      typeof item === 'object' ? Object.keys(item).length > 0 : !!item) ? 1 : 0), 0);
}

function plan(tournament, registrations, matches, suggestions, profiles, existingAudits) {
  if (tournament.id !== tournamentId || tournament.status !== 'active' || tournament.pendingDraw ||
      tournament.organizerOnly === true || tournament.testModeEnabled === true) {
    throw new Error('Estado do torneio mudou; revise antes de vincular.');
  }
  if (registrations.length !== 48 || matches.length !== 84 || suggestions.length !== 18) {
    throw new Error('A fotografia aprovada mudou; revise os vínculos antes de aplicar.');
  }
  if (matches.some(({ data }) => slots.finished(data.jogo || data) || slots.scored(data.jogo || data) ||
      (data.jogo || data).courtCalledAt || (data.jogo || data).startedAt)) {
    throw new Error('Já há jogo em andamento ou com resultado; esta migração exige nova análise.');
  }
  if (frozenFields(tournament) || matches.some(({ data }) => frozenFields(data) || frozenFields(data.jogo))) {
    throw new Error('Há classificação congelada na raiz ou nos jogos; migração separada necessária.');
  }
  const verified = boundary.verifiedRoster(tournament, registrations);
  if (verified.migration.fingerprint !== `native:${tournamentId}`) {
    throw new Error('Fingerprint canônico mudou; revisão necessária.');
  }
  const all = verified.registrations;
  const seenUids = new Set(), seenManual = new Set();
  const mappings = suggestions.map(({ data }) => {
    const manualId = String(data.manualParticipantId || '');
    const uid = String(data.suggestedUid || '');
    if (data.source !== 'organizer-confirmed-2026-11-27' || !manualId || !uid ||
        seenManual.has(manualId) || seenUids.has(uid) || existingAudits.has(auditId(manualId))) {
      throw new Error('Sugestão não aprovada, duplicada ou já aplicada.');
    }
    seenManual.add(manualId); seenUids.add(uid);
    const sources = all.filter((item) => active(item) && item.participantKind === 'manual' && item.manualParticipantId === manualId);
    const profile = profiles.get(uid);
    if (sources.length !== 1 || !profile || !profile.displayName || profile.mergedInto) {
      throw new Error(`Vaga ou perfil indisponível: ${manualId}`);
    }
    const source = sources[0];
    if (source.fixedPairId) throw new Error(`Dupla fixa exige migração separada: ${manualId}`);
    if (all.some((item) => active(item) && item.participantKind === 'account' && item.participantUid === uid)) {
      throw new Error(`Conta já inscrita: ${uid}`);
    }
    if (all.filter((item) => active(item) && norm(item.manualDisplayName) === norm(source.manualDisplayName)).length !== 1) {
      throw new Error(`Nome manual ambíguo: ${source.manualDisplayName}`);
    }
    return { manualId, uid, source, profileName: String(profile.displayName).trim() };
  });
  let currentTournament = tournament, currentRegistrations = all;
  const updates = new Map(), creates = new Map();
  for (const mapping of mappings) {
    const change = claim.claimManualParticipant(tournamentId, currentRegistrations, mapping.manualId, mapping.uid);
    if (change.creates.length !== 1) throw new Error('Conta retirada anteriormente exige análise separada.');
    const next = boundary.applyChanges(currentTournament, currentRegistrations, change.updates, change.creates);
    currentTournament = next.tournament; currentRegistrations = next.registrations;
    change.updates.forEach((item) => updates.set(item.registrationId, item));
    change.creates.forEach((item) => creates.set(item.registrationId, item));
    mapping.accountRegistrationId = change.creates[0].registrationId;
    if (!mapping.accountRegistrationId) throw new Error(`Conta de destino ausente: ${mapping.uid}`);
  }
  const identityKeys = new Map(mappings.map(({ manualId, uid }) => [`manual:${manualId}`, `uid:${uid}`]));
  for (const mapping of mappings) {
    const oldKey = `manual:${mapping.manualId}`;
    for (const [field, value] of Object.entries(tournament)) {
      if (field === 'teamOrigins' || field === 'history') continue;
      if (JSON.stringify(value)?.includes(oldKey) ||
          (mapping.source.manualDisplayName !== mapping.profileName &&
            JSON.stringify(value)?.includes(mapping.source.manualDisplayName))) {
        throw new Error(`Referência na raiz exige migração separada: ${field}`);
      }
    }
  }
  const oldOrigins = tournament.teamOrigins || {};
  for (const value of Object.values(oldOrigins)) {
    if (mappings.some(({ manualId, source, profileName }) =>
      JSON.stringify(value)?.includes(`manual:${manualId}`) ||
      (source.manualDisplayName !== profileName && JSON.stringify(value)?.includes(source.manualDisplayName)))) {
      throw new Error('Valor de origem de equipe contém identidade antiga.');
    }
  }
  const teamOrigins = {};
  for (const [key, value] of Object.entries(oldOrigins)) {
    if (!key.startsWith('team:')) throw new Error('Origem de equipe com chave desconhecida.');
    const newKey = 'team:' + key.slice(5).split('|').map((part) => identityKeys.get(part) || part).join('|');
    if (Object.hasOwn(teamOrigins, newKey)) throw new Error('Origem de equipe duplicada após o vínculo.');
    teamOrigins[newKey] = value;
  }
  if (Object.keys(teamOrigins).some((key) => key.slice(5).split('|').some((part) => identityKeys.has(part)))) {
    throw new Error('Origem de equipe ainda aponta à vaga manual.');
  }
  const changedMatches = [];
  for (const entry of matches) {
    let next = entry.data;
    const category = String(next.jogo?.category || '');
    for (const mapping of mappings) {
      const label = tournament.categoryDefinitions.find((item) => item.id === mapping.source.categoryId)?.label;
      if (category !== label) continue;
      const oldKey = `manual:${mapping.manualId}`;
      const beforeGame = next.jogo || next;
      const positions = ['team1', 'team2'].flatMap((team) =>
        (beforeGame[`${team}SlotIds`] || []).flatMap((slotId, index) =>
          slotId === oldKey ? [{ team, index }] : []));
      next = slots.patchTree(next, { from: { manualParticipantId: mapping.manualId },
        to: { uid: mapping.uid }, category: label, oldName: mapping.source.manualDisplayName,
        newName: mapping.profileName, source: mapping.source });
      if (Array.isArray(next.jogo?.groupLetterAssignments)) {
        const game = { ...next.jogo, groupLetterAssignments: next.jogo.groupLetterAssignments.map((row) =>
          norm(row.name) === norm(mapping.source.manualDisplayName)
            ? { ...row, name: mapping.profileName, uid: mapping.uid } : row) };
        next = { ...next, jogo: game };
      }
      const afterGame = next.jogo || next;
      for (const { team, index } of positions) {
        if (afterGame[`${team}SlotIds`]?.[index] !== `uid:${mapping.uid}` ||
            afterGame[`${team}Uids`]?.[index] !== mapping.uid ||
            afterGame[team]?.[index] !== mapping.profileName) {
          throw new Error(`Vaga não foi atualizada no jogo ${entry.id}`);
        }
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(entry.data)) changedMatches.push({ ...entry, next });
  }
  for (const mapping of mappings) {
    const occurrences = changedMatches.filter(({ next }) => {
      const game = next.jogo || next;
      return ['team1SlotIds', 'team2SlotIds'].some((key) =>
        Array.isArray(game[key]) && game[key].includes(`uid:${mapping.uid}`));
    }).length;
    if (!occurrences) throw new Error(`Conta sem confronto atualizado: ${mapping.profileName}`);
    mapping.matchCount = occurrences;
  }
  return { mappings, updates: [...updates.values()], creates: [...creates.values()],
    matches: changedMatches, migration: currentTournament.canonicalRegistrationMigration,
    teamOrigins, memberUids: boundary.memberUids(currentTournament, currentRegistrations) };
}

async function run() {
  const admin = require('firebase-admin');
  const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialPath || !fs.existsSync(credentialPath)) {
    throw new Error('Conta de serviço não configurada em GOOGLE_APPLICATION_CREDENTIALS.');
  }
  const serviceAccount = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
  if (serviceAccount.type !== 'service_account' || serviceAccount.project_id !== 'scoreplace-app' ||
      !serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error('Credencial não é a conta de serviço do projeto scoreplace-app.');
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: 'scoreplace-app' });
  const db = admin.firestore();
  const rootRef = db.collection('tournaments').doc(tournamentId);
  const stamp = admin.firestore.FieldValue.serverTimestamp();
  const makePlan = async (get) => {
    const [root, registrationSnap, matchSnap, suggestionSnap, auditSnap] = await Promise.all([
      get(rootRef), get(rootRef.collection('registrations')),
      get(rootRef.collection('matches')), get(rootRef.collection('manualClaimSuggestions')),
      get(rootRef.collection('manualClaimAudits')),
    ]);
    if (!root.exists) throw new Error('Torneio ausente.');
    const suggestions = suggestionSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    const uids = [...new Set(suggestions.map(({ data }) => data.suggestedUid))];
    const publicSnaps = await Promise.all(uids.map((uid) => get(db.collection('usersPublic').doc(uid))));
    const profiles = new Map(uids.map((uid, i) => [uid, publicSnaps[i].exists ? publicSnaps[i].data() : null]));
    const registrations = registrationSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
    const matches = matchSnap.docs.map((doc) => ({ id: doc.id, ref: doc.ref, data: doc.data() }));
    const backup = { tournament: root.data(), registrations,
      matches: matches.map(({ id, data }) => ({ id, data })),
      suggestions, profiles: uids.map((uid) => ({ uid, data: profiles.get(uid) })),
      priorAudits: auditSnap.docs.map((doc) => ({ id: doc.id, data: doc.data() })) };
    const result = plan(root.data(), registrations.map(({ data }) => data), matches,
      suggestions, profiles, new Set(auditSnap.docs.map((doc) => doc.id)));
    result.backup = backup;
    result.auditsBefore = auditSnap.size;
    result.snapshotHash = digest(backup);
    return result;
  };
  if (!apply) {
    const result = await makePlan((ref) => ref.get());
    console.log(JSON.stringify({ mode: 'preview', fingerprint: result.migration.fingerprint,
      fixedPairs: result.mappings.filter(({ source }) => !!source.fixedPairId).length,
      frozenClassificationFields: frozenFields(result.backup.tournament) +
        result.backup.matches.reduce((sum, match) => sum + frozenFields(match.data) +
          frozenFields(match.data.jogo), 0),
      claims: result.mappings.map(({ source, profileName, matchCount }) =>
      ({ from: source.manualDisplayName, to: profileName, categoryId: source.categoryId, matchCount })),
      updatedMatches: result.matches.length, auditsBefore: result.auditsBefore,
      reactivatedAccounts: result.mappings.length - result.creates.length,
      updatedTeamOrigins: Object.keys(result.teamOrigins).length,
      registrationCount: result.migration.registrationCount,
      memberCount: result.memberUids.length }, null, 2));
    return;
  }
  const before = await makePlan((ref) => ref.get());
  const backupRoot = '/Users/rtb/Documents/Codex/.scoreplace-backups';
  fs.mkdirSync(backupRoot, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupRoot, 0o700);
  const backupDirectory = fs.mkdtempSync(path.join(backupRoot, 'scoreplace-claim-'));
  fs.chmodSync(backupDirectory, 0o700);
  const backupPath = path.join(backupDirectory, 'before.json');
  fs.writeFileSync(backupPath, JSON.stringify(before.backup), { flag: 'wx', mode: 0o600 });
  if (digest(JSON.parse(fs.readFileSync(backupPath, 'utf8'))) !== before.snapshotHash) {
    throw new Error('Cópia de segurança não passou na verificação.');
  }
  const result = await db.runTransaction(async (tx) => {
    const p = await makePlan((ref) => tx.get(ref));
    if (p.snapshotHash !== before.snapshotHash) throw new Error('Dados mudaram após a cópia; nenhuma alteração foi gravada.');
    for (const item of p.updates) tx.set(rootRef.collection('registrations').doc(item.registrationId),
      { ...item, updatedAt: stamp });
    for (const item of p.creates) tx.create(rootRef.collection('registrations').doc(item.registrationId),
      { ...item, createdAt: stamp, updatedAt: stamp });
    for (const item of p.matches) tx.set(item.ref, item.next);
    for (const mapping of p.mappings) tx.create(rootRef.collection('manualClaimAudits').doc(auditId(mapping.manualId)), {
      kind: 'organizer_approved_import_claim', manualParticipantId: mapping.manualId,
      decidedBy: 'owner', authorizationContext: 'owner-chat-2026-11-27-approved-import-uid-crossmatch',
      manualRegistrationId: mapping.source.registrationId, accountRegistrationId: mapping.accountRegistrationId,
      participantUid: mapping.uid, priorName: mapping.source.manualDisplayName,
      profileNameAtClaim: mapping.profileName, categoryId: mapping.source.categoryId,
      inheritedDraw: true, matchCount: mapping.matchCount, claimedAt: stamp });
    tx.update(rootRef, { canonicalRegistrationMigration: p.migration, memberUids: p.memberUids,
      teamOrigins: p.teamOrigins,
      _phaseReadCertificate: admin.firestore.FieldValue.delete(), updatedAt: stamp });
    return { claims: p.mappings.length, updatedMatches: p.matches.length,
      registrationCount: p.migration.registrationCount, memberCount: p.memberUids.length };
  });
  try {
  const [rootAfter, regsAfter, matchesAfter, auditsAfter] = await Promise.all([
    rootRef.get(), rootRef.collection('registrations').get(), rootRef.collection('matches').get(),
    rootRef.collection('manualClaimAudits').get(),
  ]);
  const tournamentAfter = rootAfter.data();
  const registrationsAfter = regsAfter.docs.map((doc) => doc.data());
  const withoutGeneratedTimestamps = (item) => {
    const { createdAt, updatedAt, ...stable } = item;
    return stable;
  };
  boundary.verifiedRoster(tournamentAfter, registrationsAfter);
  if (tournamentAfter.canonicalRegistrationMigration.fingerprint !== before.migration.fingerprint ||
      tournamentAfter.canonicalRegistrationMigration.registrationCount !== result.registrationCount ||
      JSON.stringify(tournamentAfter.memberUids) !== JSON.stringify(before.memberUids) ||
      auditsAfter.size !== before.auditsBefore + before.mappings.length ||
      !isDeepStrictEqual(tournamentAfter.teamOrigins, before.teamOrigins)) {
    throw new Error('Pós-verificação do torneio falhou.');
  }
  const expectedRegistrations = new Map([...before.updates, ...before.creates].map((item) => [item.registrationId, item]));
  for (const doc of regsAfter.docs) {
    const expected = expectedRegistrations.get(doc.id);
    if (expected && !isDeepStrictEqual(withoutGeneratedTimestamps(doc.data()),
        withoutGeneratedTimestamps(expected))) {
      throw new Error(`Inscrição gravada diverge do plano: ${doc.id}`);
    }
  }
  const expectedGames = new Map(before.matches.map((item) => [item.id, item.next]));
  for (const doc of matchesAfter.docs) {
    if (expectedGames.has(doc.id) && !isDeepStrictEqual(doc.data(), expectedGames.get(doc.id))) {
      throw new Error(`Jogo gravado diverge do plano: ${doc.id}`);
    }
  }
  for (const mapping of before.mappings) {
    const manual = registrationsAfter.find((item) => item.registrationId === mapping.source.registrationId);
    const account = registrationsAfter.find((item) => item.registrationId === mapping.accountRegistrationId);
    if (manual?.status !== 'withdrawn' || account?.status !== mapping.source.status ||
        account?.categoryId !== mapping.source.categoryId || account?.participantUid !== mapping.uid ||
        !tournamentAfter.memberUids.includes(mapping.uid)) {
      throw new Error(`Pós-verificação da inscrição falhou: ${mapping.manualId}`);
    }
    let courtSlots = 0;
    for (const doc of matchesAfter.docs) {
      const game = doc.data().jogo || doc.data();
      for (const team of ['team1', 'team2']) {
        const ids = game[`${team}SlotIds`] || [];
        if (ids.includes(`manual:${mapping.manualId}`)) throw new Error(`Vaga manual ainda no jogo ${doc.id}`);
        ids.forEach((id, index) => {
          if (id === `uid:${mapping.uid}` &&
              (game[`${team}Uids`]?.[index] !== mapping.uid || game[team]?.[index] !== mapping.profileName)) {
            throw new Error(`Identidade ou nome divergente no jogo ${doc.id}`);
          }
        });
        courtSlots += ids.filter((id) => id === `uid:${mapping.uid}`).length;
      }
    }
    if (courtSlots !== mapping.matchCount) throw new Error(`Confrontos divergentes: ${mapping.manualId}`);
  }
  console.log(JSON.stringify({ mode: 'applied-and-verified', backupPath,
    backupSha256: before.snapshotHash, ...result }));
  } catch (error) {
    throw new Error(`${error.message} A transação pode ter sido gravada. Backup: ${backupPath}. ` +
      'Suspenda novas alterações e restaure manualmente os documentos desta fotografia após conferir o estado atual.');
  }
}
if (require.main === module) run().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { plan };
