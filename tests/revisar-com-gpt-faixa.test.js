/* A FAIXA da revisão cruzada é uma REGRA sobre os arquivos — e os escapes só ELEVAM.
 * node tests/revisar-com-gpt-faixa.test.js
 *
 * Cobre `scripts/revisar.sh` (núcleo) pelos dois atalhos, `revisar-com-gpt.sh` e
 * `revisar-com-claude.sh`. Pedido pelo próprio revisor GPT (parecer BLOQUEIO, 04/set/2026):
 *  - SP_GPT_FAIXA=trivial silenciava uma revisão crítica → só normal|critica, e só eleva.
 *  - o teto de 300 linhas não contava arquivo NÃO RASTREADO → conta.
 *  - `faixa js/store.js` (lista à mão) caía em trivial pela exceção do bump → só no modo diff.
 *  - plano que cria arquivo NOVO em functions/ era trivial → caminho citado conta, exista ou não.
 *  - SP_SEM_GPT=1 liberava sem motivo → exige `sem-gpt: <motivo>` num commit; nunca pra plano.
 * E o interruptor por lado (ordem do dono): desligado, plano e diff passam com aviso; ligado,
 * voltam a cobrar. Nenhum revisor é chamado de verdade — os binários apontam pro nada.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GPT = path.join(ROOT, 'scripts', 'revisar-com-gpt.sh');
const CLAUDE = path.join(ROOT, 'scripts', 'revisar-com-claude.sh');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error('  ✗', m)); };

const SEM_REVISOR = { CODEX_BIN: '/nonexistent/codex', CLAUDE_BIN: '/nonexistent/claude',
  SP_GPT_CHAVE: '/nonexistent/chave-gpt', SP_CLAUDE_CHAVE: '/nonexistent/chave-claude' };
function run(script, args, opts) {
  opts = opts || {};
  const env = Object.assign({}, process.env, SEM_REVISOR, opts.env || {});
  // o núcleo testa `-n CLAUDECODE` e `^CODEX_`: pra simular "fora do Claude Code" a variável
  // tem que SUMIR, não ficar vazia
  if (opts.semClaudeCode) delete env.CLAUDECODE;
  const r = spawnSync('bash', [script].concat(args), { cwd: opts.cwd || ROOT, env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const faixaDe = (r) => (r.out.match(/faixa: (\w+)/) || [])[1];

// ── lista à mão: a regra pura, igual pelos dois atalhos ─────────────────────────────
for (const S of [GPT, CLAUDE]) {
  const nome = path.basename(S);
  ok(faixaDe(run(S, ['faixa', 'css/a.css', 'js/release-notes.js'])) === 'trivial', nome + ': css+notas devia ser trivial');
  ok(faixaDe(run(S, ['faixa', 'js/ui.js'])) === 'normal', nome + ': js/ui.js devia ser normal');
  ok(faixaDe(run(S, ['faixa', 'js/views/bracket.js', 'css/x.css'])) === 'critica', nome + ': bracket devia ser crítica');
  ok(faixaDe(run(S, ['faixa', 'functions/index.js'])) === 'critica', nome + ': functions/ devia ser crítica');
  ok(faixaDe(run(S, ['faixa', 'js/store.js'])) === 'critica', nome + ': store.js numa lista à mão é crítica');
  ok(faixaDe(run(S, ['faixa', 'functions/novo-que-nao-existe.js'])) === 'critica', nome + ': arquivo NOVO em functions/ conta sem existir');
}

// ── escapes ─────────────────────────────────────────────────────────────────────────
let r = run(GPT, ['faixa', 'js/views/bracket.js'], { env: { SP_GPT_FAIXA: 'trivial' } });
ok(r.code !== 0 && /nunca trivial/.test(r.out), 'SP_GPT_FAIXA=trivial tem que ABORTAR — code ' + r.code);
r = run(GPT, ['faixa', 'js/views/bracket.js'], { env: { SP_GPT_FAIXA: 'normal' } });
ok(faixaDe(r) === 'critica', 'SP_GPT_FAIXA=normal NÃO rebaixa crítica — veio ' + faixaDe(r));
r = run(GPT, ['faixa', 'css/a.css'], { env: { SP_GPT_FAIXA: 'critica' } });
ok(faixaDe(r) === 'critica', 'SP_GPT_FAIXA=critica ELEVA trivial — veio ' + faixaDe(r));
r = run(GPT, ['plano', '/dev/null'], { env: { SP_SEM_GPT: '1' } });
ok(r.code !== 0, 'SP_SEM_GPT nunca vale pra plano — code ' + r.code);
r = run(path.join(ROOT, 'scripts', 'revisar.sh'), ['desligar', 'x']);
ok(r.code !== 0 && /QUAL revisor/.test(r.out), 'desligar sem dizer o revisor aborta — code ' + r.code);

// ── repositório de laboratório: diff, bump, não rastreado, auto e interruptor ───────
const lab = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-revisao-lab-'));
const git = (a) => spawnSync('git', a, { cwd: lab, encoding: 'utf8' });
git(['init', '-q', '-b', 'main']);
git(['config', 'user.email', 'lab@test']); git(['config', 'user.name', 'lab']);
fs.mkdirSync(path.join(lab, 'js'), { recursive: true });
fs.mkdirSync(path.join(lab, 'scripts'), { recursive: true });
// o script acha a RAIZ pela própria localização — o laboratório usa CÓPIAS dos três
for (const f of ['revisar.sh', 'revisar-com-gpt.sh', 'revisar-com-claude.sh']) {
  fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(lab, 'scripts', f));
}
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.0';\nvar x = 1;\n");
fs.writeFileSync(path.join(lab, 'a.css'), 'a{}\n');
git(['add', '-A']); git(['commit', '-q', '-m', 'base']);
git(['update-ref', 'refs/remotes/origin/main', 'HEAD']);
const labGPT = path.join(lab, 'scripts', 'revisar-com-gpt.sh');
const labCLAUDE = path.join(lab, 'scripts', 'revisar-com-claude.sh');
const labCORE = path.join(lab, 'scripts', 'revisar.sh');
const runLab = (script, args, env, semClaudeCode) => run(script, args, { cwd: lab, env, semClaudeCode });

// só o bump em store.js → trivial (modo diff)
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.1';\nvar x = 1;\n");
r = runLab(labGPT, ['faixa']);
ok(faixaDe(r) === 'trivial', 'diff só com bump de versão devia ser trivial — veio ' + faixaDe(r));
fs.writeFileSync(path.join(lab, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '1.0.1';\nvar x = 2;\n");
r = runLab(labGPT, ['faixa']);
ok(faixaDe(r) === 'critica', 'store.js com lógica alterada devia ser crítica — veio ' + faixaDe(r));
git(['checkout', '-q', '--', 'js/store.js']);
// não rastreado com > 300 linhas → o teto eleva a crítica; sem revisor, exit 4 (nunca aprova)
fs.writeFileSync(path.join(lab, 'js', 'novo.js'), Array.from({ length: 320 }, (_, i) => 'var l' + i + ' = ' + i + ';').join('\n') + '\n');
r = runLab(labGPT, ['diff']);
ok(/faixa: critica/.test(r.out), 'não rastreado com 320 linhas devia elevar a crítica — ' + r.out.split('\n')[0]);
ok(r.code === 4 && /Codex CLI não encontrado/.test(r.out), 'sem Codex o diff falha com exit 4 — code ' + r.code);
r = runLab(labCLAUDE, ['diff']);
ok(r.code === 4 && /Claude Code CLI não encontrado/.test(r.out), 'sem claude o diff falha com exit 4 — code ' + r.code);
// auto: dentro do Claude Code revisa o GPT; dentro do Codex revisa o Claude; sem pista, os dois
r = runLab(labCORE, ['diff'], { CLAUDECODE: '1' });
ok(/revisão pelo gpt/.test(r.out) && r.code === 4, 'auto dentro do Claude Code chama o GPT — ' + r.out.split('\n')[0]);
r = runLab(labCORE, ['diff'], { CODEX_HOME: '/x' }, true);
ok(/revisão pelo claude/.test(r.out) && r.code === 4, 'auto dentro do Codex chama o Claude — ' + r.out.split('\n')[0]);
r = runLab(labCORE, ['diff'], {}, true);
ok(/os DOIS revisam/.test(r.out) && r.code === 4, 'auto sem pista chama os dois — ' + r.out.split('\n')[0]);
// SP_SEM_GPT=1 sem motivo → aborta; com `sem-gpt:` num commit a publicar → passa
r = runLab(labGPT, ['diff'], { SP_SEM_GPT: '1' });
ok(r.code !== 0 && /exige o motivo/.test(r.out), 'SP_SEM_GPT sem motivo no commit aborta — code ' + r.code);
git(['add', '-A']); git(['commit', '-q', '-m', 'lab: arquivo novo\n\nsem-gpt: laboratório do teste']);
r = runLab(labGPT, ['diff'], { SP_SEM_GPT: '1' });
ok(r.code === 0 && /PULADA/.test(r.out), 'SP_SEM_GPT com motivo no commit libera — code ' + r.code);

// ── interruptor, UM POR LADO ────────────────────────────────────────────────────────
const chaveG = path.join(lab, 'gpt.desligada'), chaveC = path.join(lab, 'claude.desligada');
const chaves = { SP_GPT_CHAVE: chaveG, SP_CLAUDE_CHAVE: chaveC };
r = runLab(labGPT, ['desligar', 'sem créditos'], chaves);
ok(r.code === 0 && fs.existsSync(chaveG) && !fs.existsSync(chaveC), 'desligar o GPT grava só a chave dele — code ' + r.code);
r = runLab(labGPT, ['desligar'], chaves);
ok(r.code !== 0, 'desligar sem motivo aborta — code ' + r.code);
r = runLab(labCORE, ['status'], chaves);
ok(/revisor gpt: DESLIGADA/.test(r.out) && /revisor claude: LIGADA/.test(r.out), 'status mostra os dois lados');
r = runLab(labGPT, ['diff'], chaves);
ok(r.code === 0 && /DESLIGADA/.test(r.out), 'diff pelo GPT desligado passa com aviso — code ' + r.code);
r = runLab(labGPT, ['plano', path.join(lab, 'a.css')], chaves);
ok(r.code === 0 && /DESLIGADA/.test(r.out), 'plano pelo GPT desligado passa com aviso — code ' + r.code);
r = runLab(labCLAUDE, ['diff'], chaves);
ok(r.code === 4, 'o lado do Claude segue LIGADO e cobra (exit 4 sem binário) — code ' + r.code);
r = runLab(labGPT, ['ligar'], chaves);
ok(r.code === 0 && !fs.existsSync(chaveG), 'ligar apaga a chave — code ' + r.code);
r = runLab(labGPT, ['diff'], chaves);
ok(r.code === 4, 'ligado de novo, sem Codex volta a falhar com exit 4 — code ' + r.code);

fs.rmSync(lab, { recursive: true, force: true });
console.log(fail ? '❌ revisar (faixa/interruptor/auto): ' + fail + ' falha(s), ' + pass + ' ok' : '✅ revisar (faixa/interruptor/auto): ' + pass + ' ok');
process.exit(fail ? 1 : 0);
