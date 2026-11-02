#!/usr/bin/env node
'use strict';

// E20: aposentadoria explícita dos dois escritores publicados de `results`.
// Rodar só depois de Hosting novo verificado e autorização do lote exato.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { credentialPath } = require('./firebase-service-account-token.js');
const { PROJECT, RETIRED_WRITERS } = require('./check-e05-mirror-functions.js');

const SENTINEL = 'applyMatchResult';
const REGION = 'us-central1';
const SCHEMA = 'scoreplace/e20-writer-retirement-preview/2';

function descriptor(item) {
  if (!item || ![SENTINEL, ...RETIRED_WRITERS].includes(item.id)) return null;
  for (const key of ['id', 'region', 'platform', 'codebase', 'state', 'hash', 'project', 'entryPoint']) {
    if (typeof item[key] !== 'string' || !item[key]) throw new Error('metadado incompleto: ' + key);
  }
  if (item.region !== REGION || item.project !== PROJECT || item.platform !== 'gcfv2' ||
      item.codebase !== 'default' || item.state !== 'ACTIVE' || item.entryPoint !== item.id) {
    throw new Error('Function fora do escopo exato: ' + item.id);
  }
  return Object.fromEntries(['id', 'region', 'platform', 'codebase', 'state', 'hash', 'project', 'entryPoint']
    .map((key) => [key, item[key]]));
}

function observe(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || parsed.status !== 'success' || !Array.isArray(parsed.result) || !parsed.result.length ||
      parsed.result.some((item) => !item || typeof item.id !== 'string' || !item.id)) {
    throw new Error('listagem remota inválida ou incompleta');
  }
  const selected = parsed.result.map(descriptor).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(selected.map((item) => item.id)).size !== selected.length) throw new Error('Function duplicada na listagem');
  if (!selected.some((item) => item.id === SENTINEL)) throw new Error('sentinela applyMatchResult ausente');
  return selected;
}

function digest(functions) {
  return crypto.createHash('sha256').update(JSON.stringify({ schema: SCHEMA, project: PROJECT, functions })).digest('hex');
}

function preview(raw) {
  const functions = observe(raw);
  if (RETIRED_WRITERS.some((id) => !functions.some((item) => item.id === id))) {
    throw new Error('lote incompleto: um escritor já está ausente');
  }
  return { schema: SCHEMA, project: PROJECT, observedAt: new Date().toISOString(), functions,
    digest: digest(functions) };
}

function privateWrite(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
}

function firebase(args, env = process.env) {
  const keyFile = credentialPath(env);
  if (!fs.existsSync(keyFile)) throw new Error('conta de serviço persistente indisponível');
  const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-e20-firebase-'));
  try {
    return execFileSync('firebase', args, { encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
      env: { ...env, GOOGLE_APPLICATION_CREDENTIALS: keyFile, XDG_CONFIG_HOME: configDir } });
  } finally { fs.rmSync(configDir, { recursive: true, force: true }); }
}

function live(env) { return observe(firebase(['functions:list', '--project', PROJECT, '--json'], env)); }

function assertSame(expected, actual) {
  if (digest(actual) !== digest(expected)) throw new Error('prévia envelheceu: metadados de Functions mudaram');
}

function apply(file, expectedDigest, receiptFile, env = process.env) {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest || '')) throw new Error('digest SHA-256 obrigatório');
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0) throw new Error('prévia precisa ser privada (0600)');
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (saved.schema !== SCHEMA || saved.project !== PROJECT || saved.digest !== expectedDigest ||
      !Array.isArray(saved.functions) || digest(saved.functions) !== expectedDigest) {
    throw new Error('prévia ou digest incompatível');
  }
  const initial = live(env);
  assertSame(saved.functions, initial);
  // O recibo PREPARED existe antes da primeira mutação; falha de rede depois
  // dela nunca pode parecer uma execução que nem começou.
  const receipt = { schema: 'scoreplace/e20-writer-retirement-receipt/1', project: PROJECT,
    previewDigest: expectedDigest, status: 'PREPARED', deleted: [], startedAt: new Date().toISOString() };
  privateWrite(receiptFile, receipt);
  try {
    for (const id of RETIRED_WRITERS) {
      const before = live(env);
      const expectedBefore = initial.filter((item) => !receipt.deleted.includes(item.id));
      assertSame(expectedBefore, before);
      firebase(['functions:delete', id, '--region', REGION, '--project', PROJECT, '--force'], env);
      const after = live(env);
      if (after.some((item) => item.id === id)) throw new Error('Function ainda publicada: ' + id);
      const expectedAfter = expectedBefore.filter((item) => item.id !== id);
      assertSame(expectedAfter, after);
      receipt.deleted.push(id);
      fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    }
    receipt.status = 'VERIFIED';
    receipt.finishedAt = new Date().toISOString();
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    return receipt;
  } catch (error) {
    receipt.status = 'UNCERTAIN';
    receipt.error = String(error && error.message || error);
    fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    throw error;
  }
}

function main(argv = process.argv.slice(2)) {
  if (argv.length === 2 && argv[0] === '--preview') {
    const result = preview(firebase(['functions:list', '--project', PROJECT, '--json']));
    privateWrite(argv[1], result);
    console.log(JSON.stringify({ project: PROJECT, writers: RETIRED_WRITERS,
      region: REGION, digest: result.digest, preview: argv[1] }));
    return;
  }
  if (argv.length === 4 && argv[0] === '--apply') {
    const result = apply(argv[1], argv[2], argv[3]);
    console.log(JSON.stringify({ project: PROJECT, status: result.status, deleted: result.deleted }));
    return;
  }
  throw new Error('uso: retirar-writers-e20.js --preview <arquivo> | --apply <prévia> <digest> <recibo>');
}

module.exports = { SCHEMA, REGION, SENTINEL, descriptor, observe, digest, preview, apply, main };
if (require.main === module) {
  try { main(); }
  catch (error) { console.error('[E20] aposentadoria abortada:', error.message); process.exitCode = 1; }
}
