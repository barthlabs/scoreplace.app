'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');
const ROOT = path.join(__dirname, '..');
const PROJECT = 'demo-scoreplace';
const PORT = 8232;
const DRIVER = `
const P='${PROJECT}',H='http://127.0.0.1:${PORT}';
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const tok=u=>b({alg:'none',typ:'JWT'})+'.'+b({iss:'https://securetoken.google.com/'+P,aud:P,sub:u,user_id:u,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,firebase:{identities:{},sign_in_provider:'google.com'}})+'.';
const S=v=>({stringValue:v}),I=v=>({integerValue:String(v)}),M=v=>({mapValue:{fields:v}}),A=v=>({arrayValue:{values:v}});
const p='tournaments/tour_1790000000000_0123456789abcdef0123456789abcdef';
const url=H+'/v1/projects/'+P+'/databases/(default)/documents/'+p;
async function req(uid,fields,mask){const r=await fetch(url+(mask?'?updateMask.fieldPaths='+mask:''),{method:'PATCH',headers:{Authorization:uid==='root'?'Bearer owner':'Bearer '+tok(uid),'Content-Type':'application/json'},body:JSON.stringify({fields})});return r.status;}
(async()=>{
  const uid='camis_owner';
  const initial={creatorUid:S(uid),name:S('CAMIS'),status:S('active'),
    scheduleWindow:M({interleavedPlan:M({schema:I(1)})}),
    matches:A([M({id:S('jogo-1'),scheduledGameNumber:I(1)})])};
  const setup=await req('root',initial);
  const out={setup};
  out.name=await req(uid,{name:S('CAMIS novo')},'name');
  out.classification=await req(uid,{classification:M({updated:I(1)})},'classification');
  out.matches=await req(uid,{matches:A([M({id:S('jogo-2'),scheduledGameNumber:I(1)})])},'matches');
  out.plan=await req(uid,{scheduleWindow:M({})},'scheduleWindow');
  out.phases=await req(uid,{phases:A([M({name:S('Fase alterada')})])},'phases');
  out.fmt2=await req(uid,{fmt2:M({tieSinglesPoints:I(7)})},'fmt2');
  out.tiebreakers=await req(uid,{tiebreakers:A([S('sorteio')])},'tiebreakers');
  out.marker=await req(uid,{phaseCategoryMaterialized:M({'Fem Diamante':I(1)})},'phaseCategoryMaterialized');
  console.log('__JSON__'+JSON.stringify(out));
})().catch(e=>{console.error(e.stack);process.exit(1)});
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-rules-interleaved-'));
const config = path.join(dir, 'firebase.json');
const driver = path.join(dir, 'driver.js');
try {
  fs.writeFileSync(config, JSON.stringify({ firestore:{ rules:path.join(ROOT,'firestore.rules') },
    emulators:{ firestore:{ port:PORT }, ui:{ enabled:false }, singleProjectMode:true } }));
  fs.writeFileSync(driver, DRIVER);
  const output = rodarNoEmulador(['emulators:exec','--only','firestore','--config',config,
    '--project',PROJECT,'node '+JSON.stringify(driver)], { cwd:ROOT, encoding:'utf8',
    stdio:['ignore','pipe','pipe'], env:{ ...process.env,
      PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH } });
  const match = /__JSON__(\{.*\})/.exec(output);
  if (!match) throw Error('Driver não devolveu resultado: ' + output.slice(-1000));
  const got = JSON.parse(match[1]);
  const expected = { setup:200, name:200, classification:200, matches:403, plan:403,
    phases:403, fmt2:403, tiebreakers:403, marker:403 };
  for (const [key,status] of Object.entries(expected)) {
    if (got[key] !== status) throw Error(key + ': esperado ' + status + ', veio ' + got[key]);
  }
  console.log('✓ grade intercalada: edição comum passa; jogos, fases, formato, desempate, plano e marcador são exclusivos do servidor');
} finally { fs.rmSync(dir, { recursive:true, force:true }); }
