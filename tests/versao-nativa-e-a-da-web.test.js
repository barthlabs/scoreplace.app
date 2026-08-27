/* A VERSÃO NATIVA É A MESMA DA WEB (leva 27/ago/2026)
 *
 * ⛔ ORDEM DO DONO: _"altere esse padrao que é impossivel de alcancar. vc sempre faz cagada
 * na nativa e nunca fica x.y no final… adotemos o mesmo padrao da web x.y.z"_.
 *
 * O QUE ERA: a loja usava MAJOR.MINOR (2.1) e a web MAJOR.MINOR.PATCH (2.1.22). Com dois
 * esquemas, "está alinhado?" virava julgamento — e a conta batia de um jeito diferente a
 * cada leva. O caso concreto: a build 265 subiu ao TestFlight como "2.1" carregando o
 * código da 2.1.6, e não havia como perceber isso pelo número.
 *
 * O QUE É AGORA: MARKETING_VERSION (iOS) e versionName (Android) == version.txt.
 * Alinhamento deixa de ser julgamento e vira comparação de string.
 *
 * ⚠️ E É UM GATE, não um parágrafo: o dono JÁ tinha dito "tudo tem que andar junto" e o
 * repo mesmo assim ficou 16 commits atrás do ar. Neste projeto, o que não é gate não
 * acontece — a mesma lição do check-deploy-alignment, do backup-bundle e do
 * check-release-notes (que era decorativo no deploy até hoje).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── a versão nativa é a da web ────');

const ROOT = path.join(__dirname, '..');
const web = fs.readFileSync(path.join(ROOT, 'version.txt'), 'utf8').trim();

// ── o gate existe e está LIGADO nos dois caminhos de release ────────────────
ok(fs.existsSync(path.join(ROOT, 'scripts', 'check-versao-nativa.js')), 'o gate existe');
['ios-archive.sh', 'android-release.sh'].forEach((f) => {
  const sh = fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8');
  ok(/check-versao-nativa\.js/.test(sh), f + ' chama o gate');
  // ANTES de arquivar: falhar depois custa uma volta na fila da loja
  const iGate = sh.indexOf('check-versao-nativa.js');
  const iBuild = Math.max(sh.indexOf('xcodebuild'), sh.indexOf('gradlew'));
  ok(iGate > 0 && (iBuild === -1 || iGate < iBuild), f + ': e ANTES de construir');
});

// ── iOS: a versão nativa bate com a web AGORA ───────────────────────────────
const pbx = fs.readFileSync(path.join(ROOT, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8');
const mv = [...new Set([...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))];
ok(mv.length === 1 && mv[0] === web,
   'iOS: MARKETING_VERSION == version.txt (' + web + ') em TODOS os alvos — veio: ' + mv.join(', '));
const cpv = [...new Set([...pbx.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map((m) => m[1].trim()))];
ok(cpv.length === 1 && /^\d+$/.test(cpv[0]),
   'e o BUILD é um inteiro único (ele é da Apple, segue independente) — veio: ' + cpv.join(', '));

// ── o gate REPROVA de verdade (não é decoração) ─────────────────────────────
// Roda o script real contra uma árvore de mentira com a versão errada.
const os = require('os');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vn-'));
fs.writeFileSync(path.join(tmp, 'version.txt'), '9.9.9\n');
fs.mkdirSync(path.join(tmp, 'ios', 'App', 'App.xcodeproj'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'),
  'MARKETING_VERSION = 2.1;\nMARKETING_VERSION = 2.1;\n');
fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'scripts', 'check-versao-nativa.js'),
  path.join(tmp, 'scripts', 'check-versao-nativa.js'));
let saiu = 0, saida = '';
try {
  execFileSync(process.execPath, [path.join(tmp, 'scripts', 'check-versao-nativa.js'), 'ios'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) { saiu = e.status; saida = String(e.stderr || ''); }
ok(saiu === 1, '⛔ com a versão nativa diferente da web, o gate SAI 1 (reprova de verdade)');
ok(/9\.9\.9/.test(saida) && /2\.1/.test(saida),
   'e a mensagem mostra os DOIS números, pra não ter que adivinhar qual mexer');
ok(/MARKETING_VERSION/.test(saida), 'e diz ONDE mexer');
fs.rmSync(tmp, { recursive: true, force: true });

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
