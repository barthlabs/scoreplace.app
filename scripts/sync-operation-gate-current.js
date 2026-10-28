#!/usr/bin/env node
'use strict';
// Alinha as seis callables e as quatro recovery à malha v2 já sincronizada.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { servedRevisionName } = require('./check-served-operation-revision');
const { checkRecovery } = require('./check-operation-recovery-row');
const { verify } = require('./verify-function-source');

const root = path.join(__dirname, '..');
const project = 'scoreplace-app';
const sourceCommit = '40be907dfc593db2eb4de1d6ed9783493b301787';
const gateFile = path.join(root, '.claude/tmp/operation-legacy-gate-manifest-v2.json');
const regionsFile = path.join(root, '.claude/tmp/operation-regions-manifest-v2.json');
const stateFile = process.env.SP_GATE_SYNC_STATE || path.join(root, '.claude/tmp/operation-gate-current-sync.json');
const normals = [
  ['setTournamentPresence', 'functions'],
  ['applyMatchResult', 'functions-autodraw'],
  ['applyQueuedResult', 'functions-autodraw'],
  ['assignMatchCourt', 'functions-autodraw'],
  ['setTournamentPresenceWithWOSubstitution', 'functions-autodraw'],
  ['endMatchOnCourt', 'functions-autodraw'],
];
const recovery = [
  ['assignmatchcourt-run-recovery', 'sp-op-court-v2'],
  ['applymatchresult-run-recovery', 'sp-op-score-v2'],
  ['settournamentpresence-run-recovery', 'sp-op-presence-v2'],
  ['presencwo-run-recovery', 'sp-op-presence-wo-v2'],
];
const mode = process.argv[2] || '--check';

