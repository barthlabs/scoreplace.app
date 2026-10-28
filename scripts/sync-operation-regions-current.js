#!/usr/bin/env node
'use strict';
// Sincroniza as portas operacionais existentes sem recriar nomes nem tocar dados.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const { servedRevisionName, checkServed } = require('./check-served-operation-revision');

const root = path.join(__dirname, '..');
const project = 'scoreplace-app';
const sourceCommit = '40be907df';
const policy = [
  { short: 'court', target: 'assignMatchCourt', codebase: 'functions-autodraw' },
  { short: 'score', target: 'applyMatchResult', codebase: 'functions-autodraw' },
  { short: 'presence', target: 'setTournamentPresence', codebase: 'functions' },
  { short: 'presence-wo', target: 'setTournamentPresenceWithWOSubstitution', codebase: 'functions-autodraw' },
  { short: 'end-court', target: 'endMatchOnCourt', codebase: 'functions-autodraw' },
  { short: 'control', target: 'tournamentOperationControl', codebase: 'functions-autodraw' },
];
const regions = {
  v2: ['us-east1', 'us-east4', 'us-south1'],
  v3: ['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1'],
};
const stateFile = process.env.SP_REGIONAL_SYNC_STATE || path.join(root, '.claude/tmp/operation-regions-current-sync.json');
const mode = process.argv[2] || '--check';

