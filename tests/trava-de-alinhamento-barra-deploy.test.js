/* A TRAVA DE ALINHAMENTO BARRA O DEPLOY — e agora também o das Functions
 * node tests/trava-de-alinhamento-barra-deploy.test.js
 *
 * O QUE ACONTECEU (medido em 30/ago/2026). `scripts/deploy-functions.sh` não tem UMA linha
 * de git: nada de `status`, `rev-parse`, `diff` ou `origin/main`. Ele publica o que está no
 * DISCO. Resultado real: as duas Cloud Functions foram atualizadas às 19:38 BRT e o commit
 * que carrega esse código (0aecc59b) é de 19:41 — três minutos em que produção rodou código
 * não commitado, e ninguém tinha como saber.
 *
 * A regra já existia e já estava escrita: `scripts/check-deploy-alignment.js`, criado depois
 * do incidente de 12/ago/2026 (produção em 1.8.27 com `origin/main` em 1.8.24). Ela era o 1º
 * item de `hosting.predeploy` — e o caminho das Functions simplesmente não passava por ela.
 * `functions[0].predeploy` estava `[]`. A trava existia e ninguém a chamava.
 *
 * ⛔ POR QUE ESTE TESTE NÃO PODE SER SÓ GREP. Duas armadilhas, cada uma capaz de deixar a
 * suíte verde sobre um gate desligado:
 *   ① procurar por "status --porcelain" DENTRO do script fica verde mesmo com o
 *      `functions[0].predeploy` vazio — o gate estaria correto e desconectado;
 *   ② rodar a trava contra ESTE repositório dá verde ou vermelho conforme o estado do
 *      checkout do momento — mede o humor da árvore, não o comportamento da trava.
 * ⇒ As duas metades: ① a trava está PENDURADA no lugar certo (configuração), e ② ela
 * DETECTA de verdade, executando o SCRIPT REAL num sandbox descartável.
 * Mesma forma de tests/vendor-do-autodraw-nao-fica-velho.test.js.
 *
 * ⛔ SANDBOX SEM REDE: o script faz `git fetch -q origin main` (linha 79). O remoto é um
 * repositório BARE local, então o fetch é real e o teste continua offline.
 *
 * ⛔ E O SANDBOX NUNCA TOCA O REPO: tudo em mkdtemp, e a trava que roda lá é uma CÓPIA do
 * arquivo real (o script resolve a raiz por `__dirname/..`, então precisa morar em
 * <sandbox>/scripts/). Copiar o arquivo real — nunca reescrever a lógica aqui, que é como
 * uma suíte passa a certificar código revertido.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const TRAVA = path.join(RAIZ, 'scripts', 'check-deploy-alignment.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* ── ① A TRAVA ESTÁ PENDURADA ────────────────────────────────────────────── */
console.log('\n① a trava está ligada no fluxo (configuração)\n');

ok(fs.existsSync(TRAVA), 'scripts/check-deploy-alignment.js existe');

const fb = JSON.parse(fs.readFileSync(path.join(RAIZ, 'firebase.json'), 'utf8'));
const CHAMADA = 'node scripts/check-deploy-alignment.js';

const fns = Array.isArray(fb.functions) ? fb.functions : (fb.functions ? [fb.functions] : []);
const main = fns.find((c) => c && c.source === 'functions');
ok(!!main, 'firebase.json da raiz declara o codebase do `functions/`');
ok(!!main && Array.isArray(main.predeploy) && main.predeploy.indexOf(CHAMADA) !== -1,
  '⭐ functions[0].predeploy CHAMA a trava — era isto que faltava (estava [])');

/* ⛔ E o que já funcionava não pode regredir junto: a trava nasceu no hosting e continua
 * sendo o PRIMEIRO item de lá (antes de npm test e do prerender, que são caros). */
ok(Array.isArray(fb.hosting && fb.hosting.predeploy) && fb.hosting.predeploy[0] === CHAMADA,
  'e segue sendo o 1º item de hosting.predeploy (sem regressão no caminho antigo)');

/* ⛔ ESCOPO: autodraw e stripe NÃO recebem a trava. Os diretórios deles não têm `.git`, então
 * ela cairia no ramo do carimbo (`.deploy-alignment.json`, que só o deploy-hosting.sh escreve)
 * e TODO deploy desses codebases passaria a falhar. Este teste trava essa decisão pra que
 * ninguém a "complete" sem antes resolver a ausência de .git. */
