'use strict';
/* Testa functions/merge-rules.js — pickSurvivorProfiles, a decisão do AUTO-MERGE.
 * Rodar:  node functions/test-merge-winner.js
 *
 * TRAVA DE REGRESSÃO (incidente REAL, 02/ago/2026 — merge das duas "Gabriela Ferreira",
 * ver memória project_automerge_trigger_footgun): _determineMergeWinner decidia idade SÓ
 * pelo `createdAt` do doc de perfil, com a regra "ausente perde pra quem tem idade
 * conhecida". A conta de JUNHO não tinha createdAt no Firestore, a de JULHO tinha —
 * a de julho VENCEU e o _repairTournaments reescreveu torneios na direção errada.
 * Sendo que o Firebase Auth SEMPRE sabe a idade da conta (metadata.creationTime).
 *
 * A regra nova: Auth é a verdade quando o UserRecord está disponível (idade E federação
 * — mesmo critério do pickSurvivor, os dois pontos de decisão têm que concordar);
 * os campos do doc (createdAt/authProvider) são só fallback pra Auth já apagado. */
const M = require('./merge-rules');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }

const pick = (a, b) => M.pickSurvivorProfiles(a, b);

// ── O CASO REAL: perfil antigo SEM createdAt vs novo COM createdAt ───────────
// Junho: Google via e-mail+senha (authProvider 'password' — não federada) e doc sem
// createdAt. Julho: conta celular, doc com createdAt. Nenhuma federada → decide idade.
const junho = {
  data: { displayName: 'Gabriela Ferreira', email: 'gabi@gmail.com', authProvider: 'password' },
  authUser: { metadata: { creationTime: '2026-06-10T14:00:00Z' }, providerData: [{ providerId: 'password' }] },
};
const julho = {
  data: { displayName: 'Gabriela Ferreira', phone: '+5511999990000', authProvider: 'phone',
          createdAt: '2026-07-22T10:00:00Z' },
  authUser: { metadata: { creationTime: '2026-07-22T10:00:00Z' }, providerData: [{ providerId: 'phone' }] },
};

// Réplica da regra ANTIGA (doc-only), pra provar que ela escolhia ERRADO:
function escolheAntiga(a, b) {
  const ts = d => { const c = d.createdAt; return c == null ? null : (c.toMillis ? c.toMillis() : Number(c)); };
  const ta = ts(a.data), tb = ts(b.data);
  if (ta != null && tb != null && ta !== tb) return ta < tb ? 'a' : 'b';
  if (ta != null && tb == null) return 'a';
  if (tb != null && ta == null) return 'b';
  return 'a';
}
ok('ANTIGA: a conta de JULHO vencia a de JUNHO (o bug do incidente virado teste)',
  escolheAntiga(junho, julho) === 'b');
ok('NOVA: a conta de JUNHO vence — a idade sai do Auth, não do doc',
  pick(junho, julho).keep === 'a');
ok('NOVA: critério registrado é idade ("older")', pick(junho, julho).reason === 'older');
ok('NOVA: direção-agnóstica — a ordem dos argumentos não muda o vencedor',
  pick(julho, junho).keep === 'b');

// ── Auth vence doc MENTINDO: createdAt backfillado depois da conta nascer ────
// pickSurvivor (merge explícito) decide por metadata.creationTime; se o auto-merge
// decidisse pelo createdAt do doc, os dois pontos escolheriam sobreviventes DIFERENTES.
const docMentindo = {
  data: { authProvider: 'password', createdAt: '2026-07-30T00:00:00Z' }, // backfill tardio
  authUser: { metadata: { creationTime: '2026-06-01T00:00:00Z' }, providerData: [{ providerId: 'password' }] },
};
const outraNova = {
  data: { authProvider: 'phone', createdAt: '2026-07-01T00:00:00Z' },
  authUser: { metadata: { creationTime: '2026-07-01T00:00:00Z' }, providerData: [{ providerId: 'phone' }] },
};
ok('Auth disponível → creationTime REAL vence createdAt backfillado do doc',
  pick(docMentindo, outraNova).keep === 'a');

