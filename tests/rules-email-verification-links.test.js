'use strict';
/* Confirmação de e-mail: leitura por token válido, sem enumeração nem escrita. */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8097;
const PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}', H='http://127.0.0.1:${PORT}', base=H+'/v1/projects/'+P+'/databases/(default)/documents/';
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=uid=>b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/'+P,aud:P,sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})+'.';
const headers=who=>Object.assign({'Content-Type':'application/json'},who==='owner'?{Authorization:'Bearer owner'}:who?{Authorization:'Bearer '+jwt(who)}:{});
async function req(method, p, who, body) { const r=await fetch(base+p,{method,headers:headers(who),body:body?JSON.stringify(body):undefined}); return r.status; }
async function query(who) { const r=await fetch(H+'/v1/projects/'+P+'/databases/(default)/documents:runQuery',{method:'POST',headers:headers(who),body:JSON.stringify({structuredQuery:{from:[{collectionId:'emailVerificationLinks'}],limit:5}})}); return r.status; }
const S=v=>({stringValue:v}), T=v=>({timestampValue:v});
const good={firebaseLink:S('https://example.invalid/?mode=verifyEmail'),expiresAt:T(new Date(Date.now()+600000).toISOString())};
const expired={firebaseLink:S('https://example.invalid/?mode=verifyEmail'),expiresAt:T(new Date(Date.now()-600000).toISOString())};
(async()=>{const o={};
 o.seedGood=await req('PATCH','emailVerificationLinks/known','owner',{fields:good});
 o.seedExpired=await req('PATCH','emailVerificationLinks/expired','owner',{fields:expired});
 o.getAnon=await req('GET','emailVerificationLinks/known',null);
 o.getAuth=await req('GET','emailVerificationLinks/known','uidA');
 o.getExpiredAnon=await req('GET','emailVerificationLinks/expired',null);
 o.getExpiredAuth=await req('GET','emailVerificationLinks/expired','uidA');
 o.listAnon=await req('GET','emailVerificationLinks?pageSize=5',null);
 o.listAuth=await req('GET','emailVerificationLinks?pageSize=5','uidA');
 o.queryAnon=await query(null); o.queryAuth=await query('uidA');
 o.createAnon=await req('POST','emailVerificationLinks?documentId=new',null,{fields:good});
 o.createAuth=await req('POST','emailVerificationLinks?documentId=new','uidA',{fields:good});
 o.updateAnon=await req('PATCH','emailVerificationLinks/known?updateMask.fieldPaths=firebaseLink',null,{fields:good});
 o.updateAuth=await req('PATCH','emailVerificationLinks/known?updateMask.fieldPaths=firebaseLink','uidA',{fields:good});
 o.deleteAnon=await req('DELETE','emailVerificationLinks/known',null);
 o.deleteAuth=await req('DELETE','emailVerificationLinks/known','uidA');
 console.log('__JSON__'+JSON.stringify(o));
})().catch(e=>{console.error(e);process.exit(1)});
`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-verification-rules-'));
try {
  const config = path.join(tmp, 'firebase.json');
  const driver = path.join(tmp, 'driver.js');
  fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(ROOT, 'firestore.rules') }, emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true } }));
  fs.writeFileSync(driver, DRIVER);
  const out = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config, '--project', PROJECT, 'node ' + JSON.stringify(driver)], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
  const match = /__JSON__(\{.*\})/.exec(out);
  if (!match) throw new Error('driver sem resultado: ' + out.slice(-600));
  const r = JSON.parse(match[1]);
  const checks = [
    [r.seedGood === 200 && r.seedExpired === 200, 'semeadura administrativa'],
    [r.getAnon === 200 && r.getAuth === 200, 'get de token vigente permitido'],
    [r.getExpiredAnon === 403 && r.getExpiredAuth === 403, 'token vencido negado'],
    [r.listAnon === 403 && r.listAuth === 403 && r.queryAnon === 403 && r.queryAuth === 403, 'list e query negados'],
    [r.createAnon === 403 && r.createAuth === 403 && r.updateAnon === 403 && r.updateAuth === 403 && r.deleteAnon === 403 && r.deleteAuth === 403, 'toda escrita negada'],
  ];
  checks.forEach(([ok, label]) => { if (!ok) throw new Error(label + ': ' + JSON.stringify(r)); console.log('  ✓ ' + label); });
  console.log('\n✅ rules-email-verification-links: ' + checks.length + ' verificações');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
