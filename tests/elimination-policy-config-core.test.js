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
const equivalent = { politicaDaChave: 'playin', fmt2: { eliminatoria: { politicaDaChave: 'repescagem' } } };
validateAndCanonicalizeExplicitPolicy(equivalent, HttpsError);
assert.equal(equivalent.politicaDaChave, 'repescagem');
for (const [top, nested] of [['bye', 'repescagem'], ['sobra_unica', 'bye'], ['playin', 'bye']]) {
  const conflicting = { politicaDaChave: top, fmt2: { eliminatoria: { politicaDaChave: nested } } };
  assert.throws(() => validateAndCanonicalizeExplicitPolicy(conflicting, HttpsError), { code: 'invalid-argument' });
  assert.equal(conflicting.politicaDaChave, top, 'conflito não altera o objeto antes da recusa');
  assert.equal(conflicting.fmt2.eliminatoria.politicaDaChave, nested);
}

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const create = source.slice(source.indexOf('exports.createTournament ='), source.indexOf('exports.cleanupTournamentCreationRequests ='));
const update = source.slice(source.indexOf('exports.updateTournamentConfiguration ='), source.indexOf('exports.', source.indexOf('exports.updateTournamentConfiguration =') + 8));
assert(create.includes("validatePolicy: require('./elimination-policy-config-core').validateAndCanonicalizeExplicitPolicy"), 'criação injeta o validador');
assert(update.indexOf('_policyConfig.canonicalizePolicyAliases(patch, t)') > update.indexOf('const t = await _leTorneio'),
  'edição preserva aliases legados iguais ao documento fresco');
assert(update.indexOf('_policyConfig.validateAndCanonicalizeExplicitPolicy(effectivePolicy, HttpsError)') > update.indexOf('return db.runTransaction'),
  'edição valida a configuração efetiva dentro da transação fresca');
assert(update.includes('_policyBeforeShape !== _policyConfig.policyShape(t)'),
  'edição de dados não relacionados não recusa política legada intacta');
console.log('✓ política explícita validada nas duas portas de escrita');
