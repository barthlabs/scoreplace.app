#!/usr/bin/env node
'use strict';
// Verifica o corte regional por serviço sem recalcular o hash da árvore antiga.
const fs = require('node:fs');
const { execFileSync, spawnSync } = require('node:child_process');
const path = require('node:path');
const { sourceDescriptor, sourceDigest } = require('./operation-source-digest');
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
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
const isRecordedAncestor = commit => /^[a-f0-9]{40}$/.test(commit) &&
  spawnSync('git', ['merge-base', '--is-ancestor', commit, head], { cwd: root }).status === 0;
// As portas de placar e encerramento podem ser atualizadas separadamente.
// A base antiga é definida pelas outras quatro portas, que continuam imóveis.
const independentlyUpdated = new Set([`sp-op-score-${version}`, `sp-op-end-court-${version}`]);
const legacy = [...new Set(rows.filter(row => !independentlyUpdated.has(row.name)).map(row => row.commit))];
if (legacy.length !== 1 || !isRecordedAncestor(legacy[0])) throw new Error('commit legado divergente');
let mixed = false;
const oldSources = new Map();
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
  if (independentlyUpdated.has(names[i]) && commit !== legacy[0]) {
    if (!isRecordedAncestor(commit)) throw new Error('commit da porta atualizada não pertence ao histórico publicado: ' + names[i]);
    mixed = true;
  } else if (commit !== legacy[0]) throw new Error('outra porta mudou de commit: ' + names[i]);
  if (commit === legacy[0]) {
    if (!oldSources.has(codebases[i])) oldSources.set(codebases[i], sourceDescriptor(codebases[i], legacy[0], true));
    const oldDigest = sourceDigest(targets[i], legacy[0], oldSources.get(codebases[i]));
    if (service[0].sourceDigest !== oldDigest) throw new Error('digest legado divergente: ' + names[i]);
  } else {
    const digest = sourceDigest(targets[i], commit, sourceDescriptor(codebases[i], commit, true));
    if (service[0].sourceDigest !== digest) throw new Error('digest da porta atualizada divergente: ' + names[i]);
  }
}
if (!mixed && !allowLegacyCourt) throw new Error('nenhuma porta direcionada usa o commit atual');
process.stdout.write(JSON.stringify({ version, legacyCommit: legacy[0], courtCommit: rows.find(row => row.name === `sp-op-end-court-${version}`).commit,
  mixed, rows: rows.length }) + '\n');
