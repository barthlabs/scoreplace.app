/* Um cliente com fotografia magra nunca pode diminuir o retrato fiel do sandbox.
 * A prova roda as Rules reais no emulador: o dono pode editar configuração, mas
 * não reduzir inscritos/jogos nem os marcadores que descrevem essas subcoleções. */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 8103;
const PROJECT = 'demo-scoreplace';
const OWNER = 'uid_dono_sandbox';
const DRIVER = `
const admin = require(process.env.SP_ADMIN);
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
admin.initializeApp({ projectId: P });
const db = admin.firestore();
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const token = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+3600,
  firebase:{identities:{},sign_in_provider:'google.com'}
}) + '.';
const url = H + '/v1/projects/' + P + '/databases/(default)/documents/sandboxes/sb1';
const I = n => ({ integerValue: String(n) });
const S = s => ({ stringValue: s });
const M = x => ({ mapValue: { fields: x } });
async function patch(fields, mask) {
  const r = await fetch(url + '?updateMask.fieldPaths=' + mask.map(encodeURIComponent).join('&updateMask.fieldPaths='), {
    method:'PATCH', headers:{Authorization:'Bearer '+token('${OWNER}'),'Content-Type':'application/json'},
    body:JSON.stringify({fields})
  });
  return r.status;
}
(async () => {
  await db.doc('sandboxes/sb1').set({ sandboxOwnerUid:'${OWNER}', sandboxOf:'original', isSandbox:true,
    sbState:'ready', name:'Sandbox', _nPartes:{participants:152,matches:115,opponentHistory:1}, _nJogos:115 });
  const out = {};
  out.configuracao = await patch({name:S('Nome novo')}, ['name']);
  out.apagaPartes = await patch({_nPartes:M({participants:I(0),matches:I(114),opponentHistory:I(0)}),_nJogos:I(114)}, ['_nPartes','_nJogos']);
  console.log('__JSON__'+JSON.stringify(out));
})().catch(e => { console.error(e.stack); process.exit(1); });
`;
function run(rules, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-sbpartes-'));
  const cfg = path.join(tmp, 'firebase.json'), drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({ firestore:{rules}, emulators:{firestore:{port:PORT},ui:{enabled:false},singleProjectMode:true} }));
  fs.writeFileSync(drv, DRIVER);
  let out;
  try {
    out = execFileSync('firebase', ['emulators:exec','--only','firestore','--config',cfg,'--project',PROJECT,'node '+JSON.stringify(drv)], {
      cwd: ROOT, encoding:'utf8', stdio:['ignore','pipe','pipe'],
      env: Object.assign({}, process.env, { SP_ADMIN:path.join(ROOT,'functions','node_modules','firebase-admin'), NO_UPDATE_NOTIFIER:'1', PATH:'/opt/homebrew/opt/openjdk/bin:'+process.env.PATH })
    });
  } catch (e) {
    /* firebase-tools às vezes devolve 2 depois de desligar o emulador, embora o
     * driver tenha terminado 0. O protocolo do teste é o marcador JSON: sem ele,
     * a exceção continua fatal; com ele, a operação já foi medida. */
    out = String(e.stdout || '');
  }
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error(label+' não devolveu resultado:\n'+out.slice(-1000));
  return JSON.parse(m[1]);
}
function oldRules() {
  const current = fs.readFileSync(path.join(ROOT,'firestore.rules'),'utf8');
  const old = current.replace(/\n\s*&& sbPartesNaoEncolhem\(\);/, ';');
  if (old === current) throw new Error('não achei a trava sbPartesNaoEncolhem para o controle');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(),'sp-sbpartes-old-')),'old.rules');
  fs.writeFileSync(file, old);
  return file;
}
let bad = 0;
function ok(v, text) { if (v) console.log('✓ '+text); else { bad++; console.error('✗ '+text); } }
const current = run(path.join(ROOT,'firestore.rules'),'regras atuais');
ok(current.configuracao === 200, 'o dono continua podendo editar configuração');
ok(current.apagaPartes === 403, '🔒 fotografia magra não reduz inscritos/jogos (got '+current.apagaPartes+')');
const previous = run(oldRules(),'controle sem a trava');
ok(previous.apagaPartes === 200, 'controle: sem a trava a perda passaria (got '+previous.apagaPartes+')');
console.log(bad ? '❌ '+bad+' falha(s)' : '✅ rules-sandbox-partes-intactas: OK');
process.exit(bad ? 1 : 0);
