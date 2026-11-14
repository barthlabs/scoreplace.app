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
const requireCurrent = process.argv.includes('--require-current');
const requireScoreRefresh = process.argv.includes('--require-score-refresh');
const requireCourtControlRefresh = process.argv.includes('--require-court-control-refresh');
if ([requireScoreRefresh, requireCourtControlRefresh, requireCurrent, allowLegacyCourt].filter(Boolean).length > 1) throw new Error('modos regionais incompatíveis');
// SHA fixado para este corte; no próximo release regional, atualizar junto com
// sync-operation-regions-current.js e os manifestos, antes de abrir o Hosting.
const releaseCommit = '470c6c972130c2d4225952f214755d622595e0a6';
const scoreRefreshCommit = '7675ce5c6bcddd7fa563bc3b5c80fa6cc5fa5760';
// O manifesto registra a revisão efetivamente publicada para chamada e controle.
// Mudanças em outros arquivos de functions-autodraw (por exemplo, um vendor usado
// no sorteio) não alteram a imagem desses dois serviços na malha regional.
const courtControlRefreshCommit = '7675ce5c6bcddd7fa563bc3b5c80fa6cc5fa5760';
const endCourtRefreshCommit = '6982eca74abb7cf898fd437a3301b6180c4c8be5';
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
const expectedKeys = new Set(names.flatMap(name => regions.map(region => `${name}/${region}`)));
if (rows.some(row => !expectedKeys.has(`${row.name}/${row.region}`)) ||
    new Set(rows.map(row => `${row.name}/${row.region}`)).size !== expectedKeys.size) {
  throw new Error('porta regional inesperada ou duplicada');
}
const baseline = rows.find(row => row.name === `sp-op-court-${version}`)?.commit;
if (!isRecordedAncestor(baseline)) throw new Error('commit de origem inválido');
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
  if (!isRecordedAncestor(commit)) throw new Error('commit da porta não pertence ao histórico publicado: ' + names[i]);
  const cacheKey = `${codebases[i]}:${commit}`;
  if (!oldSources.has(cacheKey)) oldSources.set(cacheKey, sourceDescriptor(codebases[i], commit, true));
  const expectedDigest = sourceDigest(targets[i], commit, oldSources.get(cacheKey));
  if (service[0].sourceDigest !== expectedDigest) throw new Error('digest da porta divergente: ' + names[i]);
}
const mixed = new Set(rows.map(row => row.commit)).size > 1;
const uniformCurrent = rows.every(row => row.commit === releaseCommit);
const directed = ['court', 'score', 'end-court', 'control'].map(target => `sp-op-${target}-${version}`).some(name =>
  rows.find(row => row.name === name)?.commit !== releaseCommit);
if (requireCurrent && !uniformCurrent) throw new Error('malha regional não usa o commit integral do corte');
if (requireScoreRefresh && rows.some(row => row.commit !==
    (row.name === `sp-op-score-${version}` ? scoreRefreshCommit : releaseCommit))) {
  throw new Error('malha regional diverge do corte dirigido de placar');
}
if (requireCourtControlRefresh && rows.some(row => row.commit !==
    (row.name === `sp-op-score-${version}` ? scoreRefreshCommit :
      row.name === `sp-op-end-court-${version}` ? endCourtRefreshCommit :
        [ `sp-op-court-${version}`, `sp-op-control-${version}` ].includes(row.name) ? courtControlRefreshCommit : releaseCommit))) {
  throw new Error('malha regional diverge do corte dirigido de chamada e controle');
}
if (!allowLegacyCourt && !requireCurrent && !uniformCurrent && !directed) {
  throw new Error('nenhuma porta direcionada usa o código atual');
}
process.stdout.write(JSON.stringify({ version, mode: requireCourtControlRefresh ? 'court-control-refresh' : requireScoreRefresh ? 'score-refresh' : requireCurrent ? 'current' : 'mixed', legacyCommit: baseline, courtCommit: rows.find(row => row.name === `sp-op-court-${version}`).commit,
  mixed, rows: rows.length }) + '\n');
