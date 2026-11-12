#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const gatePath = path.join(root, '.claude/tmp/operation-legacy-gate-manifest-v2.json');

function validateCallables(saved, live) {
  if (!Array.isArray(saved) || saved.length === 0 || !Array.isArray(live)) {
    return ['manifesto ou lista de Functions inválida'];
  }
  const byName = new Map(live.map((row) => [String(row.name || '').split('/').pop(), row]));
  return saved.flatMap((row) => {
    const current = byName.get(row.name);
    if (current?.state === 'ACTIVE' && current.buildConfig?.entryPoint === row.name &&
        current.updateTime === row.updateTime) return [];
    return [row.name + ': recibo da trava regional diverge da Function publicada'];
  });
}

function main() {
  console.log('▸ pré-checagem rápida: convite e trava regional antes da suíte');
  execFileSync(process.execPath, [path.join(__dirname, 'check-invite-functions-published.js')],
    { cwd: root, stdio: 'inherit' });
  if (!fs.existsSync(gatePath)) {
    throw new Error('manifesto da trava regional ausente: ' + gatePath);
  }
  const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const live = JSON.parse(execFileSync('gcloud', [
    'functions', 'list', '--project', 'scoreplace-app', '--regions', 'us-central1',
    '--v2', '--format=json',
  ], { cwd: root, encoding: 'utf8', timeout: 180000 }));
  const errors = validateCallables(gate.normal, live);
  if (errors.length) {
    for (const error of errors) console.error('✗ ' + error);
    console.error('  Confira o deploy direcionado e sincronize o recibo regional antes do preflight.');
    process.exitCode = 1;
    return;
  }
  console.log('✓ recibo dos convites e seis Functions da trava regional em dia');
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error('✗ pré-checagem do backend: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { validateCallables };