function run(file, args, options = {}) {
  const output = cp.execFileSync(file, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 32 * 1024 * 1024, ...options });
  return typeof output === 'string' ? output.trim() : '';
}
function gcloud(args) { return JSON.parse(run('gcloud', [...args, '--project', project, '--format=json'])); }
function manifestPath(version) { return path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`); }
function key(row) { return `${row.name}/${row.region}`; }
function service(name, region) { return gcloud(['run', 'services', 'describe', name, '--region', region]); }
function revision(name, region) { return gcloud(['run', 'revisions', 'describe', name, '--region', region]); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function updatedConfig(version, rows) {
  const config = readJson(path.join(root, version === 'v2' ? 'operation-regions.json' : 'operation-regions-v3.json'));
  if (config.schema !== Number(version.slice(1)) || JSON.stringify(config.regions) !== JSON.stringify(regions[version])) throw new Error(`configuração ${version} divergente`);
  const expectedNames = policy.map(p => `sp-op-${p.short}-${version}`);
  if (JSON.stringify(Object.keys(config.services).sort()) !== JSON.stringify(expectedNames.sort())) throw new Error(`serviços da configuração ${version} divergentes`);
  for (const name of expectedNames) {
    const selected = regions[version].map(region => lookup(rows, name, region));
    if (new Set(selected.map(row => row.sourceDigest)).size !== 1) throw new Error(`digest não uniforme: ${name}`);
    config.services[name].digest = selected[0].sourceDigest;
    for (const row of selected) {
      if (config.services[name].urls[row.region] !== row.url) throw new Error(`URL da configuração divergente: ${name}/${row.region}`);
    }
  }
  return config;
}
function lookup(rows, name, region) { const found = rows.filter(x => x.name === name && x.region === region); if (found.length !== 1) throw new Error(`linha ausente/duplicada: ${name}/${region}`); return found[0]; }
function activeRow(name, region, rows) {
  const row = lookup(rows, name, region);
  const s = service(name, region);
  const r = revision(servedRevisionName(s), region);
  checkServed(s, r, row);
  return { row, service: s, revision: r };
}
function probe(url) {
  const result = cp.spawnSync('curl', ['-sS', '--max-time', '20', '-H', 'content-type: application/json', '-d', '{"data":{"probe":true}}', '-o', '/dev/null', '-w', '%{http_code}', url], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 || !['401', '403'].includes(result.stdout.trim())) throw new Error(`sonda sem Auth divergente: ${url} ${result.stdout.trim()}`);
}
function validateManifest(version, rows) {
  const expected = policy.flatMap(p => regions[version].map(region => `sp-op-${p.short}-${version}/${region}`));
  if (rows.length !== expected.length || new Set(rows.map(key)).size !== expected.length || rows.some(r => !expected.includes(key(r)))) throw new Error(`manifesto ${version} incompleto ou inesperado`);
  for (const p of policy) for (const region of regions[version]) {
    const row = lookup(rows, `sp-op-${p.short}-${version}`, region);
    if (row.target !== p.target || row.codebase !== p.codebase || !row.image?.includes('@sha256:') || !row.sourceDigest || !row.revision || !/^https:\/\//.test(row.url)) throw new Error(`linha inválida: ${key(row)}`);
  }
}
function loadState() {
  if (fs.existsSync(stateFile)) return readJson(stateFile);
  const originals = Object.fromEntries(['v2', 'v3'].map(v => [v, readJson(manifestPath(v))]));
  for (const v of ['v2', 'v3']) validateManifest(v, originals[v]);
  const state = { schema: 1, sourceCommit: run('git', ['rev-parse', sourceCommit]), originals, candidates: structuredClone(originals), previous: {}, updated: [], inFlight: [] };
  writeJson(stateFile, state);
  return state;
}
function verifySource() {
  const sourceSha = run('git', ['rev-parse', sourceCommit]);
  if (run('git', ['status', '--porcelain'])) throw new Error('árvore suja: commit antes do deploy');
  if (cp.spawnSync('git', ['diff', '--quiet', sourceSha, 'HEAD', '--', 'functions', 'functions-autodraw'], { cwd: root }).status !== 0) throw new Error('backend mudou desde o commit de fonte aprovado');
  run('node', ['scripts/check-vendor-fresh.js']);
  return sourceSha;
}
function expectedDigest(p, sha) { return run('node', ['scripts/operation-source-digest.js', p.codebase, p.target, sha, '--from-git']); }
function ensurePrevious(state, name, region, s) {
  const id = `${name}/${region}`;
  if (!state.previous[id]) {
    const served = servedRevisionName(s);
    const r = revision(served, region);
    const env = Object.fromEntries((r.spec?.containers?.[0]?.env || []).map(item => [item.name, item.value]));
    state.previous[id] = { revision: served, image: r.spec?.containers?.[0]?.image, url: s.status?.url, env };
    writeJson(stateFile, state);
  }
}
function recordCurrent(state, version, name, region, p, sha, digest, oldUrl, expectedImage) {
  const s = service(name, region);
  const served = servedRevisionName(s);
  const r = revision(served, region);
  const image = r.spec?.containers?.[0]?.image;
  const env = Object.fromEntries((r.spec?.containers?.[0]?.env || []).map(item => [item.name, item.value]));
  const before = state.previous[`${name}/${region}`];
  if (!before?.env) throw new Error(`ambiente anterior não registrado: ${name}/${region}`);
  const expectedEnv = { ...before.env, SP_SOURCE_DIGEST: digest, SP_OPERATION_REGION: region };
  if (!image?.includes('@sha256:') || (expectedImage && image !== expectedImage) || s.status?.url !== oldUrl ||
      JSON.stringify(Object.entries(env).sort()) !== JSON.stringify(Object.entries(expectedEnv).sort()) ||
      r.metadata?.annotations?.['run.googleapis.com/base-images']) throw new Error(`revisão nova divergente: ${name}/${region}`);
  const row = { name, region, target: p.target, codebase: p.codebase, commit: sha, sourceDigest: digest, image, url: oldUrl, revision: served, env };
  checkServed(s, r, row);
  probe(oldUrl);
  const list = state.candidates[version];
  const i = list.findIndex(x => x.name === name && x.region === region);
  if (i < 0) throw new Error(`candidato sem linha: ${name}/${region}`);
  list[i] = row;
  if (!state.updated.includes(key(row))) state.updated.push(key(row));
  writeJson(stateFile, state);
  return row;
}
function rollback(state) {
  const errors = [];
  for (const id of [...new Set([...state.updated, ...(state.inFlight || [])])].reverse()) {
    const slash = id.lastIndexOf('/');
    const name = id.slice(0, slash), region = id.slice(slash + 1);
    const prev = state.previous[id];
    if (!prev?.revision) { errors.push(`${id}: revisão antiga ausente`); continue; }
    try {
      run('gcloud', ['run', 'services', 'update-traffic', name, '--project', project, '--region', region, '--to-revisions', `${prev.revision}=100`, '--quiet']);
      const s = service(name, region);
      if (servedRevisionName(s) !== prev.revision) throw new Error('tráfego não voltou à revisão anterior');
      // latestReady pode continuar apontando para a revisão nova; a prova é o tráfego servido.
      process.stdout.write(`rollback ${id}: latestReady=${s.status?.latestReadyRevisionName || 'ausente'}, served=${servedRevisionName(s)}\n`);
      const old = lookup(state.originals[name.endsWith('-v2') ? 'v2' : 'v3'], name, region);
      checkServed(s, revision(prev.revision, region), old);
      probe(old.url);
      const v = name.endsWith('-v2') ? 'v2' : 'v3';
      const i = state.candidates[v].findIndex(x => key(x) === id);
      if (i < 0) throw new Error('candidato sem linha no rollback');
      state.candidates[v][i] = old;
      state.updated = state.updated.filter(x => x !== id);
      state.inFlight = (state.inFlight || []).filter(x => x !== id);
      writeJson(stateFile, state);
      process.stdout.write(`✓ rollback ${id}\n`);
    } catch (error) { errors.push(`${id}: ${error.message}`); }
  }
  // Releitura final: outro deploy gen2 na janela não pode desfazer o tráfego restaurado.
  for (const [id, prev] of Object.entries(state.previous)) {
    const slash = id.lastIndexOf('/');
    const name = id.slice(0, slash), region = id.slice(slash + 1);
    try {
      const s = service(name, region);
      if (servedRevisionName(s) !== prev.revision) throw new Error('tráfego mudou após rollback');
      const v = name.endsWith('-v2') ? 'v2' : 'v3';
      checkServed(s, revision(prev.revision, region), lookup(state.originals[v], name, region));
    } catch (error) { errors.push(`${id}: rechecagem final: ${error.message}`); }
  }
  if (errors.length) throw new Error(`rollback incompleto:\n${errors.join('\n')}`);
}

function main() {
if (!['--check', '--deploy', '--rollback'].includes(mode)) throw new Error('uso: sync-operation-regions-current.js --check|--deploy|--rollback');
if (mode === '--rollback') { rollback(loadState()); return; }
const sha = verifySource();
const state = loadState();
if (state.sourceCommit !== sha) throw new Error('commit de fonte do candidato divergente');
for (const v of ['v2', 'v3']) {
  validateManifest(v, state.originals[v]);
  validateManifest(v, state.candidates[v]);
  if (JSON.stringify(readJson(manifestPath(v))) !== JSON.stringify(state.originals[v])) throw new Error(`manifesto ${v} mudou durante a sincronização`);
}
// O check é somente leitura; revela revisões parcialmente publicadas sem recibo.
if (mode === '--check') {
  for (const v of ['v3', 'v2']) for (const p of policy) for (const region of regions[v]) {
    const name = `sp-op-${p.short}-${v}`;
    const current = lookup(state.candidates[v], name, region);
    const old = lookup(state.originals[v], name, region);
    try { activeRow(name, region, state.candidates[v]); }
    catch (error) { if (key(current) !== key(old) && current.revision !== old.revision) throw error; activeRow(name, region, state.originals[v]); }
    probe(old.url);
    process.stdout.write(`✓ ${name}/${region}\n`);
  }
  return;
}
const archives = new Map();
try {
  for (const p of policy) {
    const digest = expectedDigest(p, sha);
    if (!archives.has(p.codebase)) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `sp-region-${p.codebase}-`));
      const tarFile = path.join(dir, 'source.tar');
      fs.writeFileSync(tarFile, cp.execFileSync('git', ['archive', sha, p.codebase], { cwd: root, maxBuffer: 32 * 1024 * 1024 }));
      run('tar', ['-xf', tarFile, '-C', dir]);
      archives.set(p.codebase, dir);
    }
    let image = '';
    for (const v of ['v3', 'v2']) for (const region of regions[v]) {
      const name = `sp-op-${p.short}-${v}`;
      const old = lookup(state.originals[v], name, region);
      const candidate = lookup(state.candidates[v], name, region);
      let current;
      try { current = activeRow(name, region, state.candidates[v]); }
      catch (error) {
        if (candidate.revision !== old.revision) throw error;
        current = activeRow(name, region, state.originals[v]);
      }
      if (candidate.commit === sha && candidate.sourceDigest === digest) {
        if (image && candidate.image !== image) throw new Error(`imagem divergente: ${name}/${region}`);
        image = candidate.image;
        process.stdout.write(`✓ já atualizado ${name}/${region}\n`);
        continue;
      }
      if (candidate.revision !== old.revision) throw new Error(`candidato parcial inesperado: ${name}/${region}`);
      ensurePrevious(state, name, region, current.service);
      state.inFlight.push(`${name}/${region}`);
      writeJson(stateFile, state);
      const args = ['run', 'deploy', name, '--project', project, '--region', region];
      if (!image) {
        const runtime = JSON.parse(fs.readFileSync(path.join(archives.get(p.codebase), p.codebase, 'package.json'))).engines.node;
        args.push('--source', path.join(archives.get(p.codebase), p.codebase), '--function', p.target, '--base-image', `nodejs${runtime}`, '--no-automatic-updates');
      } else args.push('--image', image);
      args.push('--update-env-vars', `SP_SOURCE_DIGEST=${digest},SP_OPERATION_REGION=${region}`, '--allow-unauthenticated', '--quiet');
      run('gcloud', args, { stdio: 'inherit' });
      const row = recordCurrent(state, v, name, region, p, sha, digest, old.url, image);
      state.inFlight = state.inFlight.filter(x => x !== `${name}/${region}`);
      writeJson(stateFile, state);
      image = row.image;
      process.stdout.write(`✓ sincronizado ${name}/${region}\n`);
    }
  }
  for (const v of ['v2', 'v3']) {
    const file = path.join(root, `.claude/tmp/operation-regions-manifest-${v}.sync-candidate.json`);
    writeJson(file, state.candidates[v]);
    run('node', ['scripts/check-operation-regions-mixed.js', v], { env: { ...process.env, SP_REGION_MANIFEST: file } });
  }
  const configs = Object.fromEntries(['v2', 'v3'].map(v => [v, updatedConfig(v, state.candidates[v])]));
  // Só agora os manifestos de runtime são promovidos. O gate de Hosting continua fechado
  // até as Functions normais e as quatro recovery estarem alinhadas.
  for (const v of ['v2', 'v3']) writeJson(manifestPath(v), state.candidates[v]);
  writeJson(path.join(root, 'operation-regions.json'), configs.v2);
  writeJson(path.join(root, 'operation-regions-v3.json'), configs.v3);
  process.stdout.write('✓ 48 portas sincronizadas; falta sincronizar normais/recovery e validar gate\n');
} catch (error) {
  process.stderr.write(`sincronização interrompida: ${error.message}\n`);
  try { rollback(state); } catch (rollbackError) { process.stderr.write(`${rollbackError.message}\n`); }
  process.exitCode = 1;
} finally {
  for (const dir of archives.values()) fs.rmSync(dir, { recursive: true, force: true });
}
}
if (require.main === module) main();
module.exports = { policy, regions, validateManifest, lookup, key, updatedConfig };