// ── Federação pelo providerData REAL quando o Auth está disponível ───────────
// CASO REAL, medido em produção 04/ago/2026 (184 contas no Auth): Maria Helena Lauria tem
// `authProvider:'password'` no doc mas `google.com,password` no Auth. O doc NÃO é atualizado
// quando a pessoa vincula um federado — o próprio auth.js diz, no _profileLinkProvider:
// "authProvider do perfil é só rótulo de ORIGEM; o vínculo real está no Auth".
// Ler o doc (regra velha) classificaria a conta dela como NÃO-federada → num merge ela
// poderia ser apagada, matando o login Google que ela usa. Com o botão "🔑 Formas de entrar"
// (v1.6.95) esse estado tende a se multiplicar. Ver [[project_federated_provider_linking]].
const docStale = {
  data: { authProvider: 'password' }, // doc desatualizado (o vínculo veio depois)
  authUser: { metadata: { creationTime: '2026-07-01T00:00:00Z' },
              providerData: [{ providerId: 'google.com' }, { providerId: 'password' }] },
};
const phoneVelha = {
  data: { authProvider: 'phone', createdAt: '2026-01-01T00:00:00Z' },
  authUser: { metadata: { creationTime: '2026-01-01T00:00:00Z' }, providerData: [{ providerId: 'phone' }] },
};
ok('doc diz password mas o Auth tem google.com → conta é FEDERADA e vence a mais antiga',
  pick(docStale, phoneVelha).keep === 'a' && pick(docStale, phoneVelha).reason === 'federated');

// ── e-mail+senha com endereço @gmail.com NÃO é federada (comportamento PRETENDIDO) ──
// A regra "federada vence" existe porque provedor federado não se transfere entre uids.
// Credencial e-mail/senha SE MOVE (admin.auth().updateUser) — não há login a proteger,
// então vale a regra da mais antiga. Confirmado contra a razão da regra do dono (v1.2.6).
const senhaGmailVelha = {
  data: { email: 'pessoa@gmail.com', authProvider: 'password' },
  authUser: { metadata: { creationTime: '2026-02-01T00:00:00Z' }, providerData: [{ providerId: 'password' }] },
};
const googleNova = {
  data: { email: 'pessoa@gmail.com', authProvider: 'google.com' },
  authUser: { metadata: { creationTime: '2026-06-01T00:00:00Z' }, providerData: [{ providerId: 'google.com' }] },
};
ok('e-mail+senha @gmail.com não conta como federada → o Google REAL (mais novo) vence',
  pick(senhaGmailVelha, googleNova).keep === 'b' && pick(senhaGmailVelha, googleNova).reason === 'federated');

// ── Fallback: Auth já apagado (getUser falhou → authUser null) ───────────────
const semAuthComCreatedAt = { data: { authProvider: 'phone', createdAt: '2026-03-01T00:00:00Z' }, authUser: null };
const semAuthMaisNova     = { data: { authProvider: 'phone', createdAt: '2026-05-01T00:00:00Z' }, authUser: null };
ok('sem Auth dos dois lados → decide pelo createdAt do doc (fallback preservado)',
  pick(semAuthComCreatedAt, semAuthMaisNova).keep === 'a');
ok('sem Auth: authProvider do doc ainda decide federação',
  pick({ data: { authProvider: 'google.com' }, authUser: null }, semAuthComCreatedAt).keep === 'a');

// createdAt em formatos variados (Timestamp-like, número, string ISO)
const tsLike = { data: { createdAt: { toMillis: () => Date.parse('2026-01-15T00:00:00Z') } }, authUser: null };
const numMs  = { data: { createdAt: Date.parse('2026-04-01T00:00:00Z') }, authUser: null };
ok('createdAt Timestamp-like (toMillis) é lido', pick(tsLike, numMs).keep === 'a');
ok('createdAt string ISO é lido (Number(ISO) era NaN na regra antiga)',
  M.accountAgeMs({ createdAt: '2026-03-01T00:00:00Z' }, null) === Date.parse('2026-03-01T00:00:00Z'));

// ── Sem idade em lado NENHUM → perfil mais completo desempata ────────────────
const completo = { data: { displayName: 'Fulana de Tal', email: 'f@x.com', city: 'SP', gender: 'feminino' }, authUser: null };
const vazio    = { data: { displayName: '+5511988887777' }, authUser: null };
ok('ambos sem idade → perfil mais completo vence (score)',
  pick(vazio, completo).keep === 'b' && pick(vazio, completo).reason === 'score');
ok('idade conhecida de UM lado só → quem tem idade vence (Auth ausente é conta meio morta)',
  pick(vazio, semAuthComCreatedAt).keep === 'b');

