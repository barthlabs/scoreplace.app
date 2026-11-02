'use strict';
const { rodarNoEmulador } = require('./emulador');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const PORT = 8128;
const PROJECT = 'demo-scoreplace-phase-certificate';
const DRIVER = `
const P=${JSON.stringify(PROJECT)},H='http://127.0.0.1:${PORT}',b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const base=H+'/v1/projects/'+P+'/databases/(default)/documents/';
const S=v=>({stringValue:v}), C=v=>({mapValue:{fields:{version:{integerValue:'1'},count:{integerValue:'1'},digest:S(v)}}});
async function req(method,p,uid,body){const r=await fetch(base+p,{method,headers:{Authorization:uid==='owner'?'Bearer owner':'Bearer '+tok(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,body:await r.json()};}
(async()=>{const u='uid_org',p='tournaments/t1';
await req('PATCH',p,'owner',{fields:{creatorUid:S(u),name:S('Torneio'),_phaseReadCertificate:C('original')}});
const out={};
out.addOnCreate=(await req('PATCH','tournaments/t2',u,{fields:{creatorUid:S(u),name:S('Novo'),_phaseReadCertificate:C('forged')}})).status;
out.edit=(await req('PATCH',p+'?updateMask.fieldPaths=name',u,{fields:{name:S('Nome permitido')}})).status;
out.forge=(await req('PATCH',p+'?updateMask.fieldPaths=_phaseReadCertificate',u,{fields:{_phaseReadCertificate:C('forged')}})).status;
out.remove=(await req('PATCH',p+'?updateMask.fieldPaths=_phaseReadCertificate',u,{fields:{}})).status;
out.final=(await req('GET',p,'owner')).body.fields._phaseReadCertificate.mapValue.fields.digest.stringValue;
console.log('__JSON__'+JSON.stringify(out));})().catch(e=>{console.error(e);process.exitCode=1});`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-phase-cert-'));
const config = path.join(dir, 'firebase.json');
const driver = path.join(dir, 'driver.js');
fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(ROOT, 'firestore.rules') },
  emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true } }));
fs.writeFileSync(driver, DRIVER);
try {
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', PROJECT, 'node ' + JSON.stringify(driver)],
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
  const match = /__JSON__(\{.*\})/.exec(output);
  assert.ok(match, 'driver sem resultado: ' + output.slice(-800));
  const result = JSON.parse(match[1]);
  assert.equal(result.addOnCreate, 403, 'cliente não cria torneio com atestado');
  assert.equal(result.edit, 200, 'edição comum preserva atestado do servidor');
  assert.equal(result.forge, 403, 'cliente não substitui atestado');
  assert.equal(result.remove, 403, 'cliente não remove atestado');
  assert.equal(result.final, 'original', 'atestado original permanece');
  console.log('rules-phase-read-certificate: criação, preservação, substituição e remoção OK');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
