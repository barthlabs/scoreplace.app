'use strict';
const assert = require('node:assert/strict');
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });
process.env.RESULT_HISTORY_CURSOR_KEY = Buffer.alloc(32, 7).toString('base64');
const core = require('../functions/result-history-page-core');
const CF = require('../functions/index.js');
const invoke = () => CF.getTournamentResultHistoryPage.run({ data: {},
  auth: { uid: 'viewer', token: { uid: 'viewer' } },
  rawRequest: { headers: {} }, acceptsStreaming: false });
(async () => {
  const original = core.readResultHistoryPage;
  try {
    for (const [message, code] of [['dependência inválida', undefined],
      ['cursor inválido', 'invalid-argument'], ['uid inválido', 'invalid-argument']]) {
      core.readResultHistoryPage = async () => { throw new Error(message); };
      await assert.rejects(invoke(), error => {
        assert.equal(error.code, code, message);
        return true;
      });
    }
  } finally { core.readResultHistoryPage = original; }
  console.log('✓ E19 histórico: falha interna preservada; cursor e uid inválidos viram argumento inválido');
})().catch(error => { console.error(error); process.exitCode = 1; });
