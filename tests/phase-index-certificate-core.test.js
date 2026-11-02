'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const split = require('../js/views/tournament-split-core');
const core = require('../functions/phase-index-certificate-core');
const writePlan = require('../functions-autodraw/write-plan');

const original = {
  rounds: [{ matches: [{ id: 'old', p1: 'A', p2: 'B' }] }],
  phaseRounds: { '2': { rounds: [{ matches: [{ id: 'next', phaseIndex: 2, p1: 'C', p2: 'D' }] }] } }
};
const records = split.dividir(original, ['matches']).matches;
const valid = core.build(records, split);
assert.equal(valid.version, 2);
assert.equal(valid.count, 2);
assert.match(valid.digest, /^[a-f0-9]{64}$/);
assert.equal(Object.keys(valid.phases).length, 30);
assert.match(valid.phases['0'], /^[a-f0-9]{64}$/);
assert.match(valid.phases['2'], /^[a-f0-9]{64}$/);
assert.deepEqual(core.build(records.slice().reverse(), split), valid, 'ordem de leitura não muda o recibo');
assert.deepEqual(core.build(records.slice(0, 1), split).count, 1, 'remoção muda a contagem final');
assert.notEqual(core.build(records.slice(0, 1), split).digest, valid.digest, 'remoção muda o digest final');
assert.equal(core.build([records[0], records[0]], split), null, 'chave repetida não recebe certificado');
assert.equal(core.build(records.map((r, i) => i ? { ...r, _phaseIndex: 1 } : r), split), null,
  'índice divergente da estrutura não recebe certificado');
assert.equal(core.build([{ ...records[0], _phaseIndex: 1.5 }], split), null,
  'índice fracionário não recebe certificado');
assert.equal(core.build([{ ...records[0], _phaseIndex: 30 }], split), null,
  'fase fora da consulta suportada não recebe certificado');
assert.equal(core.build([{ ...records[0], _loc: null }], split), null,
  'sem lugar estrutural não recebe certificado');
assert.equal(core.build([{ ...records[0], jogo: { ...records[0].jogo, phaseIndex: 2 } }], split), null,
  'tag de fase conflitante não recebe certificado');
const admin = require('../functions-autodraw/node_modules/firebase-admin');
assert.equal(core.build([{ ...records[0], _loc: { ...records[0]._loc,
  observedAt: admin.firestore.Timestamp.now() } }], split), null,
  'Timestamp real do Admin SDK impede atestado');
assert.equal(core.build([{ ...records[0], _loc: { ...records[0]._loc, absent: undefined } }], split), null,
  'undefined é recusado antes da canonicalização');
assert.equal(core.build([{ ...records[0], _loc: { ...records[0]._loc, optional: null } }], split)?.version, 2,
  'null explícito é JSON puro');
assert.equal(core.build([{ ...records[0], jogo: { ...records[0].jogo, phaseIndex: null } }], split), null,
  'phaseIndex nulo difere de ausente');

const planFor = (before, after, options) => writePlan.planWrites(before, after, {
  split, boundary: (t) => ({ persist: t }), agoraIso: '2026-10-31T00:00:00.000Z',
  ...options
});
const existing = { ...original, _phaseReadCertificate: { version: 1, count: 999, digest: 'stale' } };
const rootOf = (plan) => plan.ops.find((op) => op.colecao === null).doc;
const withoutProof = rootOf(planFor(existing, existing));
assert.equal(withoutProof._phaseReadCertificate, undefined,
  'set completo sem prova remove a marca herdada da fronteira');
const withProof = rootOf(planFor(existing, existing, { phaseReadProof: true }));
assert.equal(withProof._phaseReadCertificate.count, 2);
assert.notEqual(withProof._phaseReadCertificate.digest, 'stale');
assert.equal(withProof._nPartes.matches, withProof._phaseReadCertificate.count);
const historical = rootOf(planFor(existing, existing,
  { phaseReadProof: true, partesLegadasNoDocumento: { matches: true } }));
assert.equal(historical._phaseReadCertificate, undefined,
  'primeira gravação de jogos históricos ainda não certifica');
const sandboxExisting = { ...existing, isSandbox: true };
const sandbox = rootOf(planFor(sandboxExisting, sandboxExisting,
  { phaseReadProof: true }));
assert.equal(sandbox._phaseReadCertificate, undefined, 'sandbox não certifica');
const afterRemoval = { ...existing, phaseRounds: {} };
const removalPlan = planFor(existing, afterRemoval, { phaseReadProof: true });
assert.equal(rootOf(removalPlan)._phaseReadCertificate.count, 1, 'remoção usa conjunto final');
assert.equal(removalPlan.ops.filter((op) => op.colecao === 'matches' && op.tipo === 'delete').length, 1);

const extras = (count) => Array.from({ length: count }, (_, n) => ({
  colecao: 'notifications', chave: 'extra-' + n, doc: { n }
}));
const atLimit = planFor(existing, existing, { phaseReadProof: true, extras: extras(399) });
assert.equal(atLimit.ops.length, writePlan.TETO_OPERACOES);
assert.equal(writePlan.checaTeto(atLimit), null);
assert.equal(rootOf(atLimit)._phaseReadCertificate.count, 2,
  'plano exatamente no teto pode portar atestado');
const aboveLimit = planFor(existing, existing, { phaseReadProof: true, extras: extras(400) });
assert.equal(aboveLimit.ops.length, writePlan.TETO_OPERACOES + 1);
assert.match(writePlan.checaTeto(aboveLimit), /excede o teto/);
assert.equal(rootOf(aboveLimit)._phaseReadCertificate, undefined,
  'plano acima do teto não deve portar atestado');
let writes = 0;
const tx = { set: () => { writes++; }, delete: () => { writes++; } };
const ref = { collection: () => ({ doc: () => ({}) }) };
assert.throws(() => writePlan.applyPlan(tx, ref, aboveLimit, {}), /excede o teto/);
assert.equal(writes, 0, 'plano acima do teto é recusado antes da primeira escrita');

const source = path.join(__dirname, '..', 'functions', 'phase-index-certificate-core.js');
const vendor = path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'phase-index-certificate-core.js');
assert(fs.readFileSync(source).equals(fs.readFileSync(vendor)), 'vendor precisa ser idêntico à fonte');
console.log('phase-index-certificate-core: validade, ambiguidades, digest e vendor OK');
