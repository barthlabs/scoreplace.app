#!/usr/bin/env node
'use strict';
// Publica somente URLs de revisões v3 verificadas; não copia segredos do manifesto.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifestPath = process.env.SP_V3_MANIFEST || path.join(root, '.claude/tmp/operation-regions-manifest-v3.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath));
const regions = ['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1'];
const names = ['sp-op-court-v3', 'sp-op-score-v3', 'sp-op-presence-v3',
  'sp-op-presence-wo-v3', 'sp-op-end-court-v3', 'sp-op-control-v3'];
if (manifest.length !== regions.length * names.length) throw new Error('Manifesto v3 incompleto ou duplicado');
const services = {};
for (const name of names) {
  const rows = regions.map(region => manifest.filter(row => row.name === name && row.region === region));
  if (rows.some(matches => matches.length !== 1)) throw new Error('Manifesto v3 incompleto ou duplicado: ' + name);
  const list = rows.map(matches => matches[0]);
  if (list.some(row => !/^https:\/\//.test(row.url) || !/^[a-f0-9]{64}$/.test(row.sourceDigest) ||
    !row.image?.includes('@sha256:') || !row.revision ||
    row.env?.SP_SOURCE_DIGEST !== row.sourceDigest || row.env?.SP_OPERATION_REGION !== row.region)) {
    throw new Error('Revisão v3 inválida: ' + name);
  }
  if (new Set(list.map(row => row.sourceDigest)).size !== 1 || new Set(list.map(row => row.image)).size !== 1 ||
    new Set(list.map(row => row.commit)).size !== 1) throw new Error('Imagem ou fonte divergente: ' + name);
  services[name] = { digest: list[0].sourceDigest, urls: Object.fromEntries(list.map(row => [row.region, row.url])) };
}
const output = { schema: 3, regions, services };
const target = path.join(root, 'operation-regions-v3.json');
const expected = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) throw new Error('operation-regions-v3.json diverge do manifesto');
} else {
  fs.writeFileSync(target, expected);
}
console.log('✓ operation-regions-v3.json: seis portas em cinco regiões');
