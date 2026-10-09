'use strict';

/* O marcador canônico troca a autoridade do elenco para `registrations`.
 * Este é um teste de Rules REAL no emulador: uma sessão de organizador não
 * consegue alterar o campo legado no pai e tampouco criar o antigo espelho
 * `participants/{uid}`. A Function usa Admin SDK, portanto não depende desta
 * permissão do navegador. */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8117, PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}',H='http://127.0.0.1:${PORT}',b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const base=H+'/v1/projects/'+P+'/databases/(default)/documents/',S=v=>({stringValue:v}),arr=xs=>({arrayValue:{values:xs}}),map=o=>({mapValue:{fields:o}});
async function req(method,p,uid,body){const r=await fetch(base+p,{method,headers:{Authorization:'Bearer '+tok(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.status;}
(async()=>{const out={};
  await req('PATCH','tournaments/t1','org',{fields:{creatorUid:S('org'),name:S('T'),participants:arr([]),memberUids:arr([S('org')]),canonicalRegistrationMigration:map({fingerprint:S('fp-1')})}});
  out.parentParticipants=await req('PATCH','tournaments/t1?updateMask.fieldPaths=participants','org',{fields:{participants:arr([map({uid:S('other')})])}});
  out.mirrorParticipant=await req('PATCH','tournaments/t1/participants/other','org',{fields:{uid:S('other')}});
  console.log('__JSON__'+JSON.stringify(out));
})();`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-canonical-roster-rules-')), config=path.join(dir,'firebase.json'), driver=path.join(dir,'driver.js');
fs.writeFileSync(config, JSON.stringify({firestore:{rules:path.join(ROOT,'firestore.rules')},emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));
fs.writeFileSync(driver, DRIVER);
const output=rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,'node '+JSON.stringify(driver)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});
const match=/__JSON__(\{.*\})/.exec(output); if(!match) throw new Error('driver sem resultado: '+output.slice(-800));
const out=JSON.parse(match[1]); let fail=0; const ok=(value,message)=>{console.log((value?'✓ ':'✗ ')+message);if(!value)fail++;};
ok(out.parentParticipants===403,'Rules negam alteração de participants após marcador canônico');
ok(out.mirrorParticipant===403,'Rules negam escrita no espelho participants/{uid} após marcador canônico');
process.exit(fail?1:0);
