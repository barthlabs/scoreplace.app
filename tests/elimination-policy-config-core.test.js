'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const { validateAndCanonicalizeExplicitPolicy } = require('../functions-autodraw/elimination-policy-config-core');

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
for (const value of ['repescagem', 'bye', 'sobra_unica']) {
  const top = { politicaDaChave: value }, nested = { fmt2: { eliminatoria: { politicaDaChave: value } } };
  validateAndCanonicalizeExplicitPolicy(top, HttpsError);
  validateAndCanonicalizeExplicitPolicy(nested, HttpsError);
  assert.equal(top.politicaDaChave, value);
  assert.equal(nested.fmt2.eliminatoria.politicaDaChave, value);
}
validateAndCanonicalizeExplicitPolicy({}, HttpsError);
validateAndCanonicalizeExplicitPolicy({ fmt2: { eliminatoria: {} } }, HttpsError);
for (const value of ['lixo', 'qualquer-coisa', '', null, 1]) {
  for (const config of [{ politicaDaChave: value }, { fmt2: { eliminatoria: { politicaDaChave: value } } }]) {
    assert.throws(() => validateAndCanonicalizeExplicitPolicy(config, HttpsError), { code: 'invalid-argument' });
  }
}
const request = { politicaDaChave: 'playin', fmt2: { eliminatoria: { politicaDaChave: 'playin' } } };
const clone = JSON.parse(JSON.stringify(request));
validateAndCanonicalizeExplicitPolicy(clone, HttpsError);
assert.equal(clone.politicaDaChave, 'repescagem');
assert.equal(clone.fmt2.eliminatoria.politicaDaChave, 'repescagem');
assert.equal(request.politicaDaChave, 'playin', 'request original fica intacto');
assert.equal(request.fmt2.eliminatoria.politicaDaChave, 'playin');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const create = source.slice(source.indexOf('exports.createTournament ='), source.indexOf('exports.cleanupTournamentCreationRequests ='));
const update = source.slice(source.indexOf('exports.updateTournamentConfiguration ='), source.indexOf('exports.', source.indexOf('exports.updateTournamentConfiguration =') + 8));
assert(create.includes("validatePolicy: require('./elimination-policy-config-core').validateAndCanonicalizeExplicitPolicy"), 'criação injeta o validador');
assert(update.indexOf("validateAndCanonicalizeExplicitPolicy(patch, HttpsError)") > update.indexOf('patch[key] = _clonaConfigDeclarativa'), 'edição valida após clonar');
assert(update.indexOf("validateAndCanonicalizeExplicitPolicy(patch, HttpsError)") < update.indexOf('return db.runTransaction'), 'edição valida antes da transação');
console.log('✓ política explícita validada nas duas portas de escrita');
