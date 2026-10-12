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
const batchPreview = block('exports.previewCanonicalRegistrationMigrationBatch', '// Materializa exclusivamente');
const batchApply = block('exports.applyCanonicalRegistrationMigrationBatch', '// Configuração tipada');

assert.ok(previewHelper.includes('_splitParts.lerRegistrosDaParte') && previewHelper.includes('_registrationMigration.decideMaterialization'),
  'a prévia compartilhada deve reler elenco dividido e documentos canônicos');
assert.ok(batchPreview.includes('_previewCanonicalRegistrationMigrationForOrganizer') && batchPreview.includes('_registrationBatchPlan.planFromMigrationPreviews') && batchPreview.includes('_registrationBatchApply.batchRequestFromPlan'),
  'a prévia em lote deve usar a mesma leitura autorizada e montar recibo verificável');
assert.ok(previewHelper.includes('orderBy(admin.firestore.FieldPath.documentId())'),
  'a prévia deve consultar toda a coleção canônica por uma Query explícita, sem teto que esconda divergências');
assert.ok(batchPreview.includes('ids.length > 10') && batchPreview.includes('new Set(ids).size'),
  'a prévia em lote deve limitar e deduplicar o escopo');
assert.ok(batchApply.includes('_registrationBatchPlan.verifyPlan') && batchApply.includes('_registrationBatchApply.batchRequestFromPlan') && batchApply.includes('_applyCanonicalRegistrationMigrationForOrganizer'),
  'a aplicação deve verificar o plano e manter a transação unitária por torneio');
assert.ok(!batchApply.includes('request.data.participants') && !batchApply.includes('tx.set(ref, { participants'),
  'o lote não pode aceitar elenco do cliente nem reescrever a projeção legada');

console.log('✅ registration-migration-batch-cf: prévia, lote e transações canônicas protegidos');
