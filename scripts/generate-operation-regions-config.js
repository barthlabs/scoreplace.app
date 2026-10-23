'use strict';
// Gera apenas URLs públicas e hashes das revisões já verificadas pelo gate v2.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude/tmp/operation-regions-manifest-v2.json')));
const regions = ['us-east1', 'us-east4', 'us-south1'];
const names = ['sp-op-court-v2', 'sp-op-score-v2', 'sp-op-presence-v2',
  'sp-op-presence-wo-v2', 'sp-op-end-court-v2', 'sp-op-control-v2'];
const services = {};
for (const name of names) {
  const rows = regions.map(region => manifest.find(row => row.name === name && row.region === region));
  if (rows.some(row => !row || !/^https:\/\//.test(row.url) || !/^[a-f0-9]{64}$/.test(row.sourceDigest))) {
    throw new Error('Manifesto regional incompleto para ' + name);
  }
  if (new Set(rows.map(row => row.sourceDigest)).size !== 1 || new Set(rows.map(row => row.image)).size !== 1) {
    throw new Error('Imagem ou fonte divergente para ' + name);
  }
  services[name] = { digest: rows[0].sourceDigest, urls: Object.fromEntries(rows.map(row => [row.region, row.url])) };
}
const output = { schema: 2, regions, services };
const target = path.join(root, 'operation-regions.json');
const expected = JSON.stringify(output, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== expected) {
    throw new Error('operation-regions.json não corresponde às revisões verificadas.');
  }
} else {
  fs.writeFileSync(target, expected);
}
console.log('✓ operation-regions.json: seis portas em três regiões');
