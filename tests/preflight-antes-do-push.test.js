/* preflight-antes-do-push.test.js — NENHUM COMMIT DE RELEASE ENTRA NO MAIN ANTES DOS GATES.
 * node tests/preflight-antes-do-push.test.js
 *
 * O QUE ACONTECEU, duas vezes, em 01/set/2026:
 * `scripts/deploy-hosting.sh` empurrava o commit pro `main` (passo 2) e só DEPOIS extraía a
 * cópia e rodava o predeploy. Na 2.1.81 um gate reprovou com o `main` JÁ ADIANTADO — e o
 * conserto virou um commit a mais em cima, porque desfazer o que já está no remoto é pior.
 * Na 2.1.82 só não doeu porque o ensaio foi feito À MÃO, o que não protege o próximo deploy
 * de ninguém. ⛔ A regra: nenhum commit de release é empurrado antes de tudo o que é preciso
 * pra publicá-lo passar.
 *
 * COMO ISTO É PROVADO AQUI: com um REPOSITÓRIO e um REMOTO de verdade, criados em /tmp —
 * não com mock. O script é executado contra eles com um `firebase` e um `npm` FALSOS no
 * PATH, que registram se foram chamados. Assim dá pra afirmar as duas coisas que importam:
 *   ① gate reprovado  → NÃO houve push (o remoto não se moveu) e NÃO houve upload;
 *   ② gate aprovado   → houve push, e só então o upload.
 * E, por fonte, que a ordem no script é essa mesma e que a cópia do preflight é a MESMA
 * função que monta a cópia da publicação.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

const sh = fs.readFileSync(path.join(RAIZ, 'scripts', 'deploy-hosting.sh'), 'utf8');

// ── ① a ORDEM no script ──────────────────────────────────────────────────────────────
console.log('\n▸ ① no script, o preflight vem ANTES do push, e o push antes do upload');
{
  const pos = {
    cache: sh.indexOf('TRAVA DURA: O CACHE DO SW'),
    preflight: sh.indexOf('PREFLIGHT: TODOS OS GATES ANTES DE TOCAR NO'),
    npmtest: sh.indexOf('&& npm test'),
    revisao: sh.indexOf('revisão cruzada sobre origin/main..HEAD'),
    push: sh.indexOf('git push origin "HEAD:main"'),
    deploy: sh.indexOf('firebase deploy --only hosting --project')
  };
  Object.keys(pos).forEach((k) => ok(pos[k] > 0, 'achei o marco `' + k + '` no script'));
  ok(pos.preflight < pos.push, '⭐ o preflight vem ANTES do `git push origin HEAD:main`');
  ok(pos.npmtest < pos.push, '⭐ e o `npm test` do preflight também');
  ok(pos.revisao < pos.push, '⭐ a revisão cruzada (1.8) também vem ANTES do push');
  ok(pos.cache < pos.push, 'a trava do CACHE_NAME também foi pra antes do push');
  ok(pos.push < pos.deploy, 'e o push continua antes do upload (o main descreve o ar)');
  ok(/SP_EXIGE_CORRIDA_REAL=1/.test(sh.slice(pos.preflight, pos.push)),
    '⛔ e o preflight proíbe "pulada" na corrida do sorteio');
  ok(/exit 1/.test(sh.slice(pos.preflight, pos.push)), 'e ele encerra em caso de falha');
  const chamadas = (sh.match(/montar_copia /g) || []).length;
  eq(chamadas, 2, 'a cópia é montada pela MESMA função nas duas vezes (preflight e publicação)');
}

/* ── ② e ③ · O SCRIPT RODANDO DE VERDADE, contra repo e remoto temporários ────────────
 * `firebase` e `npm` falsos no PATH: o primeiro grava que foi chamado (seria o upload), o
 * segundo decide se o preflight passa ou reprova. Nada real é publicado nem empurrado. */
