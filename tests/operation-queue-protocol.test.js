'use strict';
// Executa a porta real da fila até a transação: um item legado não pode usar
// o UUID sintético do recibo para atravessar o protocolo operacional v2.
// Decisão para este corte: não existem clientes antigos em uso (instrução do
// organizador); a fila real do Neon foi lida antes da publicação e tinha zero
// itens, inclusive zero pendentes. Uma intenção inválida futura permanece no
// documento com status/reason para auditoria, sem aplicar placar silenciosamente.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, start);
  return source.slice(a, b);
};
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const receipts = require('../functions-autodraw/operation-receipt-core');
async function runQueue(operationId) {
  const marks = [], writes = [];
  const parent = {
    path: 'tournaments/tour_queue_protocol',
    get: async () => ({ exists: true, data: () => ({}) }),
    collection: () => ({ doc: () => ({}) })
  };
  const db = {
    collection: () => ({ doc: () => parent }),
    runTransaction: async callback => callback({
      get: async () => ({ exists: true, data: () => ({ protocolVersion: 2 }) }),
      set: () => writes.push('set'), update: () => writes.push('update'),
      create: () => writes.push('create'), delete: () => writes.push('delete')
    })
  };
  const context = { exports: {}, HttpsError, _operationReceipt: receipts,
    createHash: require('node:crypto').createHash, getFirestore: () => db,
    onDocumentCreated: (_options, handler) => handler,
    applyResultFn: () => ({ ok: true }), drawWindow: {},
    _outboxDocIdPart: value => value, _preloadDrawNames: async () => {},
    _leTorneio: async () => ({}),
    console: { error: (...args) => { if (process.env.SP_DEBUG_QUEUE) console.error(...args); }, log: () => {} }
  };
  vm.createContext(context);
  vm.runInContext(section('async function _operationProtocolGuard(', '// v1.7.35:'), context);
  vm.runInContext(section('async function _aplicaPlacarNaTransacao(', '// ─── Caixa de saída canônica'), context);
  vm.runInContext(section('exports.applyQueuedResult = onDocumentCreated(', 'exports.closeRound = onCall('), context);
  const item = { matchId: 'game', actorUid: 'owner', payload: { action: 'score' } };
  if (operationId !== undefined) item.operationId = operationId;
  await context.exports.applyQueuedResult({ params: { tournamentId: 'tour_queue_protocol', itemId: 'queued_1' },
    data: { exists: true, data: () => item, ref: { set: async fields => marks.push(fields) } } });
  assert.equal(marks.length, 1);
  assert.equal(marks[0].status, 'recusado');
  assert.equal(marks[0].reason, 'protocol');
  assert.deepEqual(writes, []);
}
(async () => {
  await runQueue(undefined);
  await runQueue('legacy-client-id');
  console.log('✓ fila legada sem UUID real recusada após protocolo v2, sem escrita de placar');
})().catch(error => { console.error(error); process.exitCode = 1; });