['functions-autodraw', 'functions-stripe'].forEach((dir) => {
  const p = path.join(RAIZ, dir, 'firebase.json');
  if (!fs.existsSync(p)) return;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const cs = Array.isArray(j.functions) ? j.functions : (j.functions ? [j.functions] : []);
  const chama = cs.some((c) => Array.isArray(c && c.predeploy) && c.predeploy.some((s) => String(s).indexOf('check-deploy-alignment') !== -1));
  ok(!chama, '⛔ ' + dir + ' NÃO recebe a trava (sem .git lá, ela barraria todo deploy)');
  ok(!fs.existsSync(path.join(RAIZ, dir, '.git')), '   e de fato ' + dir + ' não tem .git — é o motivo');
});

/* ── ② A TRAVA DETECTA — script REAL, sandbox descartável, offline ────────── */
console.log('\n② a trava detecta de verdade (sandbox com o script real)\n');

const git = (cwd, args) => spawnSync('git', args, { cwd, encoding: 'utf8' });
function rodarTrava(cwd, env) {
  return spawnSync(process.execPath, [path.join(cwd, 'scripts', 'check-deploy-alignment.js')],
    { cwd, encoding: 'utf8', env: Object.assign({}, process.env, env || {}) });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-alinhamento-'));
const bare = path.join(tmp, 'origin.git');
const work = path.join(tmp, 'trabalho');
let montou = false;
try {
  fs.mkdirSync(bare); fs.mkdirSync(work);
  git(bare, ['init', '--quiet', '--bare']);
  git(work, ['init', '--quiet']);
  git(work, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  git(work, ['config', 'user.email', 'trava@teste.local']);
  git(work, ['config', 'user.name', 'Trava Teste']);
  git(work, ['config', 'commit.gpgsign', 'false']);
  git(work, ['remote', 'add', 'origin', bare]);
  fs.mkdirSync(path.join(work, 'scripts'));
  fs.copyFileSync(TRAVA, path.join(work, 'scripts', 'check-deploy-alignment.js')); // o ARQUIVO REAL
  fs.writeFileSync(path.join(work, 'version.txt'), '9.9.9\n');
  git(work, ['add', '-A']);
  git(work, ['commit', '--quiet', '-m', 'inicial']);
  const push = git(work, ['push', '--quiet', 'origin', 'HEAD:main']);
  montou = push.status === 0;
  ok(montou, 'sandbox montado: repo + remoto bare local, sem rede');
} catch (e) {
  ok(false, 'sandbox montado: ' + e.message);
}

if (montou) {
  // CASO A — limpo e publicado
  const a = rodarTrava(work);
  ok(a.status === 0, 'CASO A · árvore limpa e HEAD em origin/main → exit 0');
  ok(/alinhamento ok/.test(a.stdout || ''), '   e diz "alinhamento ok"');

  // CASO B — árvore suja
  fs.writeFileSync(path.join(work, 'sujeira.txt'), 'não commitado\n');
  const b = rodarTrava(work);
  ok(b.status === 1, '⭐ CASO B · ÁRVORE SUJA → exit 1');
  ok(/DEPLOY BLOQUEADO/.test(b.stderr || ''), '   e grita DEPLOY BLOQUEADO');
  ok(/não commitada/.test(b.stderr || ''), '   dizendo que há alteração não commitada');
  ok(/sujeira\.txt/.test(b.stderr || ''), '   e mostrando QUAL arquivo (a mensagem lista a árvore)');

  // CASO D — a válvula de emergência continua existindo e sendo VISÍVEL
  const d = rodarTrava(work, { SP_SKIP_ALIGNMENT: '1' });
  ok(d.status === 0, 'CASO D · SP_SKIP_ALIGNMENT=1 ainda é bypass — exit 0 mesmo com árvore suja');
  ok(/PULADO por SP_SKIP_ALIGNMENT/.test(d.stdout || ''), '   ⭐ e ele ANUNCIA que foi pulado (bypass mudo seria pior que trava nenhuma)');

  // CASO C — commit que não foi pro origin/main
  git(work, ['add', '-A']);
  git(work, ['commit', '--quiet', '-m', 'commit local, sem push']);
  const c = rodarTrava(work);
  ok(c.status === 1, '⭐ CASO C · HEAD NÃO publicado em origin/main → exit 1');
  ok(/NÃO está em/.test(c.stderr || '') && /origin\/main/.test(c.stderr || ''),
    '   e diz que o commit não está em origin/main');
  ok(/1 commit\(s\) só aqui/.test(c.stderr || ''), '   contando quantos commits só existem aqui');

  // CASO E — depois do push, volta a passar (a trava libera o caminho certo)
  git(work, ['push', '--quiet', 'origin', 'HEAD:main']);
  const e = rodarTrava(work);
  ok(e.status === 0, 'CASO E · depois do push, volta a exit 0 — a trava não é bloqueio permanente');
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
ok(!fs.existsSync(tmp), 'sandbox removido — nada fica pra trás');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exit(fail ? 1 : 0);
