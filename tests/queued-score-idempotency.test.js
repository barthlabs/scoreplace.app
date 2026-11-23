'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const receipts = require('../functions-autodraw/operation-receipt-core');

const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const queueStart = source.indexOf('exports.applyQueuedResult = onDocumentCreated(');
const queueEnd = source.indexOf('exports.closeRound = onCall(', queueStart);
const queue = source.slice(queueStart, queueEnd);
const scoreStart = source.indexOf('async function _aplicaPlacarNaTransacao(');
const scoreEnd = source.indexOf('// ─── Caixa de saída canônica de placar', scoreStart);
const score = source.slice(scoreStart, scoreEnd);

assert(queueStart >= 0 && queueEnd > queueStart, 'gatilho da fila existe');
assert(scoreStart >= 0 && scoreEnd > scoreStart, 'transação canônica de placar existe');
assert.match(queue, /timeoutSeconds:\s*120,\s*retry:\s*true/, 'falhas transitórias podem ser reentregues');
assert.match(queue, /createHash\('sha256'\)\.update\(`\$\{tId\}\/\$\{itemId\}`\)/,
  'toda reentrega da mesma intenção deriva do caminho estável da fila');
assert.match(queue, /queueOperationId,\s*true,\s*item\.operationId\s*\|\|\s*null/,
  'o ID estável da fila é passado à transação de placar');
assert.match(score, /operationReceipts'\)\.doc\(receipt\.id\)/,
  'a transação mantém recibo por operationId');
assert.match(score, /if \(existing\.exists\)[\s\S]*?_operationReceipt\.replay\(existing\.data\(\)\)/,
  'reentrega consulta o recibo antes de reaplicar o resultado');
assert.match(score, /tx\.create\(receiptRef,\s*_operationReceipt\.document\(receipt,/,
  'recibo e efeitos do placar são gravados na mesma transação');

const operationId = 'c07d44a5-34f0-4f0d-889e-f1a84770c5f1';
const prepared = receipts.prepare({ operationId, actorUid: 'organizer',
  parentPath: 'tournaments/tour_retry', kind: 'score', target: 'match_1',
  action: 'submit-score', payload: { payload: { s1: 6, s2: 4 }, logMessage: '' } });
let effectCount = 0;
let storedReceipt;
async function applyOnce() {
  if (storedReceipt) {
    assert(receipts.matches(storedReceipt, prepared));
    return receipts.replay(storedReceipt);
  }
  // Representa o placar, auditoria e outbox dentro de um commit atômico.
  effectCount++;
  storedReceipt = receipts.document(prepared, { ok: true, outcome: 'applied' }, 1);
  return { ok: true, outcome: 'applied' };
}

(async () => {
  const first = await applyOnce();
  const retry = await applyOnce();
  assert.equal(first.outcome, 'applied');
  assert.equal(retry.replayed, true);
  assert.equal(effectCount, 1, 'a reentrega após commit não duplica placar, auditoria ou outbox');
  console.log('✓ queued-score-idempotency: reentrega usa recibo transacional e não repete efeitos');
})().catch(error => { console.error(error); process.exitCode = 1; });
