/* ADMIN DE TORNEIO É SÓ UID — e-mail não decide mais permissão (jul/2026).
 *
 * REGRA DO DONO: "sempre apenas o uid (nunca nome, email, celular, nada. apenas o uid para
 * identificar os participantes e co-hosts)".
 *
 * O QUE SAIU do `isTournamentAdmin`:
 *   - `authEmail() in adminEmails`            (admin por e-mail denormalizado)
 *   - recovery `organizerEmail == authEmail()` (quando adminEmails estava vazio)
 * E do `allow create` saiu o caminho `creatorEmail == authEmail()`, que além de identidade
 * por atributo mutável permitia CRIAR torneio declarando o `creatorUid` de OUTRA pessoa.
 *
 * POR QUE ISTO PRECISOU DE MIGRAÇÃO ANTES (e por que este teste existe):
 * a varredura dos 8 torneios de produção (29/jul/2026) achou **3 que eram admin SÓ por
 * e-mail** (`adminUids: []`, `adminEmails: ["…@gmail.com"]`). Remover o caminho sem
 * backfillar `adminUids` teria TRANCADO 2 organizadores fora dos próprios torneios. O
 * backfill (= creatorUid + co-hosts ATIVOS por uid) foi aplicado; 8/8 convergidos.
 * O caso `adminSoPorEmail` abaixo é exatamente esse cenário — ele DEVE dar 403 agora, e
 * DEVE dar 200 nas rules antigas (senão o teste não provaria a mudança).
 *
 * Rodado por: npm run test:rules
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const PORT = 8098;
const PROJECT = 'demo-scoreplace';

const DRIVER = `
const P = '${PROJECT}', H = 'http://127.0.0.1:${PORT}';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
// O e-mail do token é derivado do uid: uid_dono → uid_dono@x.com
const tok = uid => b64({alg:'none',typ:'JWT'}) + '.' + b64({
  iss:'https://securetoken.google.com/'+P, aud:P, sub:uid, user_id:uid,
  auth_time: Math.floor(Date.now()/1000), iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000)+3600, email:uid+'@x.com', email_verified:true,
  firebase:{ identities:{}, sign_in_provider:'google.com' }
}) + '.';
const url = p => H + '/v1/projects/' + P + '/databases/(default)/documents/' + p;
async function req(method, p, uid, body) {
  const r = await fetch(url(p), { method,
    headers: { 'Authorization': 'Bearer ' + tok(uid), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  return r.status;
}
const S = v => ({ stringValue: v });
const ARR = vs => ({ arrayValue: { values: vs.map(S) } });

(async () => {
  const out = {};
  const DONO = 'uid_dono', COHOST = 'uid_cohost', ZE = 'uid_ze', EMAILONLY = 'uid_emailonly';

  // ── Torneio NORMAL: dono por creatorUid, co-host ativo em adminUids ──────────
  // Criado pelo próprio dono (único caminho de create que resta).
  out.criaTorneio = await req('PATCH', 'tournaments/t1', DONO, { fields: {
    name: S('Confra'), creatorUid: S(DONO),
    adminUids: ARR([DONO, COHOST]),
    adminEmails: ARR([DONO + '@x.com']),
    memberUids: ARR([DONO, COHOST, ZE, EMAILONLY])
  }});
  out.donoEdita   = await req('PATCH', 'tournaments/t1?updateMask.fieldPaths=name', DONO,   { fields: { name: S('Confra 2') } });
  out.cohostEdita = await req('PATCH', 'tournaments/t1?updateMask.fieldPaths=name', COHOST, { fields: { name: S('Confra 3') } });
  out.zeEdita     = await req('PATCH', 'tournaments/t1?updateMask.fieldPaths=name', ZE,     { fields: { name: S('Confra do Ze') } });

  // ── O CASO DA MIGRAÇÃO: admin SÓ por e-mail (adminUids vazio) ───────────────
  // Espelha os 3 torneios reais achados em produção antes do backfill.
  out.criaLegado = await req('PATCH', 'tournaments/t2', DONO, { fields: {
    name: S('Legado'), creatorUid: S(DONO),
    adminUids: { arrayValue: { values: [] } },
    adminEmails: ARR([EMAILONLY + '@x.com']),
    organizerEmail: S(EMAILONLY + '@x.com'),
    memberUids: ARR([DONO, EMAILONLY])
  }});
  out.adminSoPorEmail = await req('PATCH', 'tournaments/t2?updateMask.fieldPaths=name', EMAILONLY,
    { fields: { name: S('mudei por email') } });

  // ── Recovery por organizerEmail com adminEmails VAZIO (2º caminho removido) ──
  out.criaRecovery = await req('PATCH', 'tournaments/t3', DONO, { fields: {
    name: S('Recovery'), creatorUid: S(DONO),
    adminEmails: { arrayValue: { values: [] } },
    organizerEmail: S(EMAILONLY + '@x.com'),
    memberUids: ARR([DONO, EMAILONLY])
  }});
  out.recoveryPorOrganizerEmail = await req('PATCH', 'tournaments/t3?updateMask.fieldPaths=name', EMAILONLY,
    { fields: { name: S('mudei pela recovery') } });

  // ── CREATE: forjar doc atribuído a OUTRA pessoa ────────────────────────────
  // Antes passava: bastava creatorEmail ser o SEU, mesmo com creatorUid alheio.
  out.forjaCreate = await req('PATCH', 'tournaments/t4', ZE, { fields: {
    name: S('Forjado'), creatorUid: S(DONO), creatorEmail: S(ZE + '@x.com'), memberUids: ARR([DONO])
  }});
  // Create legítimo (uid próprio) continua passando.
  out.createLegitimo = await req('PATCH', 'tournaments/t5', ZE, { fields: {
    name: S('Meu'), creatorUid: S(ZE), memberUids: ARR([ZE])
  }});

  console.log('__JSON__' + JSON.stringify(out));
  process.exit(0);
})();
`;

function runAgainst(rulesFile, label) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spcohost-'));
  const cfg = path.join(tmp, 'firebase.json');
  const drv = path.join(tmp, 'driver.js');
  fs.writeFileSync(cfg, JSON.stringify({
    firestore: { rules: rulesFile },
    emulators: { firestore: { port: PORT }, ui: { enabled: false }, singleProjectMode: true },
  }));
  fs.writeFileSync(drv, DRIVER);
  const out = execFileSync('firebase', [
    'emulators:exec', '--only', 'firestore', '--config', cfg, '--project', PROJECT,
    'node ' + JSON.stringify(drv),
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }),
  });
  const m = /__JSON__(\{.*\})/.exec(out);
  if (!m) throw new Error('driver não devolveu resultado (' + label + '):\n' + out.slice(-600));
  return JSON.parse(m[1]);
}

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── 1. RULES ATUAIS ──────────────────────────────────────────────────────────
const novo = runAgainst(path.join(ROOT, 'firestore.rules'), 'atual');

ok(novo.criaTorneio === 200, 'setup: dono cria torneio com o próprio uid (got ' + novo.criaTorneio + ')');
ok(novo.donoEdita === 200, 'legítimo: dono (creatorUid) edita (got ' + novo.donoEdita + ')');
ok(novo.cohostEdita === 200, 'legítimo: co-host em adminUids edita (got ' + novo.cohostEdita + ')');
ok(novo.zeEdita === 403, 'controle: participante comum NÃO edita nome (got ' + novo.zeEdita + ')');

ok(novo.adminSoPorEmail === 403,
  '🔒 SÓ-UID: admin apenas por adminEmails é NEGADO (got ' + novo.adminSoPorEmail + ')');
ok(novo.recoveryPorOrganizerEmail === 403,
  '🔒 SÓ-UID: recovery por organizerEmail é NEGADA (got ' + novo.recoveryPorOrganizerEmail + ')');
ok(novo.forjaCreate === 403,
  '🔒 CREATE: forjar torneio com creatorUid de OUTRO é negado (got ' + novo.forjaCreate + ')');
ok(novo.createLegitimo === 200,
  'legítimo: criar torneio com o próprio uid funciona (got ' + novo.createLegitimo + ')');

// ── 2. RULES ANTIGAS: os caminhos por e-mail PASSAVAM ────────────────────────
// Sem isto o teste não prova nada — se passasse nos dois, não estaria testando a mudança.
const antigas = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function authEmail() {
      return request.auth != null && request.auth.token.email != null
        ? request.auth.token.email.lower() : '';
    }
    function isTournamentAdminOld(data) {
      return request.auth != null && (
        (data.creatorUid is string && data.creatorUid == request.auth.uid)
        || (data.adminUids is list && data.adminUids.size() > 0 && request.auth.uid in data.adminUids)
        || (authEmail() != '' && data.adminEmails is list
            && data.adminEmails.size() > 0 && authEmail() in data.adminEmails)
        || (authEmail() != '' && !(data.adminEmails is list && data.adminEmails.size() > 0)
            && data.organizerEmail is string && data.organizerEmail.lower() == authEmail())
      );
    }
    match /tournaments/{tid} {
      allow read: if true;
      allow create: if request.auth != null
        && ((request.resource.data.creatorUid is string
             && request.resource.data.creatorUid == request.auth.uid)
            || (authEmail() != '' && request.resource.data.creatorEmail is string
             && request.resource.data.creatorEmail.lower() == authEmail()));
      allow update: if isTournamentAdminOld(resource.data);
    }
  }
}`;
const tmpOld = path.join(os.tmpdir(), 'sp-cohost-antigas.rules');
fs.writeFileSync(tmpOld, antigas);
const velho = runAgainst(tmpOld, 'antigas');

ok(velho.adminSoPorEmail === 200,
  '⚠️  REGRESSÃO-GUARD: nas ANTIGAS o admin só-por-e-mail PASSAVA (got ' + velho.adminSoPorEmail + ')');
ok(velho.recoveryPorOrganizerEmail === 200,
  '⚠️  nas ANTIGAS a recovery por organizerEmail PASSAVA (got ' + velho.recoveryPorOrganizerEmail + ')');
ok(velho.forjaCreate === 200,
  '⚠️  nas ANTIGAS dava pra forjar torneio com creatorUid alheio (got ' + velho.forjaCreate + ')');

console.log(fail === 0
  ? '✅ rules-cohost-uid-only: ' + pass + ' ok, 0 falharam'
  : '❌ rules-cohost-uid-only: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
