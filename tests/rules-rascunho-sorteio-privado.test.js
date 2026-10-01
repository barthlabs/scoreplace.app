/* O COFRE DO SORTEIO EM REVISÃO — node tests/rules-rascunho-sorteio-privado.test.js
 *
 * Times, confrontos e agenda antes de publicar NÃO podem vazar pelo documento do
 * torneio. Este teste dirige as rules reais e também uma regra aberta de controle:
 * assim, 403 prova a porta fechada, não um caminho errado no driver.
 */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.join(__dirname, '..'), PORT = 8111, PROJECT = 'demo-scoreplace';
const DRIVER = `
const P='${PROJECT}',H='http://127.0.0.1:${PORT}';
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const url=p=>H+'/v1/projects/'+P+'/databases/(default)/documents/'+p;
async function req(m,p,u,body){const h={'Content-Type':'application/json'};if(u)h.Authorization='Bearer '+tok(u);const r=await fetch(url(p),{method:m,headers:h,body:body?JSON.stringify(body):undefined});return r.status;}
const body={fields:{draft:{mapValue:{fields:{teams:{stringValue:'segredo'}}}}}};
(async()=>{const p='tournaments/T1/privateDraws/initial',o={};o.participantRead=await req('GET',p,'player');o.organizerRead=await req('GET',p,'organizer');o.participantWrite=await req('PATCH',p,'player',body);o.anonRead=await req('GET',p,null);o.list=await req('GET','tournaments/T1/privateDraws','player');console.log('__JSON__'+JSON.stringify(o));})();
`;
function run(rules,label){const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spdrawcofre-')),cfg=path.join(tmp,'firebase.json'),drv=path.join(tmp,'driver.js');fs.writeFileSync(cfg,JSON.stringify({firestore:{rules},emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true}}));fs.writeFileSync(drv,DRIVER);const out=rodarNoEmulador(['emulators:exec','--only','firestore','--config',cfg,'--project',PROJECT,'node '+JSON.stringify(drv)],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:Object.assign({},process.env,{PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH})});const m=/__JSON__(\{.*\})/.exec(out);if(!m)throw new Error('driver sem resultado '+label+'\n'+out.slice(-700));return JSON.parse(m[1]);}
let fail=0;const ok=(v,s)=>{console.log((v?'✓ ':'✗ ')+s);if(!v)fail++;};
const atual=run(path.join(ROOT,'firestore.rules'),'atual');
ok(atual.participantRead===403,'participante não lê o rascunho privado');
ok(atual.organizerRead===403,'nem organizador lê o cofre diretamente; só a Function pode entregar');
ok(atual.participantWrite===403,'participante não escreve no cofre');
ok(atual.anonRead===403,'anônimo não lê o cofre');
ok(atual.list===403,'listagem do cofre também é negada');
const aberto=path.join(os.tmpdir(),'spdrawcofre-open-'+Date.now()+'.rules');
fs.writeFileSync(aberto,"rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /tournaments/{id}/privateDraws/{draw} { allow read, write: if request.auth != null; } match /{document=**} { allow read, write: if false; } } }");
const controle=run(aberto,'aberto');
ok(controle.participantRead===404,'controle aberto alcança o caminho (doc ainda ausente)');
ok(controle.participantWrite===200,'controle aberto permite escrever: driver exercita o cofre');
process.exit(fail?1:0);