function run(file, args, options = {}) {
  const output = cp.execFileSync(file, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 32 * 1024 * 1024, ...options });
  return typeof output === 'string' ? output.trim() : '';
}
function gcloud(args) { return JSON.parse(run('gcloud', [...args, '--project', project, '--format=json'])); }
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, value) { fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function one(rows, name) { const found = rows.filter(x => x.name === name); if (found.length !== 1) throw new Error(`linha ausente/duplicada: ${name}`); return found[0]; }
function runService(name, region) { return gcloud(['run', 'services', 'describe', name, '--region', region]); }
function runRevision(name, region) { return gcloud(['run', 'revisions', 'describe', name, '--region', region]); }
function functionInfo(name) { return gcloud(['functions', 'describe', name, '--region', 'us-central1', '--gen2']); }
function functionRunName(info) {
  const resource = info.serviceConfig?.service;
  if (!resource?.startsWith(`projects/${project}/locations/us-central1/services/`)) throw new Error('serviço gen2 inesperado');
  return resource.split('/').at(-1);
}
function probe(url) {
  const r = cp.spawnSync('curl', ['-sS', '--max-time', '20', '-H', 'content-type: application/json', '-d', '{"data":{"probe":true}}', '-o', '/dev/null', '-w', '%{http_code}', url], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0 || !['401', '403'].includes(r.stdout.trim())) throw new Error(`sonda Auth divergente: ${url}`);
}
function loadState() {
  if (fs.existsSync(stateFile)) return read(stateFile);
  const original = read(gateFile);
  if (normals.some(([name]) => !original.normal?.some(row => row.name === name)) ||
      recovery.some(([name]) => !original.recovery?.some(row => row.name === name)) ||
      original.normal.length !== 6 || original.recovery.length !== 4) throw new Error('gate original incompleto');
  const state = { schema: 1, sourceCommit, original, candidate: { startedAt: original.startedAt, sourceCommit, normal: [], recovery: [] }, previous: {}, inFlight: [], updated: [] };
  write(stateFile, state);
  return state;
}
function verifyPrerequisites() {
  if (run('git', ['status', '--porcelain'])) throw new Error('árvore suja');
  if (cp.spawnSync('git', ['diff', '--quiet', sourceCommit, 'HEAD', '--', 'functions', 'functions-autodraw'], { cwd: root }).status !== 0) throw new Error('backend mudou após o commit de fonte');
  run('node', ['scripts/check-vendor-fresh.js']);
  run('bash', ['scripts/deploy-operation-regions.sh', '--check-v2-live']);
  const rows = read(regionsFile);
  if (rows.length !== 18 || rows.some(row => row.commit !== sourceCommit)) throw new Error('malha v2 não está no corte atual');
  return rows;
}
function savePrevious(state, id, name, region, service) {
  if (state.previous[id]) return;
  const served = servedRevisionName(service);
  const rev = runRevision(served, region);
  state.previous[id] = { name, region, revision: served, image: rev.spec?.containers?.[0]?.image, url: service.status?.url };
  if (!state.previous[id].image?.includes('@sha256:')) throw new Error(`imagem antiga não imutável: ${id}`);
  write(stateFile, state);
}
function markFlight(state, id) { if (!state.inFlight.includes(id)) state.inFlight.push(id); write(stateFile, state); }
function markDone(state, id) { state.inFlight = state.inFlight.filter(x => x !== id); if (!state.updated.includes(id)) state.updated.push(id); write(stateFile, state); }
function rollback(state) {
  const errors = [];
  for (const id of [...new Set([...state.updated, ...state.inFlight])].reverse()) {
    const prev = state.previous[id];
    if (!prev?.revision) { errors.push(`${id}: revisão antiga ausente`); continue; }
    try {
      run('gcloud', ['run', 'services', 'update-traffic', prev.name, '--project', project, '--region', prev.region, '--to-revisions', `${prev.revision}=100`, '--quiet'], { stdio: 'inherit' });
      const s = runService(prev.name, prev.region);
      const r = runRevision(servedRevisionName(s), prev.region);
      if (servedRevisionName(s) !== prev.revision || r.spec?.containers?.[0]?.image !== prev.image || s.status?.url !== prev.url) throw new Error('revisão antiga não servida');
      if (id.startsWith('normal/')) state.candidate.normal = state.candidate.normal.filter(row => row.name !== id.slice(7));
      if (id.startsWith('recovery/')) state.candidate.recovery = state.candidate.recovery.filter(row => row.name !== id.slice(9));
      state.updated = state.updated.filter(x => x !== id);
      state.inFlight = state.inFlight.filter(x => x !== id);
      write(stateFile, state);
    } catch (error) { errors.push(`${id}: ${error.message}`); }
  }
  for (const [id, prev] of Object.entries(state.previous)) {
    try {
      const s = runService(prev.name, prev.region);
      if (servedRevisionName(s) !== prev.revision) throw new Error('tráfego mudou após rollback');
      process.stdout.write(`rollback ${id}: latestReady=${s.status?.latestReadyRevisionName || 'ausente'}, served=${servedRevisionName(s)}\n`);
    } catch (error) { errors.push(`${id}: rechecagem final: ${error.message}`); }
  }
  if (errors.length) throw new Error(`rollback incompleto:\n${errors.join('\n')}`);
}
function recordNormal(state, name, codebase) {
  const proof = verify(name, codebase, sourceCommit, state.original.startedAt);
  const f = functionInfo(name);
  const serviceName = functionRunName(f);
  const s = runService(serviceName, 'us-central1');
  if (servedRevisionName(s) !== s.status?.latestReadyRevisionName) throw new Error(`Function sem 100% na revisão nova: ${name}`);
  const row = { ...proof, service: serviceName, servedRevision: servedRevisionName(s), image: runRevision(servedRevisionName(s), 'us-central1').spec?.containers?.[0]?.image };
  if (!row.image?.includes('@sha256:')) throw new Error(`imagem da Function não imutável: ${name}`);
  const current = state.candidate.normal.find(x => x.name === name);
  if (current && JSON.stringify(current) !== JSON.stringify(row)) throw new Error(`Function mudou durante retomada: ${name}`);
  if (!current) state.candidate.normal.push(row);
  write(stateFile, state);
  return row;
}
function recordRecovery(state, rows, name, regional) {
  const target = rows.filter(row => row.name === regional && row.region === 'us-east1');
  if (target.length !== 1) throw new Error(`porta v2 ausente: ${regional}`);
  const s = runService(name, 'us-east1');
  const served = servedRevisionName(s);
  const r = runRevision(served, 'us-east1');
  const env = Object.fromEntries((r.spec?.containers?.[0]?.env || []).map(x => [x.name, x.value]));
  if (r.spec?.containers?.[0]?.image !== target[0].image || env.SP_SOURCE_DIGEST !== target[0].sourceDigest || env.SP_OPERATION_REGION !== 'us-east1') throw new Error(`recovery divergente: ${name}`);
  const row = { name, image: target[0].image, revision: served, url: s.status?.url };
  const candidate = { recovery: [row] };
  checkRecovery(s, rows, candidate, name, regional);
  probe(row.url);
  const old = state.candidate.recovery.find(x => x.name === name);
  if (old && JSON.stringify(old) !== JSON.stringify(row)) throw new Error(`recovery mudou durante retomada: ${name}`);
  if (!old) state.candidate.recovery.push(row);
  write(stateFile, state);
  return row;
}
function main() {
  if (!['--check', '--deploy', '--rollback'].includes(mode)) throw new Error('uso: --check|--deploy|--rollback');
  const state = loadState();
  if (mode === '--rollback') return rollback(state);
  if (JSON.stringify(read(gateFile)) !== JSON.stringify(state.original)) throw new Error('gate original mudou durante sincronização');
  const rows = verifyPrerequisites();
  if (mode === '--check') {
    for (const [name, codebase] of normals) {
      const f = functionInfo(name), old = one(state.original.normal, name), newer = state.candidate.normal.find(row => row.name === name);
      if (!newer && f.updateTime !== old.updateTime) verify(name, codebase, sourceCommit, state.original.startedAt);
      if (newer && f.updateTime !== newer.updateTime) throw new Error(`Function candidata mudou: ${name}`);
    }
    for (const [name] of recovery) {
      const s = runService(name, 'us-east1'), old = one(state.original.recovery, name), newer = state.candidate.recovery.find(row => row.name === name);
      if (servedRevisionName(s) !== (newer || old).revision) throw new Error(`recovery mudou sem recibo: ${name}`);
    }
    return;
  }
  try {
    for (const [name, codebase] of normals) {
      const f = functionInfo(name), old = one(state.original.normal, name), current = state.candidate.normal.find(row => row.name === name);
      if (current) { recordNormal(state, name, codebase); continue; }
      const serviceName = functionRunName(f);
      if (f.updateTime === old.updateTime) {
        savePrevious(state, `normal/${name}`, serviceName, 'us-central1', runService(serviceName, 'us-central1'));
        markFlight(state, `normal/${name}`);
        run('bash', ['scripts/deploy-functions.sh', codebase === 'functions' ? 'main' : 'autodraw', '--only', name], { stdio: 'inherit' });
        recordNormal(state, name, codebase);
        markDone(state, `normal/${name}`);
      } else {
        // Já publicada pelo rollout parcial, ou revisão nova com tráfego revertido.
        const prev = state.previous[`normal/${name}`];
        if (prev && servedRevisionName(runService(serviceName, 'us-central1')) === prev.revision) {
          const currentService = runService(serviceName, 'us-central1');
          const latest = currentService.status?.latestReadyRevisionName;
          if (!latest || latest === prev.revision) throw new Error(`revisão nova ausente após rollback: ${name}`);
          markFlight(state, `normal/${name}`);
          run('gcloud', ['run', 'services', 'update-traffic', serviceName, '--project', project, '--region', 'us-central1', '--to-revisions', `${latest}=100`, '--quiet'], { stdio: 'inherit' });
          recordNormal(state, name, codebase);
          markDone(state, `normal/${name}`);
          continue;
        }
        recordNormal(state, name, codebase);
      }
    }
    for (const [name, regional] of recovery) {
      const target = rows.find(row => row.name === regional && row.region === 'us-east1');
      if (!target) throw new Error(`porta v2 ausente: ${regional}`);
      const s = runService(name, 'us-east1');
      if (state.candidate.recovery.some(row => row.name === name)) { recordRecovery(state, rows, name, regional); continue; }
      const original = one(state.original.recovery, name);
      if (servedRevisionName(s) !== original.revision || s.status?.url !== original.url) throw new Error(`recovery mudou sem recibo: ${name}`);
      const prev = state.previous[`recovery/${name}`];
      if (prev && s.spec?.template?.spec?.containers?.[0]?.image === target.image) {
        const latest = s.status?.latestReadyRevisionName;
        if (!latest || latest === prev.revision) throw new Error(`revisão nova ausente após rollback: ${name}`);
        markFlight(state, `recovery/${name}`);
        run('gcloud', ['run', 'services', 'update-traffic', name, '--project', project, '--region', 'us-east1', '--to-revisions', `${latest}=100`, '--quiet'], { stdio: 'inherit' });
        recordRecovery(state, rows, name, regional);
        markDone(state, `recovery/${name}`);
        continue;
      }
      if (s.spec?.template?.spec?.containers?.[0]?.image === target.image) { recordRecovery(state, rows, name, regional); continue; }
      savePrevious(state, `recovery/${name}`, name, 'us-east1', s);
      markFlight(state, `recovery/${name}`);
      run('gcloud', ['run', 'deploy', name, '--project', project, '--region', 'us-east1', '--image', target.image,
        '--update-env-vars', `SP_SOURCE_DIGEST=${target.sourceDigest},SP_OPERATION_REGION=us-east1`, '--allow-unauthenticated', '--quiet'], { stdio: 'inherit' });
      recordRecovery(state, rows, name, regional);
      markDone(state, `recovery/${name}`);
    }
    if (state.candidate.normal.length !== 6 || state.candidate.recovery.length !== 4) throw new Error('gate candidato incompleto');
    const candidate = path.join(root, '.claude/tmp/operation-legacy-gate-manifest-v2.sync-candidate.json');
    write(candidate, state.candidate);
    run('bash', ['scripts/deploy-operation-legacy-gate-v2.sh', '--check-live'], { env: { ...process.env, SP_GATE_MANIFEST: candidate } });
    write(gateFile, state.candidate);
    process.stdout.write('✓ seis callables e quatro recovery alinhadas; gate promovido\n');
  } catch (error) {
    process.stderr.write(`gate interrompido: ${error.message}\n`);
    try { rollback(state); } catch (rollbackError) { process.stderr.write(`${rollbackError.message}\n`); }
    process.exitCode = 1;
  }
}
if (require.main === module) main();
module.exports = { normals, recovery, one, functionRunName };
