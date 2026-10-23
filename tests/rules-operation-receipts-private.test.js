'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');
const PORT = 8126;
const PROJECT = 'demo-scoreplace';
const driver = `
const host = 'http://127.0.0.1:${PORT}/v1/projects/${PROJECT}/databases/(default)/documents/';
const b64 = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const auth = uid => b64({alg:'none',typ:'JWT'})+'.'+b64({
 iss:'https://securetoken.google.com/${PROJECT}',aud:'${PROJECT}',sub:uid,user_id:uid,
 auth_time:Math.floor(Date.now()/1000),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
 firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
async function req(method, path, uid) {
 const r=await fetch(host+path,{method,headers:{Authorization:uid==='admin'?'Bearer owner':'Bearer '+auth(uid),'Content-Type':'application/json'},
 body:method==='GET'?undefined:JSON.stringify({fields:{kind:{stringValue:'score'}}})});
 return r.status;
}
(async()=>{
 const out=[];
 for(const parent of ['tournaments/tour_test','sandboxes/sb_test']) {
  for(const child of ['operationReceipts/387638c7-0f33-45eb-a217-1314bfe68d73','operationControl/_protocol']) {
   const setup=await req('PATCH',parent+'/'+child,'admin');
   if(setup!==200)throw Error('semeadura administrativa falhou: '+parent+'/'+child+' '+setup);
   for(const method of ['GET','PATCH','DELETE']) out.push({parent,child,method,
    status:await req(method,parent+'/'+child,'owner')});
  }
 }
 console.log('__JSON__'+JSON.stringify(out));
})().catch(e=>{console.error(e);process.exitCode=1});
`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-receipt-rules-'));
const config = path.join(tmp, 'firebase.json');
const script = path.join(tmp, 'driver.js');
fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(ROOT, 'firestore.rules') },
  emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true } }));
fs.writeFileSync(script, driver);
const out = rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,
  'node '+JSON.stringify(script)], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore','pipe','pipe'],
  env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
const match = /__JSON__(\[[^\n]*\])/.exec(out);
assert(match, 'driver não devolveu resultado: '+out.slice(-700));
const results = JSON.parse(match[1]);
for(const row of results) assert.equal(row.status,403,JSON.stringify(row));
console.log('✓ recibos e controle regional inacessíveis a clientes em produção e sandbox');
