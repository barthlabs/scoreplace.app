'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const { policy, regions, validateManifest, lookup, updatedConfig } = require('../scripts/sync-operation-regions-current');
const { legacyFixtureAvailability, legacyFixtureRows } = require('./operation-regions-legacy-fixture');

const root = path.join(__dirname, '..');
const legacyAvailability = legacyFixtureAvailability();
const historyPath = path.join(root, '.claude/tmp/operation-regions-current-sync.json');
const hasOriginalHistory = fs.existsSync(historyPath)
  && Boolean(JSON.parse(fs.readFileSync(historyPath, 'utf8')).originals);
function isolatedManifests(dir, legacy = false) {
  const savedPath = historyPath;
  const saved = legacy && fs.existsSync(savedPath) ? JSON.parse(fs.readFileSync(savedPath, 'utf8')) : null;
  const rows = {};
  for (const version of ['v2', 'v3']) {
    const current = JSON.parse(fs.readFileSync(
      path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`), 'utf8'));
    rows[version] = saved?.originals?.[version] || (legacy
      ? legacyFixtureRows(current, legacyAvailability.parent)
      : current);
    fs.writeFileSync(path.join(dir, `operation-regions-manifest-${version}.json`), JSON.stringify(rows[version]));
  }
  return rows;
}
for (const version of ['v2', 'v3']) {
  const file = path.join(root, `.claude/tmp/operation-regions-manifest-${version}.json`);
  test(`${version}: sincronizador aceita só as portas e regiões declaradas`, { skip: !fs.existsSync(file) }, () => {
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.doesNotThrow(() => validateManifest(version, rows));
    assert.equal(rows.length, policy.length * regions[version].length);
    const missing = structuredClone(rows).slice(1);
    assert.throws(() => validateManifest(version, missing), /incompleto/);
    const extra = structuredClone(rows);
    extra[0].name = 'sp-op-inventado';
    assert.throws(() => validateManifest(version, extra), /inesperado/);
    const wrongTarget = structuredClone(rows);
    wrongTarget[0].target = 'anotherFunction';
    assert.throws(() => validateManifest(version, wrongTarget), /linha inválida/);
    assert.equal(lookup(rows, rows[0].name, rows[0].region).revision, rows[0].revision);
    const config = updatedConfig(version, rows);
    assert.equal(config.services[rows[0].name].digest, rows[0].sourceDigest);
    const wrongUrl = structuredClone(rows);
    wrongUrl[0].url = 'https://different.example';
    assert.throws(() => updatedConfig(version, wrongUrl), /URL da configuração divergente/);
    const wrongDigest = structuredClone(rows);
    wrongDigest[1].sourceDigest = 'different';
    assert.throws(() => updatedConfig(version, wrongDigest), /digest não uniforme/);
  });
}

test('prévia offline verifica as 48 portas e falha com imagem divergente', { skip: !['v2', 'v3'].every(v => fs.existsSync(path.join(root, `.claude/tmp/operation-regions-manifest-${v}.json`))) }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-regional-fake-'));
  isolatedManifests(dir);
  const fake = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  // A prova regional usa uma fonte congelada; mudanças posteriores em outra callable
  // não fazem parte da fixture. O controle de fonte é testado no fluxo real.
  fake('git', `const c=require('node:child_process');const a=process.argv.slice(2);if(a[0]==='status'&&a[1]==='--porcelain')process.exit(0);if(a[0]==='diff'&&a[1]==='--quiet')process.exit(0);const r=c.spawnSync('/usr/bin/git',a,{stdio:'inherit'});process.exit(r.status??1);`);
  fake('curl', `process.stdout.write('401');`);
  fake('gcloud', `const fs=require('node:fs'),path=require('node:path');const a=process.argv.slice(2),name=a[3],ri=a.indexOf('--region'),region=a[ri+1],rows=['v2','v3'].flatMap(v=>JSON.parse(fs.readFileSync(path.join(process.env.SP_REGIONAL_MANIFEST_DIR,'operation-regions-manifest-'+v+'.json')))),row=rows.find(x=>x.region===region&&(a[1]==='services'?x.name===name:x.revision===name));if(!row)process.exit(2);const bad=process.env.SP_FAKE_BAD===row.name+'/'+region;let value;if(a[1]==='services'){value={status:{url:row.url,latestReadyRevisionName:row.revision,traffic:[{revisionName:row.revision,percent:100,latestRevision:true}]}};}else if(a[1]==='revisions'){value={metadata:{name:row.revision},status:{conditions:[{type:'Ready',status:'True'}]},spec:{containers:[{image:bad?'wrong@sha256:'+('0'.repeat(64)):row.image,env:[{name:'SP_SOURCE_DIGEST',value:row.sourceDigest},{name:'SP_OPERATION_REGION',value:region}]}]}};}else process.exit(2);process.stdout.write(JSON.stringify(value));`);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, SP_REGIONAL_MANIFEST_DIR: dir,
    SP_REGIONAL_SYNC_STATE: path.join(dir, 'sync.json') };
  try {
    const good = cp.spawnSync('node', ['scripts/sync-operation-regions-current.js', '--check'], { cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.equal(good.status, 0, good.stderr);
    assert.equal((good.stdout.match(/^✓ sp-op-/gm) || []).length, 48);
    const bad = cp.spawnSync('node', ['scripts/sync-operation-regions-current.js', '--check'], { cwd: root, env: { ...env, SP_FAKE_BAD: 'sp-op-score-v2/us-east1' }, encoding: 'utf8' });
    assert.notEqual(bad.status, 0, 'imagem de revisão divergente bloqueia a prévia');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('falha parcial offline restaura tráfego das portas já alteradas', { skip: !['v2', 'v3'].every(v => fs.existsSync(path.join(root, `.claude/tmp/operation-regions-manifest-${v}.json`))) || (!hasOriginalHistory && legacyAvailability.skipReason) }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-regional-rollback-'));
  const baseline = isolatedManifests(dir, true);
  const fake = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  fake('git', `const c=require('node:child_process');const a=process.argv.slice(2);if(a[0]==='status'&&a[1]==='--porcelain')process.exit(0);if(a[0]==='diff'&&a[1]==='--quiet')process.exit(0);const r=c.spawnSync('/usr/bin/git',a,{stdio:'inherit'});process.exit(r.status??1);`);
  fake('curl', `const fs=require('node:fs'),file=process.env.SP_FAKE_CURL_ONCE;if(file&&!fs.existsSync(file)){fs.writeFileSync(file,'first');process.stdout.write('000');}else process.stdout.write('401');`);
  fake('gcloud', `
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2);
const file=process.env.SP_FAKE_STATE,state=JSON.parse(fs.readFileSync(file));
const rows=['v2','v3'].flatMap(v=>JSON.parse(fs.readFileSync(path.join(process.env.SP_REGIONAL_MANIFEST_DIR,'operation-regions-manifest-'+v+'.json'))));
const arg=(n)=>a[a.indexOf(n)+1],region=arg('--region'),name=a[1]==='deploy'?a[2]:a[3],row=rows.find(x=>x.region===region&&(a[1]==='revisions'?(x.revision===name||x.name+'-new'===name):x.name===name));
if(!row)process.exit(2);
const id=row.name+'/'+region,e=state.entries[id]||{served:row.revision,latest:row.revision,image:row.image,digest:row.sourceDigest};
if(a[1]==='services'&&a[2]==='describe'){
  // Cloud Run mantém latestReady na revisão servida enquanto a nova fica
  // marcada Ready/Retired com 0% de tráfego; ela só reaparece após o corte.
  const ready=e.served;
  process.stdout.write(JSON.stringify({spec:{template:{spec:{containers:[{image:e.image}]}}},status:{url:row.url,latestCreatedRevisionName:e.latest,latestReadyRevisionName:ready,traffic:[{revisionName:e.served,percent:100,latestRevision:e.served===ready}]}}));
}else if(a[1]==='revisions'&&a[2]==='describe'){
  const fresh=name===row.name+'-new';
  process.stdout.write(JSON.stringify({metadata:{name},status:{conditions:[{type:'Ready',status:'True'}]},spec:{containers:[{image:fresh?e.image:row.image,env:[{name:'SP_SOURCE_DIGEST',value:fresh?e.digest:row.sourceDigest},{name:'SP_OPERATION_REGION',value:region}]}]}}));
}else if(a[1]==='services'&&a[2]==='update-traffic'){
  e.served=arg('--to-revisions').split('=')[0];if(e.served===row.name+'-new')state.trafficUpdates++;state.entries[id]=e;fs.writeFileSync(file,JSON.stringify(state));
}else if(a[1]==='deploy'){
  state.deploys++;if(state.deploys===Number(process.env.SP_FAKE_FAIL_AT)){fs.writeFileSync(file,JSON.stringify(state));process.exit(17);}
  const env=arg('--update-env-vars').split(',');e.digest=env[0].split('=')[1];e.image=a.includes('--image')?arg('--image'):'fake/image@sha256:'+('e'.repeat(64));e.latest=row.name+'-new';/* serviço mantém 100% na revisão antiga e a nova fica Ready/Retired */state.entries[id]=e;fs.writeFileSync(file,JSON.stringify(state));
}else process.exit(2);
`);
  const statePath = path.join(dir, 'fake-state.json');
  fs.writeFileSync(statePath, JSON.stringify({ deploys: 0, trafficUpdates: 0, entries: {} }));
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, SP_REGIONAL_MANIFEST_DIR: dir,
    SP_FAKE_STATE: statePath, SP_FAKE_FAIL_AT: '3', SP_FAKE_CURL_ONCE: path.join(dir, 'curl-once'), SP_REGIONAL_SYNC_STATE: path.join(dir, 'sync.json') };
  try {
    const result = cp.spawnSync('node', ['scripts/sync-operation-regions-current.js', '--deploy'], { cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.notEqual(result.status, 0, 'a terceira mutação simulada deve abortar');
    const fakeState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(fakeState.deploys, 3, result.stdout + result.stderr);
    assert.equal(fakeState.trafficUpdates, 2, 'revisões criadas com 0% recebem corte explícito para 100%');
    assert.ok(fs.existsSync(env.SP_FAKE_CURL_ONCE), 'sonda 000 transitória foi repetida');
    assert.equal(Object.values(fakeState.entries).filter(entry => entry.latest.endsWith('-new')).length, 2);
    for (const [id, entry] of Object.entries(fakeState.entries)) {
      const [name, region] = id.split('/');
      const v = name.endsWith('-v2') ? 'v2' : 'v3';
      const original = baseline[v];
      assert.equal(entry.served, lookup(original, name, region).revision, 'tráfego antigo restaurado');
    }
    const syncState = JSON.parse(fs.readFileSync(env.SP_REGIONAL_SYNC_STATE, 'utf8'));
    assert.deepEqual(syncState.updated, []);
    assert.deepEqual(syncState.inFlight, []);
    const resumed = cp.spawnSync('node', ['scripts/sync-operation-regions-current.js', '--deploy'], {
      cwd: root, env: { ...env, SP_FAKE_FAIL_AT: '5' }, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    assert.notEqual(resumed.status, 0, 'a tentativa retomada também deve abortar no ponto simulado');
    const resumedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(resumedState.deploys, 5, 'retomou e avançou até a nova falha simulada');
    const resumedSync = JSON.parse(fs.readFileSync(env.SP_REGIONAL_SYNC_STATE, 'utf8'));
    assert.deepEqual(resumedSync.updated, []);
    assert.deepEqual(resumedSync.inFlight, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
