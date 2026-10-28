'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.join(__dirname, '..');
const gatePath = path.join(root, '.claude/tmp/operation-legacy-gate-manifest-v2.json');
const regionsPath = path.join(root, '.claude/tmp/operation-regions-manifest-v2.json');

test('--check-live aceita candidato externo e rejeita recovery de placar antiga', {
  skip: !fs.existsSync(gatePath) || !fs.existsSync(regionsPath),
}, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-gate-live-fake-'));
  const fake = (name, body) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/usr/bin/env node\n${body}\n`);
    fs.chmodSync(file, 0o755);
  };
  const regions = JSON.parse(fs.readFileSync(regionsPath, 'utf8'));
  const original = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
  const candidate = structuredClone(original);
  const score = regions.find(row => row.name === 'sp-op-score-v2' && row.region === 'us-east1');
  const saved = candidate.recovery.find(row => row.name === 'applymatchresult-run-recovery');
  saved.image = score.image;
  saved.revision = 'applymatchresult-run-recovery-new';
  const candidatePath = path.join(dir, 'candidate.json');
  fs.writeFileSync(candidatePath, JSON.stringify(candidate));
  fake('git', `const c=require('node:child_process');const a=process.argv.slice(2);if(a[0]==='status'&&a[1]==='--porcelain')process.exit(0);const r=c.spawnSync('/usr/bin/git',a,{stdio:'inherit'});process.exit(r.status??1);`);
  fake('curl', `const fs=require('node:fs'),a=process.argv.slice(2);fs.writeFileSync(a[a.indexOf('-o')+1],JSON.stringify({error:{status:'UNAUTHENTICATED'}}));process.stdout.write('401');`);
  fake('gcloud', `
const fs=require('node:fs'),path=require('node:path'),a=process.argv.slice(2),root=process.env.SP_FAKE_ROOT;
const rows=JSON.parse(fs.readFileSync(path.join(root,'.claude/tmp/operation-regions-manifest-v2.json'))),gate=JSON.parse(fs.readFileSync(process.env.SP_GATE_MANIFEST));
const region=a[a.indexOf('--region')+1],name=a[3];let value;
if(a[0]==='functions'){
 const row=gate.normal.find(x=>x.name===a[2]);if(!row)process.exit(2);
 value={state:'ACTIVE',buildConfig:{entryPoint:row.name},updateTime:row.updateTime};
}else if(a[1]==='services'){
 const row=rows.find(x=>x.name===name&&x.region===region)||gate.recovery.find(x=>x.name===name);if(!row)process.exit(2);
 const digest=row.sourceDigest||'unused',served=row.revision;
 value={spec:{template:{spec:{containers:[{image:row.image,env:[{name:'SP_SOURCE_DIGEST',value:digest},{name:'SP_OPERATION_REGION',value:region}]}]}}},status:{url:row.url,latestReadyRevisionName:served,traffic:[{revisionName:served,percent:100,latestRevision:true}]}};
}else if(a[1]==='revisions'){
 const row=rows.find(x=>x.revision===name&&x.region===region);if(!row)process.exit(2);
 value={metadata:{name},spec:{containers:[{image:row.image,env:[{name:'SP_SOURCE_DIGEST',value:row.sourceDigest},{name:'SP_OPERATION_REGION',value:region}]}]},status:{conditions:[{type:'Ready',status:'True'}]}};
}else process.exit(2);
process.stdout.write(JSON.stringify(value));
`);
  const env = { ...process.env, PATH: `${dir}:${process.env.PATH}`, SP_FAKE_ROOT: root, SP_GATE_MANIFEST: candidatePath };
  try {
    const good = cp.spawnSync('bash', ['scripts/deploy-operation-legacy-gate-v2.sh', '--check-live'], {
      cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    assert.equal(good.status, 0, good.stderr);
    saved.image = original.recovery.find(row => row.name === saved.name).image;
    fs.writeFileSync(candidatePath, JSON.stringify(candidate));
    const bad = cp.spawnSync('bash', ['scripts/deploy-operation-legacy-gate-v2.sh', '--check-live'], {
      cwd: root, env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    });
    assert.notEqual(bad.status, 0, 'recovery score antiga reprova apesar do candidato');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
