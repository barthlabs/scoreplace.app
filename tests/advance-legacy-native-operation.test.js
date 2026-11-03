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
assert.match(engine, /if \(\(t\._phaseMaterialized \|\| 0\) >= nextIdx\) return \{ ok: false, error: 'already-materialized' \}/,
  'mesma fase não materializa duas vezes quando o cliente antigo repete a chamada');
console.log('✓ app nativo sem operationId avança com UUID estável na transação');
