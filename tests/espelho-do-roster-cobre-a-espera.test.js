/* O ESPELHO DO ROSTER É DA CF — O CLIENTE NÃO ESCREVE NELE
 * node tests/espelho-do-roster-cobre-a-espera.test.js
 *
 * ⚠️ SUÍTE REESCRITA DE PROPÓSITO em v1.7.98. A versão anterior travava o comportamento
 * de `_mirrorRoster` no CLIENTE (cobrir a espera, espelhar na 1ª gravação da sessão,
 * espelhar no fallback `_enrollParticipantTx`). Todas as asserções passavam — e o código
 * que elas defendiam NUNCA funcionou em produção.
 *
 * O QUE A MEDIÇÃO MOSTROU (10/ago/2026, investigando a issue nº1 do Sentry):
 * não existe regra nenhuma pra `tournaments/{id}/participants/{uid}` no `firestore.rules`
 * (`grep -c 'match /participants'` = 0 — há `results` e `letzplayScans`, essa não), e o
 * Firestore NEGA por omissão. Ou seja: desde que o espelho nasceu (1.7.29), toda escrita
 * do cliente voltava `permission-denied`. Os docs que existem no banco vieram da **CF**
 * (Admin SDK, que passa por cima das regras) e dos backfills manuais.
 *
 * Pior: como `try/catch` não pega rejeição de PROMESSA, cada tentativa virava *unhandled
 * rejection* — era a issue `Missing or insufficient permissions` (57 eventos / 24
 * usuários) que resistiu a um "fix" em agosto porque a causa estava em outra coleção.
 *
 * Por que os testes ficavam verdes: o harness usa um Firestore FALSO que aceita qualquer
 * escrita. Teste que não pode reprovar não prova nada — [[feedback_green_tests_still_broken]].
 *
 * A REGRA AGORA (cânone do dono: tudo roda na CF, o cliente apenas dispara):
 * quem espelha é `enrollParticipant` (functions/index.js), no MESMO ponto em que grava a
 * inscrição. O cliente não toca na subcoleção. Esta suíte trava esse contrato dos dois
 * lados — que o cliente não escreve, e que a CF escreve.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const SRC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const CF = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

console.log('──── espelho do roster: CF escreve, cliente não ────');

// ── (1) O CLIENTE NÃO ESCREVE NA SUBCOLEÇÃO ──────────────────────────────────
// É a trava principal: enquanto não houver regra, qualquer escrita daqui é negada e
// volta a virar unhandled rejection no Sentry.
ok(!/this\._mirrorRoster|self\._mirrorRoster/.test(SRC),
   'firebase-db.js não chama _mirrorRoster em lugar nenhum');
ok(!/_mirrorRoster\s*\(docId, data\)\s*\{/.test(SRC),
   'a função _mirrorRoster não existe mais no cliente');
ok(!/_rosterMirrorCache\s*:/.test(SRC),
   'o cache do espelho saiu junto (não sobra estado órfão)');
ok(!/collection\(['"]participants['"]\)/.test(SRC),
   'nenhum ponto do cliente abre a subcoleção `participants`');

// ── (2) A CF CONTINUA ESPELHANDO — a rede não foi desligada, mudou de dono ────
ok(/collection\(["']participants["']\)/.test(CF),
   'a CF escreve em tournaments/{id}/participants/{uid}');
{
  const bloco = (CF.match(/collection\(["']participants["']\)[\s\S]{0,400}/) || [''])[0];
  ok(/status/.test(bloco), 'a CF grava o `status` (enrolled/waitlisted) — é o que a rede prova');
  ok(/uid/.test(bloco), 'e o uid da pessoa, que é a identidade canônica');
}
ok(/enrolled|waitlisted/.test(CF),
   'a CF cobre inscrição E lista de espera (o inscrito tardio é o mais frágil)');

// ── (3) A CAUSA DA NEGAÇÃO CONTINUA VERDADEIRA — se mudar, este teste avisa ───
// Se um dia a regra for criada (decisão do dono), esta asserção fica vermelha e obriga
// a revisitar a decisão de o cliente não escrever — em vez de o assunto morrer aqui.
ok(!/match\s+\/participants\s*\/\s*\{/.test(RULES),
   'segue sem regra pra a subcoleção `participants` — se criarem uma, revisar esta suíte');

// ── (4) A ARMADILHA QUE CAUSOU TUDO: try/catch não pega rejeição de promessa ──
// Varre o cliente atrás de escrita Firestore solta dentro de try/catch (sem await, sem
// .then, sem .catch). Foi assim que a issue nº1 do Sentry nasceu e ficou 3 meses viva.
{
  const suspeitas = SRC.split('\n').filter((l) =>
    /try\s*\{[^}]*\.(set|update|delete|add)\s*\(/.test(l) &&
    !/await|\.then|\.catch|return/.test(l));
  ok(suspeitas.length === 0,
     'nenhuma escrita Firestore solta dentro de try/catch (a rejeição escaparia como unhandled): ' +
     suspeitas.map((s) => s.trim().slice(0, 60)).join(' | '));
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);
