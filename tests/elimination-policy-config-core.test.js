'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const { validateExplicitPolicy } = require('../functions-autodraw/elimination-policy-config-core');

class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
for (const value of ['repescagem', 'bye', 'sobra_unica', 'playin']) {
  validateExplicitPolicy({ politicaDaChave: value }, HttpsError);
  validateExplicitPolicy({ fmt2: { eliminatoria: { politicaDaChave: value } } }, HttpsError);
}
validateExplicitPolicy({}, HttpsError);
validateExplicitPolicy({ fmt2: { eliminatoria: {} } }, HttpsError);
for (const value of ['lixo', 'qualquer-coisa', '', null, 1]) {
  for (const config of [{ politicaDaChave: value }, { fmt2: { eliminatoria: { politicaDaChave: value } } }]) {
    assert.throws(() => validateExplicitPolicy(config, HttpsError), { code: 'invalid-argument' });
  }
}
const valid = { fmt2: { eliminatoria: { politicaDaChave: 'playin' } } };
validateExplicitPolicy(valid, HttpsError);
assert.equal(valid.fmt2.eliminatoria.politicaDaChave, 'playin', 'validação não reescreve entrada');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const create = source.slice(source.indexOf('exports.createTournament ='), source.indexOf('exports.cleanupTournamentCreationRequests ='));
const update = source.slice(source.indexOf('exports.updateTournamentConfiguration ='), source.indexOf('exports.', source.indexOf('exports.updateTournamentConfiguration =') + 8));
assert(create.includes("validatePolicy: require('./elimination-policy-config-core').validateExplicitPolicy"), 'criação injeta o validador');
assert(update.indexOf("validateExplicitPolicy(patch, HttpsError)") > update.indexOf('patch[key] = _clonaConfigDeclarativa'), 'edição valida após clonar');
assert(update.indexOf("validateExplicitPolicy(patch, HttpsError)") < update.indexOf('return db.runTransaction'), 'edição valida antes da transação');
console.log('✓ política explícita validada nas duas portas de escrita');
