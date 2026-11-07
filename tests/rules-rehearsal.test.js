'use strict';
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = 8221, PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}',H='http://127.0.0.1:${PORT}',b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const S=v=>({stringValue:v}),B=v=>({booleanValue:v}),M=v=>({mapValue:{fields:v}});
const base=H+'/v1/projects/'+P+'/databases/(default)/documents/';
async function req(method,p,uid,body){const r=await fetch(base+p,{method,headers:{Authorization:uid==='root'?'Bearer owner':'Bearer '+tok(uid),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.status;}
(async()=>{const p='tournaments/tour_1790000000000_0123456789abcdef0123456789abcdef',uid='dev';const out={};
await req('PATCH',p,'root',{fields:{creatorUid:S(uid),name:S('Antes'),status:S('open'),isPublic:B(false),organizerOnly:B(true),notificationsMuted:B(true),rehearsal:M({state:S('active'),epoch:S('e'),hash:S('h')})}});
out.name=await req('PATCH',p+'?updateMask.fieldPaths=name',uid,{fields:{name:S('Durante')}});
out.unmute=await req('PATCH',p+'?updateMask.fieldPaths=notificationsMuted',uid,{fields:{notificationsMuted:B(false)}});
out.public=await req('PATCH',p+'?updateMask.fieldPaths=isPublic',uid,{fields:{isPublic:B(true)}});
out.marker=await req('PATCH',p+'?updateMask.fieldPaths=rehearsal',uid,{fields:{rehearsal:M({state:S('')})}});
await req('PATCH',p+'?updateMask.fieldPaths=rehearsal','root',{fields:{rehearsal:M({state:S('resetting'),epoch:S('e'),hash:S('h')})}});
out.resetting=await req('PATCH',p+'?updateMask.fieldPaths=name',uid,{fields:{name:S('Atrasado')}});
await req('PATCH',p+'?updateMask.fieldPaths=rehearsal','root',{fields:{rehearsal:M({state:S('capturing'),epoch:S('e'),hash:S('h')})}});
out.capturing=await req('PATCH',p+'?updateMask.fieldPaths=notificationsMuted',uid,{fields:{notificationsMuted:B(false)}});
// Completed restore replaces the root with the original snapshot, without a
// rehearsal marker. The organizer regains ordinary editing rights.
await req('PATCH',p+'?updateMask.fieldPaths=rehearsal','root',{fields:{}});
out.restored=await req('PATCH',p+'?updateMask.fieldPaths=notificationsMuted',uid,{fields:{notificationsMuted:B(false)}});
out.baseline=await req('GET','tournamentRehearsalBaselines/test',uid);
console.log('__JSON__'+JSON.stringify(out));})();`;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sp-rehearsal-rules-'));
const config=path.join(dir,'firebase.json'),driver=path.join(dir,'driver.js');
fs.writeFileSync(config,JSON.stringify({firestore:{rules:path.join(ROOT,'firestore.rules')},emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));
fs.writeFileSync(driver,DRIVER);
const output=rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,'--project',PROJECT,'node '+JSON.stringify(driver)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH}});
fs.rmSync(dir,{recursive:true,force:true});
const match=/__JSON__(\{.*\})/.exec(output);if(!match)throw new Error('driver sem resultado: '+output.slice(-1200));
const got=JSON.parse(match[1]);
const expected={name:200,unmute:403,public:403,marker:403,resetting:403,capturing:403,restored:200,baseline:403};
for(const [key,value] of Object.entries(expected)) if(got[key]!==value) throw new Error(key+': esperado '+value+', veio '+got[key]);
console.log('✓ ensaio: jogo normal permitido; privacidade, silêncio, marcador e restauração protegidos');
