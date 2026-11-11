'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const advance = require('../functions-autodraw/advance-core');

const source = fs.readFileSync(path.join(__dirname, '../functions-autodraw/index.js'), 'utf8');
const start = source.indexOf('exports.advanceTournamentPhase = onCall(');
const end = source.indexOf('async function _notifyAdvancedPhase(', start);
assert(start >= 0 && end > start);
const handler = source.slice(start, end);
assert.match(handler, /^exports\.advanceTournamentPhase = onCall\(\{ invoker: 'public' \}, async \(request\) => \{/,
  'a callable aceita o preflight CORS do navegador');
assert(handler.indexOf("if (!uid) throw new HttpsError('unauthenticated'") < handler.indexOf('db.runTransaction'),
  'a operação exige login antes de escrever');
assert(handler.indexOf('if (!_isTournamentAdmin(pre.data(), uid))') < handler.indexOf('db.runTransaction'),
  'a operação exige organizador antes de escrever');
const assignment = handler.match(/const compatOperationId = ([^;]+);/);
assert(assignment, 'fallback real do handler encontrado');
assert(handler.indexOf(assignment[0]) < handler.indexOf('db.runTransaction'),
  'UUID é fixado antes do retry transacional');
assert.match(handler, /_advanceDet\.validaOperationId\(compatOperationId\)/);
const resolve = new Function('requestedOperationId', 'randomUUID',
  assignment[0] + '\nreturn compatOperationId;');
const generated = resolve(undefined, randomUUID);
assert.equal(advance.validaOperationId(generated), generated,
  'cliente nativo sem operationId recebe UUID válido do servidor');
const supplied = randomUUID();
assert.equal(resolve(supplied, () => { throw Error('não deveria gerar'); }), supplied);
assert.throws(() => advance.validaOperationId(resolve('inválido', randomUUID)), /operationId/,
  'campo presente inválido continua recusado');
const engine = fs.readFileSync(path.join(__dirname, '../js/views/phases-engine.js'), 'utf8');
assert.match(engine, /if \(!interleavedCategory && \(t\._phaseMaterialized \|\| 0\) >= nextIdx\) return \{ ok: false, error: 'already-materialized' \}/,
  'cliente antigo continua sem materializar duas vezes a fase global');
assert.match(engine, /t\.phaseCategoryMaterialized\[interleavedCategory\]/,
  'avanço intercalado tem marcador próprio para não duplicar a categoria');
console.log('✓ app nativo sem operationId avança com UUID estável na transação');
