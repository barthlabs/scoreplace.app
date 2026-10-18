'use strict';
const R = require('./registration-core');
const M = require('./registration-migration-core');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const report = R.projectLegacyRoster('t1', [
  { sourceKey: 'dupla-1', entry: { p1Uid: 'u1', p2Name: 'Convidada', category: 'cat-a' } },
  { sourceKey: 'solo-1', entry: { uid: 'u3', category: 'cat-b' } },
]);
const first = M.decideMaterialization('t1', report, {});
ok('gera um documento por pessoa e categoria', first.creates.length === 3 && first.conflicts.length === 0);
const pairDocs = first.creates.filter((item) => item.fixedPairId);
ok('dupla formada fica vinculada nos dois registros da categoria', pairDocs.length === 2 && pairDocs[0].fixedPairId === pairDocs[1].fixedPairId);
ok('convidada usa identidade manual, não nome', pairDocs.some((item) => item.participantKind === 'manual' && item.manualParticipantId.indexOf('legacy-manual-') === 0));
ok('convidada preserva nome somente para exibição no torneio', pairDocs.some((item) => item.participantKind === 'manual' && item.manualDisplayName === 'Convidada'));
ok('conta usa somente UID', pairDocs.some((item) => item.participantKind === 'account' && item.participantUid === 'u1' && item.manualParticipantId === null));

const stored = Object.fromEntries(first.creates.map((item) => [item.registrationId, Object.assign({}, item, { createdAt: 'server-time' })]));
const second = M.decideMaterialization('t1', report, stored);
ok('reaplicar o mesmo plano é no-op', second.creates.length === 0 && second.already.length === 3 && second.conflicts.length === 0);
stored[first.creates[0].registrationId].participantUid = 'outra-conta';
ok('nunca sobrescreve uma inscrição canônica divergente', M.decideMaterialization('t1', report, stored).conflicts.length === 1);
const extra = Object.assign({}, stored, { extra_canonic: { registrationId: 'extra_canonic' } });
ok('bloqueia documento canônico que a fotografia legada não explica', M.decideMaterialization('t1', report, extra).unexpectedExisting.length === 1);
const target = first.creates.find((item) => item.participantKey === 'uid:u3');
const legacyUncategorized = Object.assign({}, stored, {
  [R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID)]: {
    registrationId: R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID), tournamentId: 't1', categoryId: R.UNCATEGORIZED_CATEGORY_ID,
    participantKey: 'uid:u3', participantKind: 'account', participantUid: 'u3', manualParticipantId: null,
    status: 'confirmed', validationState: 'legacy_imported', fixedPairId: null,
  }
});
const repairable = M.decideMaterialization('t1', report, legacyUncategorized);
ok('detecta somente cópia sem categoria importada como candidata a aposentadoria', repairable.reconciliationCandidates.length === 1 && repairable.reconciliationCandidates[0].supersededByRegistrationId === target.registrationId);
const retired = Object.assign({}, legacyUncategorized, {
  [R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID)]: Object.assign({}, legacyUncategorized[R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID)], {
    status: 'withdrawn', validationState: 'superseded_legacy_category_projection', withdrawnReason: 'category_projection_superseded', supersededByRegistrationId: target.registrationId,
  })
});
const reconciled = M.decideMaterialization('t1', report, retired);
ok('histórico aposentado deixa de ser uma sobra bloqueante', reconciled.unexpectedExisting.length === 0 && reconciled.historicalExisting.length === 1);
const pairedOld = Object.assign({}, stored, {
  [R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID)]: Object.assign({}, legacyUncategorized[R.registrationId('uid:u3', R.UNCATEGORIZED_CATEGORY_ID)], { fixedPairId: 'old-pair' })
});
ok('não aposenta uma metade de dupla sem a outra metade correspondente', M.decideMaterialization('t1', report, pairedOld).reconciliationCandidates.length === 0);

const inverseReport = R.projectLegacyRoster('t2', [
  { sourceKey: 'pair-inverse', entry: { p1Uid: 'a', p2Uid: 'b' } },
]);
const inverseDesired = M.desiredDocuments('t2', inverseReport);
ok('projeção inversa preserva o lote sem categoria e a dupla', inverseDesired.length === 2 &&
  inverseDesired.every((item) => item.categoryId === R.UNCATEGORIZED_CATEGORY_ID && !!item.fixedPairId));
const inverseExisting = Object.fromEntries(inverseDesired.map((item) => [item.registrationId, item]));
const typedOld = inverseDesired.map((item) => Object.assign({}, item, {
  registrationId: R.registrationId(item.participantKey, 'cat-old'), categoryId: 'cat-old',
}));
typedOld.forEach((item) => { inverseExisting[item.registrationId] = item; });
const inverseDecision = M.decideMaterialization('t2', inverseReport, inverseExisting);
ok('detecta as duas cópias tipadas antigas da dupla como candidatas coerentes',
  inverseDecision.reconciliationCandidates.length === 2 && inverseDecision.unexpectedExisting.length === 2 &&
  inverseDecision.creates.length === 0 && inverseDecision.conflicts.length === 0);
