#!/usr/bin/env node
'use strict';

// E05/E20: prova remota somente leitura. Ausência no código não implica ausência no Firebase.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { credentialPath } = require('./firebase-service-account-token.js');

const PROJECT = 'scoreplace-app';
const RETIRED_WRITERS = Object.freeze(['syncSplitMatchResult', 'backfillMatchResultDocs']);
const KNOWN_ACTIVE = 'applyMatchResult';

function classify(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || parsed.status !== 'success' || !Array.isArray(parsed.result) ||
      parsed.result.length === 0 ||
      parsed.result.some(item => !item || typeof item.id !== 'string' || !item.id)) {
    throw new Error('listagem de Functions inválida ou incompleta');
  }
  const ids = new Set(parsed.result.map(item => item.id));
  if (!ids.has(KNOWN_ACTIVE)) throw new Error('listagem de Functions sem sentinela conhecida');
  return { project: PROJECT, active: RETIRED_WRITERS.filter(id => ids.has(id)),
    retired: RETIRED_WRITERS.filter(id => !ids.has(id)), checkedCount: parsed.result.length };
}

function listPublished(env = process.env) {
  const keyFile = credentialPath(env);
  if (!fs.existsSync(keyFile)) throw new Error('conta de serviço persistente indisponível');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e05-functions-'));
  try {
    return execFileSync('firebase', ['functions:list', '--project', PROJECT, '--json'], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
      env: { ...env, GOOGLE_APPLICATION_CREDENTIALS: keyFile, XDG_CONFIG_HOME: configDir },
    });
  } finally {
    fs.rmSync(configDir, { recursive: true, force: true });
  }
}

function assertRetired(raw = listPublished()) {
  const state = classify(raw);
  if (state.active.length) throw new Error('escritores antigos ainda publicados: ' + state.active.join(', '));
  return state;
}

function main() {
  if (process.argv.length !== 2) throw new Error('uso: node scripts/check-e05-mirror-functions.js');
  const state = classify(listPublished());
  console.log(JSON.stringify({ schema: 'scoreplace/e05-writers-census/1', ...state }));
  if (state.active.length) {
    console.error('[E05] escritores antigos ainda publicados: ' + state.active.join(', '));
    process.exitCode = 2;
  }
}

module.exports = { PROJECT, RETIRED_WRITERS, classify, listPublished, assertRetired };
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('[E05] não foi possível provar ausência dos escritores:', error.message); process.exitCode = 1; }
}
