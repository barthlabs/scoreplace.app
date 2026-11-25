#!/usr/bin/env node
'use strict';

// One complete serving region is required before Hosting. Replicas are checked
// after the site, using the same manifest, traffic and transport contracts.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { loadManifest, checkPort } = require('./check-live-operation-readiness');
const { servedRevisionName, checkServed } = require('./check-served-operation-revision');
const execute = promisify(execFile);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

async function describe(kind, name, region) {
  const { stdout } = await execute('gcloud', ['run', kind, 'describe', name,
    '--project', 'scoreplace-app', '--region', region, '--format=json'], { maxBuffer:16 * 1024 * 1024 });
  return JSON.parse(stdout);
}

function requiredRows(config, manifest, region) {
  if (!config.regions.includes(region)) throw new Error('Região fora da configuração publicada');
  const names = Object.keys(config.services);
  if (names.length !== 6) throw new Error('São necessárias as seis portas operacionais');
  return names.map(name => {
    const matches = manifest.filter(row => row.name === name && row.region === region);
    const row = matches[0], service = config.services[name];
    if (matches.length !== 1 || !row || row.url !== service.urls[region] ||
        row.sourceDigest !== service.digest || !/^[a-f0-9]{64}$/.test(row.sourceDigest) ||
        !row.image?.includes('@sha256:') || !row.revision) {
      throw new Error('Manifesto principal divergente: ' + name + '/' + region);
    }
    return row;
  });
}

async function verifyRegion(config, manifest, region, options = {}) {
  const read = options.describe || describe;
  const transport = options.checkPort || (url => checkPort(url, fetch, 12000));
  const verified = await Promise.all(requiredRows(config, manifest, region).map(async row => {
    const service = await read('services', row.name, region);
    const revision = await read('revisions', servedRevisionName(service), region);
    checkServed(service, revision, row);
    await transport(row.url);
    return { name:row.name, region, revision:row.revision, image:row.image,
      sourceDigest:row.sourceDigest, url:row.url };
  }));
  return { region, verified };
}

async function selectPrimary(config, manifest, options = {}) {
  const regions = options.region ? [options.region] : config.regions;
  const errors = [];
  for (const region of regions) {
    try { return await verifyRegion(config, manifest, region, options); }
    catch (error) { errors.push(region + ': ' + error.message); }
  }
  throw new Error('Nenhuma região principal completa foi verificada: ' + errors.join('; '));
}

function writeReceipt(file, result, configBytes, manifestBytes, now = new Date()) {
  const receipt = { schema:1, checkedAt:now.toISOString(), configHash:hash(configBytes),
    manifestHash:hash(manifestBytes), ...result };
  const target=path.resolve(file),repository=path.resolve(__dirname,'..');
  if(target===repository || target.startsWith(repository+path.sep))throw new Error('Recibo deve ficar fora do repositório');
  fs.mkdirSync(path.dirname(file), { recursive:true, mode:0o700 });
  if(fs.lstatSync(path.dirname(file)).isSymbolicLink() || (fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()))throw new Error('Recibo não pode ser link');
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { mode:0o600 });
  fs.chmodSync(file, 0o600);
  return receipt;
}

async function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--dry-run') { args.dryRun = true; continue; }
    if (!['--config','--manifest','--region','--receipt'].includes(flag) || !argv[index+1]) {
      throw new Error('Uso: check-primary-operation-readiness.js [--region região] [--config arquivo] [--manifest arquivo] [--receipt arquivo] [--dry-run]');
    }
    args[flag.slice(2)] = argv[++index];
  }
  const root = path.join(__dirname, '..');
  const configFile = path.resolve(args.config || path.join(root, 'operation-regions-v3.json'));
  const manifestFile = path.resolve(args.manifest || path.join(root, '.claude/tmp/operation-regions-manifest-v3.json'));
  const configBytes = fs.readFileSync(configFile), manifestBytes = fs.readFileSync(manifestFile);
  const config = await loadManifest(configFile, fetch, 12000);
  const manifest = JSON.parse(manifestBytes);
  if (!Array.isArray(manifest)) throw new Error('Manifesto regional inválido');
  if (args.dryRun) {
    for (const region of args.region ? [args.region] : config.regions) requiredRows(config, manifest, region);
    console.log(JSON.stringify({ mode:'dry-run', regions:args.region ? [args.region] : config.regions, services:Object.keys(config.services) }));
    return;
  }
  const result = await selectPrimary(config, manifest, { region:args.region });
  const file = args.receipt || path.join(os.tmpdir(), 'scoreplace-deploy', 'rollouts', 'primary-' + hash(configBytes) + '.json');
  const receipt = writeReceipt(file, result, configBytes, manifestBytes);
  console.log(JSON.stringify({ region:receipt.region, ports:receipt.verified.length,
    checkedAt:receipt.checkedAt, receipt:file }));
}

if (require.main === module) main().catch(error => { console.error('✗ ' + error.message); process.exitCode = 1; });
module.exports = { requiredRows, verifyRegion, selectPrimary, writeReceipt, hash, main };