const inverseRetired = Object.assign({}, inverseExisting);
inverseDecision.reconciliationCandidates.forEach((candidate) => {
  inverseRetired[candidate.registrationId] = Object.assign({}, inverseRetired[candidate.registrationId], {
    status: 'withdrawn', validationState: 'superseded_legacy_category_projection',
    withdrawnReason: 'category_projection_superseded', supersededByRegistrationId: candidate.supersededByRegistrationId,
    fixedPairId: null,
  });
});
const inverseAgain = M.decideMaterialization('t2', inverseReport, inverseRetired);
ok('segundo exame do estado aposentado é idempotente e classifica histórico',
  inverseAgain.reconciliationCandidates.length === 0 && inverseAgain.unexpectedExisting.length === 0 &&
  inverseAgain.historicalExisting.length === 2);
const inverseActive = Object.assign({}, inverseExisting, {
  [typedOld[0].registrationId]: Object.assign({}, typedOld[0], { status: 'waitlisted' }),
});
ok('não aposenta cópia que deixou de estar confirmada', M.decideMaterialization('t2', inverseReport, inverseActive).reconciliationCandidates.length === 0);
const inverseWrongCategory = Object.assign({}, inverseExisting, {
  [typedOld[0].registrationId]: Object.assign({}, typedOld[0], { categoryId: R.UNCATEGORIZED_CATEGORY_ID }),
});
ok('não confunde outra cópia sem categoria com o ramo inverso',
  M.decideMaterialization('t2', inverseReport, inverseWrongCategory).reconciliationCandidates.length === 0);
const inverseWrongPair = Object.assign({}, inverseExisting, {
  [typedOld[0].registrationId]: Object.assign({}, typedOld[0], { fixedPairId: 'different-pair' }),
});
ok('não aposenta dupla incoerente', M.decideMaterialization('t2', inverseReport, inverseWrongPair).reconciliationCandidates.length === 0);
const inverseAmbiguousReport = R.projectLegacyRoster('t3', [
  { sourceKey: 'solo-a', entry: { uid: 'a' } },
  { sourceKey: 'solo-a-again', entry: { uid: 'a' } },
]);
ok('duplicidade na projeção continua identificada como conflito', inverseAmbiguousReport.conflicts.length > 0);
bad('duplicidade na projeção não libera reconciliação', () => M.decideMaterialization('t3', inverseAmbiguousReport, {}));
bad('recusa plano ainda com exceções', () => M.desiredDocuments('t1', Object.assign({}, report, { unsupported: [{ reason: 'x' }] })));

const server = fs.readFileSync(__dirname + '/index.js', 'utf8');
const start = server.indexOf('exports.applyCanonicalRegistrationMigration = onCall');
const body = start === -1 ? '' : server.slice(start, server.indexOf('\n// Configuração tipada', start));
const helperStart = server.indexOf('async function _applyCanonicalRegistrationMigrationForOrganizer');
const helper = helperStart === -1 ? '' : server.slice(helperStart, start);
ok('callable de migração existe', start !== -1);
ok('callable exige fingerprint e organização por UID', body.includes('expectedFingerprint') && helper.includes('_isTournamentOrgCaller(tournament, callerUid)'));
ok('migração só é liberada depois das mutações canônicas e conserva a trava do servidor',
  server.includes('const _CANONICAL_REGISTRATION_MUTATIONS_READY = true;') &&
  helper.includes('if (!_CANONICAL_REGISTRATION_MUTATIONS_READY)') && helper.includes('operações canônicas de elenco não foram concluídas'));
ok('callable relê registros físicos e recusa plano alterado', helper.includes('lerRegistrosDaParte') && helper.includes('report.fingerprint !== expectedFingerprint'));
ok('callable cria somente operações decididas pelo núcleo', helper.includes('decision.creates.forEach') && helper.includes('tx.create('));
ok('callable não reescreve participants nem resultados legados', !/gravar\(tx, ref.*participants/.test(helper) && !/matches\s*:/.test(helper));
const reconciliationStart = server.indexOf('async function _reconcileLegacyCanonicalRegistrationProjectionForOrganizer');
const reconciliation = reconciliationStart === -1 ? '' : server.slice(reconciliationStart, server.indexOf('exports.applyCanonicalRegistrationMigrationBatch = onCall', reconciliationStart));
ok('reconciliação preserva histórico, exige fingerprint e recusa qualquer sobra fora do caso conhecido',
  reconciliation.includes('expectedFingerprint') && reconciliation.includes('category_projection_superseded') &&
  reconciliation.includes('decision.unexpectedExisting.length !== candidateIds.size') &&
  reconciliation.includes('_hasCanonicalTournamentDraw(tournament)'));
ok('lote usa o mesmo helper transacional e limita dez torneios',
  server.includes('exports.applyCanonicalRegistrationMigrationBatch = onCall') &&
  body.includes('_applyCanonicalRegistrationMigrationForOrganizer(db, callerUid, item.tournamentId, item.fingerprint)') &&
  body.includes('_registrationBatchPlan.verifyPlan(data.plan)') &&
  body.includes('_registrationBatchApply.batchRequestFromPlan'));

console.log((fail ? '❌' : '✅') + ' registration-migration-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
