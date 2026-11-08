#!/usr/bin/env node
'use strict';
// Retoma o corte de tráfego que o refresh deixou pendente, com recibo por porta.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const { servedRevisionName, checkServed } = require('./check-served-operation-revision');
const root = path.resolve(__dirname, '..');
const project = 'scoreplace-app';
const specs = [
  ['v3', ['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1']],
  ['v2', ['us-east1', 'us-east4', 'us-south1']],
];
const run = args => JSON.parse(cp.execFileSync('gcloud', [...args, '--project', project, '--format=json'], { encoding: 'utf8' }));
const service = (name, region) => run(['run', 'services', 'describe', name, '--region', region]);
const revision = (name, region) => run(['run', 'revisions', 'describe', name, '--region', region]);
const envOf = r => Object.fromEntries((r.spec?.containers?.[0]?.env || []).map(e => [e.name, e.value]));
const tasks = [];
for (const [version, regions] of specs) {
  const file = path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`);
  const rows = JSON.parse(fs.readFileSync(file));
  for (const short of ['court', 'control']) for (const region of regions) {
    const name = `sp-op-${short}-${version}`;
    const row = rows.find(r => r.name === name && r.region === region);
    if (!row) throw Error(`manifesto incompleto: ${name}/${region}`);
    const s = service(name, region);
    const active = servedRevisionName(s);
    const next = s.status?.latestCreatedRevisionName;
    if (!next || s.status?.url !== row.url) throw Error(`serviço divergente: ${name}/${region}`);
    const r = revision(next, region);
    const env = envOf(r);
    if (r.spec?.containers?.[0]?.image !== row.image ||
        env.SP_SOURCE_DIGEST !== row.sourceDigest || env.SP_OPERATION_REGION !== region ||
        !r.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True') ||
        r.metadata?.annotations?.['run.googleapis.com/base-images']) {
      throw Error(`revisão candidata divergente: ${name}/${region}`);
    }
    if (active !== row.revision && active !== next) throw Error(`tráfego inesperado: ${name}/${region}`);
    tasks.push({ file, rows, row, name, region, next, active });
  }
}
for (const task of tasks) {
  const { file, rows, row, name, region, next } = task;
  if (task.active !== next) {
    cp.execFileSync('gcloud', ['run', 'services', 'update-traffic', name, '--project', project,
      '--region', region, '--to-revisions', `${next}=100`, '--quiet'], { stdio: 'inherit' });
  }
  const s = service(name, region);
  const r = revision(servedRevisionName(s), region);
  const updated = { ...row, revision: next };
  checkServed(s, r, updated);
  Object.assign(row, updated);
  fs.writeFileSync(file, `${JSON.stringify(rows, null, 2)}\n`);
  process.stdout.write(`✓ ${name}/${region} -> ${next}\n`);
}