function cenario(preflightPassa) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'sppre-'));
  const remoto = path.join(base, 'remoto.git');
  const repo = path.join(base, 'repo');
  const bin = path.join(base, 'bin');
  const marcas = path.join(base, 'marcas');
  fs.mkdirSync(bin); fs.mkdirSync(marcas);
  const git = (args, cwd) => execFileSync('git', args, { cwd: cwd || repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  execFileSync('git', ['init', '--bare', '-b', 'main', remoto], { encoding: 'utf8', stdio: 'ignore' });
  fs.mkdirSync(repo);
  git(['init', '-b', 'main']);
  git(['config', 'user.email', 'teste@exemplo.invalid']);
  git(['config', 'user.name', 'teste']);
  // árvore mínima com o que o script lê antes do preflight
  fs.writeFileSync(path.join(repo, 'version.txt'), '9.9.9');
  fs.mkdirSync(path.join(repo, 'js'));
  fs.writeFileSync(path.join(repo, 'js', 'store.js'), "window.SCOREPLACE_VERSION = '9.9.9';\n");
  fs.writeFileSync(path.join(repo, 'sw.js'), "var CACHE_NAME = 'scoreplace-v9.9.9';\n");
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.copyFileSync(path.join(RAIZ, 'scripts', 'deploy-hosting.sh'), path.join(repo, 'scripts', 'deploy-hosting.sh'));
  fs.chmodSync(path.join(repo, 'scripts', 'deploy-hosting.sh'), 0o755);
  // gates do preflight que rodam no REPO (não na cópia): version-ahead
  // ⛔ 04/set/2026 — ESTE STUB FALTAVA E DERRUBOU O TESTE INTEIRO. O passo 1.8 do script
  // passou a chamar `scripts/revisar.sh diff` (revisão cruzada), e a árvore mínima daqui só
  // copiava o `deploy-hosting.sh`: o deploy morria em "O REVISOR NÃO APROVOU" ANTES de
  // chegar no preflight, então ② e ③ não mediam mais o que dizem medir. O revisor NÃO é o
  // assunto deste teste — a ORDEM é —, e quem prova que ele vem antes do push é a asserção
  // por fonte em ①. Aqui ele é um stub que aprova, como os outros gates.
  fs.writeFileSync(path.join(repo, 'scripts', 'revisar.sh'), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(repo, 'scripts', 'revisar.sh'), 0o755);
  fs.writeFileSync(path.join(repo, 'scripts', 'check-version-ahead.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(repo, 'scripts', 'check-release-notes.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(repo, 'scripts', 'check-deploy-alignment.js'), 'process.exit(0);\n');
  fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'x', version: '1.0.0', scripts: {} }));
  // node_modules que o script exige encontrar (raiz + subprojeto)
  fs.mkdirSync(path.join(repo, 'node_modules', '@playwright', 'test'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'functions-autodraw', 'node_modules', 'firebase-admin'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'functions-autodraw', 'placeholder.js'), '// só pra o dir existir no archive\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'release de teste']);
  git(['remote', 'add', 'origin', remoto]);
  git(['push', '-q', 'origin', 'HEAD:main']);
  // ⭐ o commit de RELEASE que NÃO pode chegar ao remoto se o preflight reprovar
  fs.writeFileSync(path.join(repo, 'version.txt'), '9.9.9');
  fs.appendFileSync(path.join(repo, 'js', 'store.js'), '// mudança da release\n');
  git(['add', '-A']);
  git(['commit', '-q', '-m', 'commit de release']);
  const shaRelease = git(['rev-parse', 'HEAD']).trim();
  const remotoAntes = execFileSync('git', ['rev-parse', 'main'], { cwd: remoto, encoding: 'utf8' }).trim();

  // binários falsos
  fs.writeFileSync(path.join(bin, 'firebase'),
    '#!/bin/sh\necho "$@" >> ' + JSON.stringify(path.join(marcas, 'firebase.txt')) + '\nexit 0\n');
  fs.writeFileSync(path.join(bin, 'npm'),
    '#!/bin/sh\necho "$@" >> ' + JSON.stringify(path.join(marcas, 'npm.txt')) + '\n' +
    'case "$1" in\n' +
    '  test) exit ' + (preflightPassa ? '0' : '1') + ' ;;\n' +
    '  run) exit 0 ;;\n' +
    '  *) exit 0 ;;\n' +
    'esac\n');
  [path.join(bin, 'firebase'), path.join(bin, 'npm')].forEach((f) => fs.chmodSync(f, 0o755));

  const r = spawnSync('bash', ['scripts/deploy-hosting.sh'], {
    cwd: repo, encoding: 'utf8',
    env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, TMPDIR: base })
  });
  const remotoDepois = execFileSync('git', ['rev-parse', 'main'], { cwd: remoto, encoding: 'utf8' }).trim();
  const chamouFirebase = fs.existsSync(path.join(marcas, 'firebase.txt'))
    ? fs.readFileSync(path.join(marcas, 'firebase.txt'), 'utf8') : '';
  return {
    status: r.status, saida: (r.stdout || '') + (r.stderr || ''),
    remotoAntes, remotoDepois, shaRelease, chamouFirebase,
    limpar: () => { try { fs.rmSync(base, { recursive: true, force: true }); } catch (e) {} }
  };
}

