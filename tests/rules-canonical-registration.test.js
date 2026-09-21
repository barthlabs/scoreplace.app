'use strict';
const { rodarNoEmulador } = require('./emulador'); const fs = require('fs'); const os = require('os'); const path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8106, PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}',H='http://127.0.0.1:${PORT}',b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const base=H+'/v1/projects/'+P+'/databases/(default)/documents/';const S=v=>({stringValue:v});
async function req(method,p,uid,body){const r=await fetch(base+p,{method,headers:{Authorization:uid==='owner'?'Bearer owner':'Bearer '+tok(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.status;}
(async()=>{const uid='uid_atleta';await req('PATCH','tournaments/t1','owner',{fields:{creatorUid:S('uid_org'),name:S('Torneio')}});const out={};
out.directCreate=await req('PATCH','tournaments/t1/registrations/uid_atleta__skill-b',uid,{fields:{participantUid:S(uid),categoryId:S('skill-b')}});
out.directUpdate=await req('PATCH','tournaments/t1/registrations/uid_atleta__skill-b',uid,{fields:{participantUid:S(uid),categoryId:S('skill-b')}});
console.log('__JSON__'+JSON.stringify(out));})();`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-canonical-registration-')),config=path.join(dir,'firebase.json'),driver=path.join(dir,'driver.js');
fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(ROOT,'firestore.rules')},emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));fs.writeFileSync(driver,DRIVER);
const output=rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,'node '+JSON.stringify(driver)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});
const match=/__JSON__(\{.*\})/.exec(output);if(!match)throw new Error('driver sem resultado: '+output.slice(-800));const out=JSON.parse(match[1]);let fail=0;const ok=(value,message)=>{console.log((value?'✓ ':'✗ ')+message);if(!value)fail++;};
ok(out.directCreate===403,'Rules negam criação direta de registro canônico');
ok(out.directUpdate===403,'Rules negam atualização direta de registro canônico');
process.exit(fail?1:0);
