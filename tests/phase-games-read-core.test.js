'use strict';
const assert = require('node:assert/strict');
const core = require('../js/views/phase-games-read-core');
const split = require('../js/views/tournament-split-core');
const certificate = require('../functions/phase-index-certificate-core');
const item = split.dividir({ matches: [{ id: 'j1', phaseIndex: 1 }] }, ['matches']).matches[0];
const proof = certificate.build([item], split);
const root = { _nPartes: { matches: 1 }, _phaseReadCertificate: proof };
const input = { root, phaseIndex: 1, total: 1, indexed: 1, phaseCount: 1, envelopes: [item] };
(async () => {
  assert.equal(proof.version, 2);
  assert.equal(await core.valid(input, split), true, 'digest do escritor precisa bater no leitor');
  for (const change of [
    { total: 2 }, { indexed: 0 }, { phaseCount: 2 }, { envelopes: [] },
    { total: null }, { total: undefined }, { indexed: 'x' }, { phaseIndex: 1.5 },
    { envelopes: [{ ...item, _phaseIndex: 2 }] },
    { envelopes: [{ ...item, jogo: { id: 'j1', phaseIndex: 2 } }] },
    { envelopes: [{ ...item, _loc: { tipo: 'rounds', ri: 0, mi: 0 } }] },
    { root: null }, { root: { ...root, matches: [{ id: 'inline' }] } },
    { root: { ...root, _nPartes: { matches: 2 } } },
    { root: { ...root, _phaseReadCertificate: { ...proof, version: 1 } } },
    { root: { ...root, _phaseReadCertificate: { ...proof, count: 2 } } },
    { root: { ...root, _phaseReadCertificate: { ...proof, digest: 'invalid' } } },
    { root: { ...root, _phaseReadCertificate: { ...proof, phases: { ...proof.phases, '1': 'a'.repeat(64) } } } },
    { envelopes: [{ ...item, _loc: { ...item._loc, date: new Date() } }] }
  ]) assert.equal(await core.valid({ ...input, ...change }, split), false, JSON.stringify(change));
  const emptyProof = certificate.build([], split);
  const withoutTag = split.dividir({ rounds: [{ matches: [{ id: 'r' }] }] }, ['matches']).matches[0];
  const withoutTagProof = certificate.build([withoutTag], split);
  assert.equal(await core.valid({ root: { _nPartes: { matches: 1 },
    _phaseReadCertificate: withoutTagProof }, phaseIndex: 0, total: 1, indexed: 1,
  phaseCount: 1, envelopes: [withoutTag] }, split), true,
  'tag ausente em rodada estrutural mantém paridade');
  assert.equal(await core.valid({ root: { _nPartes: { matches: 1 },
    _phaseReadCertificate: withoutTagProof }, phaseIndex: 0, total: 1, indexed: 1,
  phaseCount: 1, envelopes: [{ ...withoutTag, jogo: { ...withoutTag.jogo, phaseIndex: null } }] }, split), false,
  'tag null não equivale a tag ausente');
  assert.equal(await core.valid({ ...input, root: { ...root, matches: [] } }, split), true,
    'placeholder vazio da raiz canônica não é jogo inline');
  assert.equal(await core.valid({ root: { _nPartes: { matches: 0 }, _phaseReadCertificate: emptyProof },
    phaseIndex: 1, total: 0, indexed: 0, phaseCount: 0, envelopes: [] }, split), true);
  assert.equal(core.count('01'), null);
  assert.equal(core.count(-1), null);
  assert.equal(core.count(Number.MAX_SAFE_INTEGER + 1), null);
  console.log('phase-games-read-core: atestado v2, digest e fallback OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