// ── Varredura de código: o index.js usa a regra do módulo, com await ─────────
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
ok('index.js: _determineMergeWinner é async e busca o Auth (getUser) antes de decidir',
  /async function _determineMergeWinner[\s\S]{0,400}admin\.auth\(\)\.getUser\(/.test(src));
ok('index.js: _determineMergeWinner delega pra pickSurvivorProfiles (regra num lugar só)',
  src.includes('_mergeRules.pickSurvivorProfiles('));
ok('index.js: _scanAndMergeByField AGUARDA a decisão (await) — senão keepDoc vira Promise',
  src.includes('(await _determineMergeWinner(keepDoc, docs[i])).keepDoc'));
ok('index.js: autoMergeOnProfileUpdate AGUARDA a decisão (await)',
  src.includes('await _determineMergeWinner(currentDoc, freshOther)'));
ok('index.js: a réplica local da regra saiu (sem _profileScore duplicado)',
  !/function _profileScore/.test(src));

// ── TRANSFERÊNCIA DO PROVEDOR FEDERADO (o outro lado do "nada se perde") ─────
// A regra "federada sempre vence" nasceu da ideia de que o provedor morre com a conta.
// Não morre: updateUser aceita `providerToLink` com o "sub" do provedor (providerData[].uid),
// lido antes do deleteUser. O que sobra do limite antigo é 1 instância por providerId.
(() => {
  const P = M.planProviderTransfer;
  // Caso Silvia (medido): keep é password+e-mail, drop tem apple.com → Apple viaja.
  const r1 = P([{ providerId: 'password', uid: 'x' }], [{ providerId: 'apple.com', uid: 'sub-apple' }]);
  ok('Apple do drop é transferido pro sobrevivente que não tem federado',
    r1.length === 1 && r1[0].providerId === 'apple.com' && r1[0].uid === 'sub-apple');
  ok('leva SÓ providerId+uid (passar email pode colidir e derrubar o link)',
    Object.keys(r1[0]).sort().join(',') === 'providerId,uid');

  // Caso Nelson/Eduardo (medido): os DOIS lados são google.com → não dá pra linkar.
  const r2 = P([{ providerId: 'google.com', uid: 'g1' }], [{ providerId: 'google.com', uid: 'g2' }]);
  ok('2 contas do MESMO provedor: nada a transferir (1 instância por providerId)', r2.length === 0);

  // Google + Apple no mesmo uid é suportado (existe em produção: Patrícia, Gersom).
  const r3 = P([{ providerId: 'google.com', uid: 'g1' }], [{ providerId: 'apple.com', uid: 'a1' }]);
  ok('google.com + apple.com convivem no mesmo uid → Apple viaja', r3.length === 1);

  // phone/password NÃO entram: quem move essas credenciais é o updateUser (email/phoneNumber).
  const r4 = P([], [{ providerId: 'phone', uid: 'p1' }, { providerId: 'password', uid: 'pw' }]);
  ok('phone/password ficam de fora (o Auth já os move por outro caminho)', r4.length === 0);

  // Conta mista: leva só o que falta.
  const r5 = P([{ providerId: 'google.com', uid: 'g' }],
               [{ providerId: 'google.com', uid: 'g2' }, { providerId: 'apple.com', uid: 'a' }, { providerId: 'phone', uid: 'p' }]);
  ok('conta mista: transfere só o federado que o keep ainda não tem',
    r5.length === 1 && r5[0].providerId === 'apple.com');

  // Entrada suja não derruba.
  ok('providerData ausente não quebra', P(null, null).length === 0);
  ok('entrada sem uid do provedor é ignorada (sem sub não dá pra linkar)',
    P([], [{ providerId: 'google.com' }]).length === 0);
  ok('não duplica o mesmo providerId vindo repetido do drop',
    P([], [{ providerId: 'google.com', uid: 'a' }, { providerId: 'google.com', uid: 'b' }]).length === 1);
})();

// ── Fiação da transferência no index.js ─────────────────────────────────────
(() => {
  const bloco = src.slice(src.indexOf('async function _mergeAccountsKeepOlder'), src.indexOf('async function _scanAndMergeByField'));
  ok('index.js: planeja a transferência ANTES do deleteUser (o sub some depois)',
    bloco.indexOf('planProviderTransfer') < bloco.indexOf('deleteUser(dropU.uid)'));
  ok('index.js: LINKA depois do deleteUser (o provedor precisa estar livre)',
    bloco.indexOf('providerToLink') > bloco.indexOf('deleteUser(dropU.uid)'));
  ok('index.js: um updateUser por provedor (a API aceita um providerToLink por chamada)',
    /for \(const _p of _fedToLink\)/.test(bloco));
  ok('index.js: falha ao linkar NÃO desfaz a fusão (best-effort com catch)',
    /providerToLink\(\$\{_p\.providerId\}\) falhou/.test(bloco));
})();

console.log(fail === 0
  ? '✅ test-merge-winner: ' + pass + ' ok, 0 falharam'
  : '❌ test-merge-winner: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
