/* MERGE: a conta FEDERADA (Google/Apple) sempre vence. Entre duas federadas — ou duas
 * não-federadas — vale a mais antiga (regra anterior, v3.0.57).
 *
 * POR QUÊ (não é preferência, é limite do Firebase): provedor federado NÃO se transfere
 * entre uids — ele morre com a conta. Celular e e-mail/senha se movem (admin.updateUser).
 * Então manter a "mais antiga" quando ela é phone e a nova é Google apaga o login que a
 * pessoa de fato usa: o e-mail migra pro sobrevivente, mas o provider google.com some, e
 * "Entrar com Google" passa a bater em auth/account-exists-with-different-credential (o
 * projeto usa UMA conta por e-mail — conferido na config do Identity Toolkit). O
 * resolveMergedLogin não cobre: ele exige logar na conta com mergedInto, que foi deletada.
 *
 * Caso real (Mônica Rossi, jul/2026): phone de 31/mai com o perfil todo + vaga na Confra;
 * Google de 11/jun com os únicos logins recentes. Pela regra antiga ela ganharia a Confra e
 * perderia a entrada.
 *
 * Este teste replica a decisão ANTIGA pra provar que ela errava, e trava a nova nos DOIS
 * pontos que escolhem sobrevivente (_mergeAccountsKeepOlder e _determineMergeWinner) — se
 * discordarem, auto-merge e merge explícito escolhem contas diferentes pra mesma dupla.
 *
 * node tests/merge-federated-wins.test.js
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── O CÓDIGO REAL (functions/merge-rules.js), não uma réplica ─────────────────
// A lógica mora num módulo PURO justamente pra ser exercitada aqui: antes eu testava uma
// cópia da regra, e reverter o index.js pra "mais antiga vence" deixava a suíte VERDE.
const { pickSurvivor, isFederated, isFederatedProfile } = require('../functions/merge-rules');
const escolhe = (ua, ub) => pickSurvivor(ua, ub).keep;
// Réplica da regra ANTIGA, pra provar a falha
function escolheAntiga(ua, ub) {
  return new Date(ua.metadata.creationTime).getTime() <= new Date(ub.metadata.creationTime).getTime() ? ua : ub;
}

// ── Caso real: Mônica Rossi ───────────────────────────────────────────────────
const phone  = { uid: 'phone_velho', metadata: { creationTime: '2026-05-31' }, providerData: [{ providerId: 'phone' }] };
const google = { uid: 'google_novo', metadata: { creationTime: '2026-06-11' }, providerData: [{ providerId: 'google.com' }] };

ok(escolheAntiga(phone, google).uid === 'phone_velho',
  'ANTIGA: mantinha a de telefone (mais antiga) — e apagava o Google que ela usa');
ok(escolhe(phone, google).uid === 'google_novo',
  'NOVA: mantém a federada (Google), mesmo sendo a mais nova');
ok(escolhe(google, phone).uid === 'google_novo',
  'NOVA: direção-agnóstica — a ordem dos argumentos não muda o vencedor');

// ── Apple conta como federada ─────────────────────────────────────────────────
const apple = { uid: 'apple', metadata: { creationTime: '2026-07-01' }, providerData: [{ providerId: 'apple.com' }] };
const senha = { uid: 'senha_velha', metadata: { creationTime: '2026-01-01' }, providerData: [{ providerId: 'password' }] };
ok(escolhe(senha, apple).uid === 'apple', 'Apple também vence e-mail/senha mais antigo');

// ── Empate de federação → mais antiga (regra anterior preservada) ─────────────
const g1 = { uid: 'g_velho', metadata: { creationTime: '2026-03-29' }, providerData: [{ providerId: 'google.com' }] };
const g2 = { uid: 'g_novo',  metadata: { creationTime: '2026-06-04' }, providerData: [{ providerId: 'google.com' }] };
ok(escolhe(g1, g2).uid === 'g_velho', 'duas federadas → mais antiga vence (caso Eduardo Mange)');
ok(escolhe(g2, g1).uid === 'g_velho', 'duas federadas → direção-agnóstica');

const p1 = { uid: 'ph_velho', metadata: { creationTime: '2026-02-01' }, providerData: [{ providerId: 'phone' }] };
const p2 = { uid: 'pw_novo',  metadata: { creationTime: '2026-05-01' }, providerData: [{ providerId: 'password' }] };
ok(escolhe(p1, p2).uid === 'ph_velho', 'nenhuma federada → mais antiga vence');

// ── Conta com MÚLTIPLOS provedores conta como federada ────────────────────────
const misto = { uid: 'misto', metadata: { creationTime: '2026-07-14' }, providerData: [{ providerId: 'google.com' }, { providerId: 'phone' }] };
ok(escolhe(misto, p1).uid === 'misto', 'conta google+phone é federada (perderia o Google se fosse absorvida)');

// ── o index.js USA o módulo? (não pode ter a regra duplicada divergindo) ─────
const src = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
ok(/require\(["']\.\/merge-rules["']\)/.test(src), 'index.js importa functions/merge-rules');
// ⚠️ REVISADAS de propósito em 04/ago/2026 (decisão do dono: "a mais ativa vence").
// O que estas 2 asserções defendem NÃO mudou — "a regra mora no módulo e os DOIS pontos de
// decisão usam a MESMA" — só mudou QUAL regra é a vigente. A anterior (federada vence) era
// contorno de um limite técnico que caiu: o merge agora TRANSFERE o provedor federado e
// ABSORVE o perfil, então o critério parou de decidir quem perde dados. As funções antigas
// seguem exercitadas acima, como registro do porquê.
ok(/_mergeRules\.pickSurvivorByActivity\(_byUid\(uidA\)/.test(src),
  '_mergeAccountsKeepOlder usa a regra VIGENTE do módulo (mais ativa vence)');
ok((src.match(/_mergeRules\.pickSurvivorByActivity\(/g) || []).length === 2,
  'os DOIS pontos de decisão usam a MESMA regra (senão escolhem contas diferentes pra mesma dupla)');
ok(!/_mergeRules\.pickSurvivor\(ua, ub\)/.test(src),
  'a regra superada (federada vence) não é mais chamada pelo index.js');
ok(/async function _determineMergeWinner[\s\S]{0,400}admin\.auth\(\)\.getUser\(/.test(src),
  '_determineMergeWinner consulta o AUTH (idade/federação reais, não só os campos do doc)');
ok(/creationTime \|\| 0\)\.getTime\(\);\s*\n\s*const keepU/.test(src) === false,
  'index.js NÃO decide sobrevivente por idade direto (a regra é do módulo)');

// isFederatedProfile: o outro ponto decide pelo authProvider do doc
ok(isFederatedProfile({ authProvider: 'google.com' }) === true, 'perfil google.com → federado');
ok(isFederatedProfile({ authProvider: 'apple.com' }) === true, 'perfil apple.com → federado');
ok(isFederatedProfile({ authProvider: 'phone' }) === false, 'perfil phone → não federado');
ok(isFederatedProfile({ authProvider: 'password' }) === false, 'perfil password → não federado');
ok(isFederatedProfile({}) === false, 'perfil sem authProvider → não federado');
ok(isFederated({ providerData: [{ providerId: 'google.com' }] }) === true, 'isFederated lê providerData');
ok(isFederated({ providerData: [{ providerId: 'phone' }] }) === false, 'isFederated: phone não é federado');


// ── MAPAS POR UID e todo o resto: agora é o CÂNONE quem varre ────────────────
// _repairTournaments listava campo a campo e a lista sempre ficava incompleta (não via
// membro de dupla, nem mapa por uid, nem organizerId — que existe em 6/8 torneios de prod).
// Trocada pela varredura canônica: functions/uid-sweep.js (testado em tests/uid-sweep.test.js).
const repBloco = src.slice(src.indexOf('async function _repairTournaments'), src.indexOf('function _determineMergeWinner'));
ok(/_uidSweep\.remapUid\(/.test(repBloco), '_repairTournaments usa a varredura canônica (uid-sweep)');
ok(/require\(["']\.\/uid-sweep["']\)/.test(src), 'index.js importa functions/uid-sweep');
// "não lista campo a campo" = não LÊ os mapas por nome (t.checkedIn / t["checkedIn"]).
// Mencionar checkedIn no comentário que explica o histórico é esperado — o que não pode
// voltar é o CÓDIGO tratando campo a campo, que é o que apodrecia.
ok(/\bt\.checkedIn\b|\["checkedIn"\]|'checkedIn'/.test(repBloco) === false,
  '_repairTournaments NÃO lista mais campo a campo (a lista é o que apodrecia)');

// ── enrollSeq: a ORDEM DE INSCRIÇÃO não pode mudar no remap ──────────────────
// _repairTournaments copia a entrada e troca só o uid — enrollSeq vai junto.
const blocoRep = src.slice(src.indexOf('async function _repairTournaments'), src.indexOf('function _determineMergeWinner'));
ok(/Object\.assign\(\{\}, p\)/.test(blocoRep), '_repairTournaments: copia a entrada (enrollSeq preservado)');
ok(/enrollSeq\s*=/.test(blocoRep) === false, '_repairTournaments: NUNCA reescreve enrollSeq');

console.log(fail === 0
  ? '✅ merge-federated-wins: ' + pass + ' ok, 0 falharam'
  : '❌ merge-federated-wins: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);
