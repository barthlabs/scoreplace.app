'use strict';

const assert = require('assert');
const fs = require('fs');
const source = fs.readFileSync(__dirname + '/../functions/index.js', 'utf8');

function block(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start + startText.length);
  return source.slice(start, end === -1 ? source.length : end);
}

const previewHelper = block('async function _previewCanonicalRegistrationMigrationForOrganizer', '// Prévia da migração I1');
const applyHelper = block('async function _applyCanonicalRegistrationMigrationForOrganizer', 'exports.applyCanonicalRegistrationMigration = onCall');
const batchPreview = block('exports.previewCanonicalRegistrationMigrationBatch', '// Materializa exclusivamente');
const batchApply = block('exports.applyCanonicalRegistrationMigrationBatch', '// Configuração tipada');

assert.ok(previewHelper.includes('_splitParts.lerRegistrosDaParte') && previewHelper.includes('_registrationMigration.decideMaterialization'),
  'a prévia compartilhada deve reler elenco dividido e documentos canônicos');
for (const helper of [previewHelper, applyHelper]) {
  assert.ok(helper.indexOf('_isTournamentOrgCaller(rawTournament, callerUid)') < helper.indexOf('_splitParts.hidratar') &&
    helper.indexOf('_registrationMigration.migrationRoute(rawTournament') < helper.indexOf('_splitParts.hidratar') &&
    helper.indexOf('_splitParts.hidratar') < helper.indexOf('_splitParts.lerRegistrosDaParte'),
  'a autorização e a rota canônica devem anteceder qualquer leitura legada');
}
assert.ok(applyHelper.indexOf('route === "already_migrated"') < applyHelper.indexOf('tx.create(') &&
  applyHelper.indexOf('route === "already_migrated"') < applyHelper.indexOf('tx.set(ref,') &&
  applyHelper.includes('receipt.registrationCount') && applyHelper.includes('plannedCounts.registrations + plannedCounts.historicalExisting'),
  'retomada canônica preserva o recibo sem escrita e valida a contagem do manifesto');
assert.ok(batchPreview.includes('_previewCanonicalRegistrationMigrationForOrganizer') && batchPreview.includes('_registrationBatchPlan.planFromMigrationPreviews') && batchPreview.includes('_registrationBatchApply.batchRequestFromPlan'),
  'a prévia em lote deve usar a mesma leitura autorizada e montar recibo verificável');
assert.ok(batchPreview.includes('const legacyReports = reports.filter') &&
  batchPreview.includes('const unsafe = legacyReports.filter') &&
  batchPreview.includes('reports: legacyReports, ignored, ready: false, reason: "exceptions"') &&
  batchPreview.includes('planFromMigrationPreviews(legacyReports,') &&
  batchPreview.includes('batchSize: legacyReports.length'),
  'lote misto deve excluir canônicos de exceções, manifesto e recorte');
assert.ok(previewHelper.includes('orderBy(admin.firestore.FieldPath.documentId())'),
  'a prévia deve consultar toda a coleção canônica por uma Query explícita, sem teto que esconda divergências');
assert.ok(batchPreview.includes('ids.length > 10') && batchPreview.includes('new Set(ids).size'),
  'a prévia em lote deve limitar e deduplicar o escopo');
assert.ok(batchApply.includes('_registrationBatchPlan.verifyPlan') && batchApply.includes('_registrationBatchApply.batchRequestFromPlan') && batchApply.includes('_applyCanonicalRegistrationMigrationForOrganizer'),
  'a aplicação deve verificar o plano e manter a transação unitária por torneio');
assert.ok(batchApply.includes('registrations: item.registrations, historicalExisting: item.historicalExisting'),
  'retomada do lote usa as contagens já assinadas no manifesto');
assert.ok(!batchApply.includes('request.data.participants') && !batchApply.includes('tx.set(ref, { participants'),
  'o lote não pode aceitar elenco do cliente nem reescrever a projeção legada');

console.log('✅ registration-migration-batch-cf: prévia, lote e transações canônicas protegidos');
