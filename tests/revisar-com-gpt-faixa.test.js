/* A FAIXA da revisão do GPT é uma REGRA sobre os arquivos — e os escapes só ELEVAM.
 * node tests/revisar-com-gpt-faixa.test.js
 *
 * Pedido pelo próprio revisor (parecer de 04/set/2026, BLOQUEIO sobre a 1ª versão do script):
 *  - SP_GPT_FAIXA=trivial silenciava uma revisão crítica → agora só normal|critica, e só eleva.
 *  - o teto de 300 linhas não contava arquivo NÃO RASTREADO → agora conta.
 *  - `faixa js/store.js` (lista à mão, sem diff) caía em trivial pela exceção do bump → a
 *    exceção vale SÓ no modo diff.
 *  - plano que cria arquivo NOVO em functions/ era trivial (o extrator descartava o que não
 *    existia) → caminho citado conta, existindo ou não.
 *  - SP_SEM_GPT=1 liberava sem motivo → exige `sem-gpt: <motivo>` num commit a publicar, e
 *    nunca vale pra plano.
 * Só o classificador é testado aqui — o Codex nunca é chamado (tudo termina antes dele).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'revisar-com-gpt.sh');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error('  ✗', m)); };

function run(args, opts) {
  opts = opts || {};
  // o script acha a RAIZ pela própria localização — o laboratório usa a CÓPIA dele
  const r = spawnSync('bash', [opts.script || SCRIPT].concat(args), {
    cwd: opts.cwd || path.join(__dirname, '..'),
    env: Object.assign({}, process.env, { CODEX_BIN: '/nonexistent/codex' }, opts.env || {}),
    encoding: 'utf8',
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const faixaDe = (r) => (r.out.match(/faixa: (\w+)/) || [])[1];

// ── lista à mão: a regra pura ───────────────────────────────────────────────────────
ok(faixaDe(run(['faixa', 'css/a.css', 'js/release-notes.js'])) === 'trivial', 'css+notas devia ser trivial');
ok(faixaDe(run(['faixa', 'js/ui.js'])) === 'normal', 'js/ui.js devia ser normal');
ok(faixaDe(run(['faixa', 'js/views/bracket.js', 'css/x.css'])) === 'critica', 'bracket devia ser crítica');
ok(faixaDe(run(['faixa', 'functions/index.js'])) === 'critica', 'functions/ devia ser crítica');
ok(faixaDe(run(['faixa', 'js/store.js'])) === 'critica', 'store.js numa lista à mão é crítica (sem diff, sem exceção de bump)');
ok(faixaDe(run(['faixa', 'functions/novo-que-nao-existe.js'])) === 'critica', 'arquivo NOVO em functions/ conta mesmo sem existir');

// ── escapes ─────────────────────────────────────────────────────────────────────────
let r = run(['faixa', 'js/views/bracket.js'], { env: { SP_GPT_FAIXA: 'trivial' } });
ok(r.code !== 0 && /nunca trivial/.test(r.out), 'SP_GPT_FAIXA=trivial tem que ABORTAR — code ' + r.code);
r = run(['faixa', 'js/views/bracket.js'], { env: { SP_GPT_FAIXA: 'normal' } });
ok(faixaDe(r) === 'critica', 'SP_GPT_FAIXA=normal NÃO rebaixa crítica — veio ' + faixaDe(r));
r = run(['faixa', 'css/a.css'], { env: { SP_GPT_FAIXA: 'critica' } });
ok(faixaDe(r) === 'critica', 'SP_GPT_FAIXA=critica ELEVA trivial — veio ' + faixaDe(r));
r = run(['plano', '/dev/null'], { env: { SP_SEM_GPT: '1' } });
ok(r.code !== 0, 'SP_SEM_GPT nunca vale pra plano — code ' + r.code);

// ── repositório de laboratório: diff, bump e não rastreado ──────────────────────────
const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-revisao-lab-'));
const git = (a) => spawnSync('git', a, { cwd: lab, encoding: 'utf8' });
git(['init', '-q', '-b', 'main']);
git(['config', 'user.email', 'lab@test']); git(['config', 'user.name', 'lab']);
fs.mkdirSync(path.join(lab, 'js'), { recursive: true });
fs.mkdirSync(path.join(lab, 'scripts'), { recursive: true });
fs.copyFileSync(SCRIPT, path.join(lab, 'scripts', 'revisar-com-gpt.sh'));
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.0';\nvar x = 1;\n");
fs.writeFileSync(path.join(lab, 'a.css'), 'a{}\n');
git(['add', '-A']); git(['commit', '-q', '-m', 'base']);
// origin/main = o mesmo commit (o script compara com origin/main)
git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
const runLab = (args, env) => run(args, { cwd: lab, env, script: path.join(lab, 'scripts', 'revisar-com-gpt.sh') });

// só o bump em store.js → trivial (modo diff)
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.1';\nvar x = 1;\n");
r = runLab(['faixa']);
ok(faixaDe(r) === 'trivial', 'diff só com bump de versão devia ser trivial — veio ' + faixaDe(r));
// bump + lógica em store.js → crítica
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.1';\nvar x = 2;\n");
r = runLab(['faixa']);
ok(faixaDe(r) === 'critica', 'store.js com lógica alterada devia ser crítica — veio ' + faixaDe(r));
git(['checkout', '-q', '--', 'js/store.js']);
// arquivo NOVO não rastreado com > 300 linhas, fora da lista crítica → o teto o torna crítico
fs.writeFileSync(path.join(lab, 'js', 'novo.js'), Array.from({ length: 320 }, (_, i) => 'var l' + i + ' = ' + i + ';').join('\n') + '\n');
r = runLab(['diff']);
ok(/faixa: critica/.test(r.out), 'não rastreado com 320 linhas devia elevar a crítica — saída: ' + r.out.split('\n')[0]);
ok(r.code === 4 && /Codex CLI não encontrado/.test(r.out), 'sem Codex o modo diff falha com exit 4 (nunca aprova) — code ' + r.code);
// SP_SEM_GPT=1 sem motivo no commit → aborta; com `sem-gpt:` num commit a publicar → passa
r = runLab(['diff'], { SP_SEM_GPT: '1' });
ok(r.code !== 0 && /exige o motivo/.test(r.out), 'SP_SEM_GPT sem motivo no commit tem que abortar — code ' + r.code);
git(['add', '-A']); git(['commit', '-q', '-m', 'lab: arquivo novo\n\nsem-gpt: laboratório do teste']);
r = runLab(['diff'], { SP_SEM_GPT: '1' });
ok(r.code === 0 && /PULADA/.test(r.out), 'SP_SEM_GPT com motivo no commit libera — code ' + r.code + ' saída: ' + r.out.trim().split('\n').slice(-2).join(' | '));

fs.rmSync(lab, { recursive: true, force: true });
console.log(fail ? '❌ revisar-com-gpt faixa: ' + fail + ' falha(s), ' + pass + ' ok' : '✅ revisar-com-gpt faixa: ' + pass + ' ok');
process.exit(fail ? 1 : 0);
