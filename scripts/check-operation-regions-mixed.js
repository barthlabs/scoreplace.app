#!/usr/bin/env node
'use strict';
// Verifica o corte regional por serviço sem recalcular o hash da árvore antiga.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
const version = process.argv[2];
if (!['v2', 'v3'].includes(version)) throw new Error('uso: check-operation-regions-mixed.js v2|v3');
const allowLegacyCourt = process.argv.includes('--allow-legacy-court');
const regions = version === 'v2'
  ? ['us-east1', 'us-east4', 'us-south1']
  : ['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1'];
const names = ['court', 'score', 'presence', 'presence-wo', 'end-court', 'control'].map(x => `sp-op-${x}-${version}`);
const targets = ['assignMatchCourt', 'applyMatchResult', 'setTournamentPresence',
  'setTournamentPresenceWithWOSubstitution', 'endMatchOnCourt', 'tournamentOperationControl'];
const codebases = ['functions-autodraw', 'functions-autodraw', 'functions',
  'functions-autodraw', 'functions-autodraw', 'functions-autodraw'];
const file = process.env.SP_REGION_MANIFEST || path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`);
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
if (rows.length !== regions.length * names.length) throw new Error('manifesto regional incompleto');
const current = execFileSync('git', ['log', '-1', '--format=%H', '--', 'functions-autodraw'], { cwd: root }).toString().trim();
const legacy = [...new Set(rows.filter(row => row.name !== `sp-op-end-court-${version}`).map(row => row.commit))];
if (legacy.length !== 1 || !/^[a-f0-9]{40}$/.test(legacy[0])) throw new Error('commit legado divergente');
let mixed = false;
for (let i = 0; i < names.length; i++) {
  const selected = regions.map(region => rows.filter(row => row.name === names[i] && row.region === region));
  if (selected.some(matches => matches.length !== 1)) throw new Error('porta ausente ou duplicada: ' + names[i]);
  const service = selected.map(matches => matches[0]);
  if (service.some(row => row.target !== targets[i] || row.codebase !== codebases[i] ||
      !/^[a-f0-9]{64}$/.test(row.sourceDigest) || !row.image?.includes('@sha256:') ||
      !/^https:\/\//.test(row.url) || !row.revision)) throw new Error('linha inválida: ' + names[i]);
  for (const field of ['commit', 'sourceDigest', 'image']) {
    if (new Set(service.map(row => row[field])).size !== 1) throw new Error(field + ' divergente: ' + names[i]);
  }
  const commit = service[0].commit;
  if (i === 4 && commit !== legacy[0]) {
    if (commit !== current) throw new Error('commit da quadra não é a fonte atual');
    mixed = true;
  } else if (commit !== legacy[0]) throw new Error('outra porta mudou de commit: ' + names[i]);
}
if (mixed) {
  const digest = execFileSync('node', [path.join(root, 'scripts/operation-source-digest.js'),
    'functions-autodraw', 'endMatchOnCourt', current], { cwd: root }).toString().trim();
  if (rows.find(row => row.name === `sp-op-end-court-${version}`).sourceDigest !== digest) {
    throw new Error('digest da quadra divergente da fonte atual');
  }
}
if (!mixed && !allowLegacyCourt) throw new Error('porta end-court ainda usa o commit antigo');
process.stdout.write(JSON.stringify({ version, legacyCommit: legacy[0], courtCommit: rows.find(row => row.name === `sp-op-end-court-${version}`).commit,
  mixed, rows: rows.length }) + '\n');
