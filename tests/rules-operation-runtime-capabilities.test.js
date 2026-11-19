'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');
const PORT = 8198;
const PROJECT = 'demo-scoreplace';
const driver = `
const base='http://127.0.0.1:${PORT}/v1/projects/${PROJECT}/databases/(default)/documents/';
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const auth=uid=>b64({alg:'none',typ:'JWT'})+'.'+b64({iss:'https://securetoken.google.com/${PROJECT}',aud:'${PROJECT}',sub:uid,user_id:uid,
 auth_time:Math.floor(Date.now()/1000),iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
 firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
async function req(method,uid){const headers={'Content-Type':'application/json'};if(uid)headers.Authorization=uid==='admin'?'Bearer owner':'Bearer '+auth(uid);
 return fetch(base+'operationRuntimeCapabilities/endMatchOnCourt',{method,headers,
 body:method==='PATCH'?JSON.stringify({fields:{ready:{booleanValue:true}}}):undefined});}
(async()=>{const setup=await req('PATCH','admin');if(setup.status!==200)throw Error('seed '+setup.status);
 const out=[];for(const uid of [null,'owner']){const r=await req('GET',uid);out.push(r.status);}
 const write=await req('PATCH','owner');out.push(write.status);console.log('__JSON__'+JSON.stringify(out));})().catch(e=>{console.error(e);process.exitCode=1});
`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-capability-rules-'));
const config = path.join(tmp, 'firebase.json'); const script = path.join(tmp, 'driver.js');
fs.writeFileSync(config, JSON.stringify({ firestore:{ rules:path.join(ROOT, 'firestore.rules') },
  emulators:{ firestore:{ port:PORT }, ui:{ enabled:false }, singleProjectMode:true } }));
fs.writeFileSync(script, driver);
const output = rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,'node '+JSON.stringify(script)],
  { cwd:ROOT, encoding:'utf8', stdio:['ignore','pipe','pipe'], env:Object.assign({},process.env,
    { PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH }) });
const result = /__JSON__(\[[^\n]*\])/.exec(output);
assert(result, 'driver sem retorno: '+output.slice(-800));
assert.deepEqual(JSON.parse(result[1]), [403,200,403], 'recibo exige autenticação e nega escrita client-side');
console.log('✓ readiness legível por usuário autenticado e somente server-side');
