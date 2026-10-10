'use strict';
/*
 * A coleção de identidade não é perfil. Mesmo a própria conta não pode ler,
 * alterar ou forjar estado/canonicalUid: o único resumo sai da Callable.
 *
 * Rodado por: npm run test:rules
 */
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ROOT = path.join(__dirname, '..');
const PORT = 8117;
const PROJECT = 'demo-scoreplace';

const DRIVER = `
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const tok = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time:Math.floor(Date.now()/1000), iat:Math.floor(Date.now()/1000), exp:Math.floor(Date.now()/1000)+3600,
  email:uid+'@x.com', firebase:{identities:{},sign_in_provider:'google.com'}
}) + '.';
const url = p => H + '/v1/projects/' + P + '/databases/(default)/documents/' + p;
async function req(method, p, uid, body) {
  const r = await fetch(url(p), { method, headers:{Authorization:'Bearer '+tok(uid),'Content-Type':'application/json'}, body:body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue:v });
(async () => {
  const uid = 'uid_atacante';
  const payload = { fields:{ state:S('verified'), canonicalUid:S('uid_vitima') } };
  const out = {
    leProprioEstado: await req('GET', 'accountIdentity/'+uid, uid),
    forjaProprioEstado: await req('PATCH', 'accountIdentity/'+uid, uid, payload),
    leClaim: await req('GET', 'identityClaims/hash_opaco', uid),
    forjaClaim: await req('PATCH', 'identityClaims/hash_opaco', uid, payload),
    leVerificacao: await req('GET', 'identityVerifications/review_1', uid),
    forjaVerificacao: await req('PATCH', 'identityVerifications/review_1', uid, payload)
  };
  console.log('__JSON__'+JSON.stringify(out));
})();
`;

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spidentityrules-'));
  const cfg = path.join(tmp, 'firebase.json');
  const driver = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({ firestore:{ rules:path.join(ROOT, 'firestore.rules') }, emulators:{ firestore:{ port:PORT }, ui:{enabled:false}, singleProjectMode:true } }));
  fs.writeFileSync(driver, DRIVER);
  const out = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT, 'node ' + JSON.stringify(driver)], {
    cwd: ROOT, encoding:'utf8', stdio:['ignore', 'pipe', 'pipe'], env:Object.assign({}, process.env, { PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH })
  });
  const found = /__JSON__(\{.*\})/.exec(out);
  if (!found) throw new Error('driver não devolveu resultado:\n' + out.slice(-700));
  return JSON.parse(found[1]);
}

const out = run();
let pass = 0, fail = 0;
function ok(value, label) { if (value) { pass++; console.log('  ✓ ' + label); } else { fail++; console.error('  ✗ ' + label); } }
Object.entries(out).forEach(([key, status]) => ok(status === 403, '🔒 ' + key + ' negado ao cliente (got ' + status + ')'));
console.log(fail ? '❌ rules-identity-state-private: ' + fail + ' falharam, ' + pass + ' ok' : '✅ rules-identity-state-private: ' + pass + ' ok');
process.exit(fail ? 1 : 0);