console.log('▸ ② preflight REPROVADO: não empurra e não publica');
{
  const c = cenario(false);
  try {
    ok(c.status !== 0, 'o script sai com erro (' + c.status + ')');
    ok(/PREFLIGHT REPROVOU/.test(c.saida), 'e diz PREFLIGHT REPROVOU');
    eq(c.remotoDepois, c.remotoAntes, '⭐ o remoto NÃO se moveu — o commit de release não subiu');
    ok(c.remotoDepois !== c.shaRelease, 'e o main do remoto não é o commit de release');
    ok(!/deploy --only hosting/.test(c.chamouFirebase),
      '⭐ e o `firebase deploy` NUNCA foi chamado (nada de upload)');
    ok(/nada foi empurrado e nada foi publicado/.test(c.saida), 'a mensagem diz exatamente isso');
  } finally { c.limpar(); }
}

console.log('▸ ③ preflight VERDE: empurra e então publica');
{
  const c = cenario(true);
  try {
    ok(/preflight VERDE/.test(c.saida), 'o preflight passou');
    eq(c.remotoDepois, c.shaRelease, '⭐ o remoto avançou pro commit de release');
    ok(c.remotoDepois !== c.remotoAntes, 'ou seja: o push aconteceu');
    ok(/deploy --only hosting/.test(c.chamouFirebase), '⭐ e só então o upload foi chamado');
  } finally { c.limpar(); }
}

// ── ④ a cópia do preflight é a mesma da publicação, e roda a corrida real ────────────
console.log('▸ ④ a cópia do preflight tem as dependências ligadas e proíbe "pulada"');
{
  const i = sh.indexOf('montar_copia() {');
  const j = sh.indexOf('\n}', i);
  const fn = sh.slice(i, j);
  ok(/git archive HEAD \| tar -x -C "\$DEST"/.test(fn), 'a função extrai por `git archive`');
  ok(/ln -s "\$NM" "\$DEST\/node_modules"/.test(fn), 'liga o node_modules da raiz');
  ok(/ln -s "\$NM_AD" "\$DEST\/functions-autodraw\/node_modules"/.test(fn), 'e o do functions-autodraw');
  ok(/\.deploy-alignment\.json/.test(fn), 'e escreve o carimbo de alinhamento');
  const corrida = fs.readFileSync(path.join(RAIZ, 'functions-autodraw', 'test-corrida-slot-emu.js'), 'utf8');
  ok(/SP_EXIGE_CORRIDA_REAL === '1'/.test(corrida) && /process\.exit\(1\)/.test(corrida),
    '⛔ e com a marca ligada a corrida não pode sair 0 por "pulada"');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
