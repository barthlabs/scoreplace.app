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
console.log('\n▸ ① preflight e integridade vêm antes do Hosting; backup vem depois');
{
  const pos = {
    cache: sh.indexOf('TRAVA DURA: O CACHE DO SW'),
    preflight: sh.indexOf('PREFLIGHT: TODOS OS GATES ANTES DE TOCAR NO'),
    npmtest: sh.indexOf('&& npm test'),
    revisao: sh.indexOf('revisão cruzada sobre origin/main..HEAD'),
    // ⚠️ MARCO, não o texto do comando.
    push: sh.indexOf('# MARCO: push-do-main'),
    deploy: sh.indexOf('firebase deploy --only hosting --project')
  };
  Object.keys(pos).forEach((k) => ok(pos[k] > 0, 'achei o marco `' + k + '` no script'));
  ok(pos.preflight < pos.deploy, '⭐ o preflight vem ANTES do Hosting');
  ok(pos.npmtest < pos.deploy, '⭐ e o `npm test` do preflight também');
  ok(pos.revisao < pos.deploy, '⭐ a revisão Claude também vem ANTES do Hosting');
  ok(pos.cache < pos.deploy, 'a trava do CACHE_NAME também vem antes do Hosting');
  /* ⛔ INVERTIDO EM 22/set/2026, e é o conserto desta leva. A asserção antiga exigia
   * `Hosting antes do push` — e era o DEFEITO virado teste: enquanto o push morava depois do
   * upload, uma falha de rede deixava o AR À FRENTE do main. Medido: ar 2.3.85 com
   * origin/main em 2.3.83, no repositório que este script deveria manter alinhado.
   * A ordem certa é portões → push → upload, e as DUAS bordas valem ao mesmo tempo:
   * nada de release entra no main sem gate (a invariante de 01/set, provada abaixo), E nada
   * é publicado antes de o main descrever aquilo (esta linha). */
  ok(pos.push < pos.deploy, '⭐ o main é empurrado ANTES do upload (o main descreve o ar)');
  ok(/SP_EXIGE_CORRIDA_REAL=1/.test(sh.slice(pos.preflight, pos.deploy)),
    '⛔ e o preflight proíbe "pulada" na corrida do sorteio');
  ok(/exit 1/.test(sh.slice(pos.preflight, pos.push)), 'e ele encerra em caso de falha');
  /* ⛔ O QUE IMPORTA MUDOU em 22/set/2026. Antes bastava contar as chamadas. Agora o ponto
   * é OUTRO: com o push acontecendo ANTES do upload, `git archive HEAD` abriria a janela de
   * um commit local mover o HEAD entre a confirmação remota e a montagem — o `main` remoto
   * apontando para um SHA e o pacote publicado contendo outro, com tudo dizendo que deu
   * certo. Toda chamada tem de passar a identidade CONGELADA. */
  const chamadas = sh.match(/^montar_copia .*/gm) || [];
  ok(chamadas.length >= 2, 'a cópia é montada pela MESMA função (preflight e publicação)');
  ok(chamadas.every((c) => c.indexOf('"$COMMIT"') !== -1),
    '⭐ TODA montagem arquiva o SHA congelado, nunca um HEAD móvel');
}

/* ── ② e ③ · O SCRIPT RODANDO DE VERDADE, contra repo e remoto temporários ────────────
 * `firebase` e `npm` falsos no PATH: o primeiro grava que foi chamado (seria o upload), o
 * segundo decide se o preflight passa ou reprova. Nada real é publicado nem empurrado. */
function cenario(opcoes) {
  /* Aceita `true/false` (uso antigo) ou um objeto de opções. As opções abrem, por ORDEM do
   * teste e não por tempo, as janelas de corrida que o desenho tem de fechar. */
  const o = (typeof opcoes === 'object' && opcoes !== null) ? opcoes : { preflightPassa: !!opcoes };
  const preflightPassa = o.preflightPassa !== false;
  const GIT_REAL = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
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
  /* ⭐ MARCADOR RASTREADO — a prova do ARTEFATO, independente do carimbo.
   * O carimbo de alinhamento é escrito pelo PRÓPRIO script: um script que arquivasse o
   * commit errado e carimbasse o certo passaria no teste. Este arquivo só chega à cópia
   * publicada pelo `git archive`, então ele responde "qual commit foi de fato empacotado". */
  fs.writeFileSync(path.join(repo, 'js', 'marcador-release.txt'), 'marcador=confirmado\n');
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
  fs.writeFileSync(path.join(repo, 'scripts', 'check-release-version-fresh.js'), 'process.exit(0);\n');
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
  // ⚠️ O `firebase` falso precisa RESPONDER à checagem de sessão como o real responde:
  // `projects:list --json` imprime o JSON com "status": "success". (E o real ainda sai com
  // código 2 nesse comando — por isso o script captura a saída e examina o texto.)
  /* ⭐ O `firebase` falso registra O QUÊ recebeu, não só QUE foi chamado. É isso que
   * transforma "o upload aconteceu" em "o upload levou exatamente o commit que o remoto
   * confirma". Ele lê o marcador DENTRO da cópia publicada ($PWD). */
  fs.writeFileSync(path.join(bin, 'firebase'),
    '#!/bin/sh\n' +
    'echo "$@" >> ' + JSON.stringify(path.join(marcas, 'firebase.txt')) + '\n' +
    'case "$*" in *"deploy --only hosting"*)\n' +
    '  cat js/marcador-release.txt >> ' + JSON.stringify(path.join(marcas, 'publicado.txt')) + ' 2>/dev/null\n' +
    ';; esac\n' +
    'case "$*" in\n' +
    '  *"projects:list"*) echo \'{ "status": "success", "result": [] }\'; exit 2;;\n' +
    'esac\n' +
    'exit 0\n');
  /* `curl` por CONTAGEM de chamadas e `sleep` SEM espera: assim "o ar não alcança a versão"
   * é determinístico e roda em segundos, medindo a lógica e não o relógio. */
  fs.writeFileSync(path.join(bin, 'curl'), o.arNuncaConfirma
    ? '#!/bin/sh\necho 0.0.0\n'
    : '#!/bin/sh\necho 9.9.9\n');
  fs.writeFileSync(path.join(bin, 'sleep'), '#!/bin/sh\nexit 0\n');

  /* ── O `git` EMBRULHADO — abre as janelas de corrida no instante exato ──────────────
   * Delega tudo para o git real, menos no momento combinado. Avançar o remoto é feito por
   * `commit-tree` + `update-ref` dentro do bare: cria um DESCENDENTE do que está lá. */
  const avancaRemoto =
    'T=$(' + GIT_REAL + ' --git-dir=' + JSON.stringify(remoto) + ' rev-parse main^{tree})\n' +
    'C=$(echo intruso | GIT_AUTHOR_NAME=i GIT_AUTHOR_EMAIL=i@i GIT_COMMITTER_NAME=i GIT_COMMITTER_EMAIL=i@i ' +
    GIT_REAL + ' --git-dir=' + JSON.stringify(remoto) + ' commit-tree $T -p main)\n' +
    GIT_REAL + ' --git-dir=' + JSON.stringify(remoto) + ' update-ref refs/heads/main $C\n';
  const criaCommitLocal =
    'echo "marcador=head-movel" > ' + JSON.stringify(path.join(repo, 'js', 'marcador-release.txt')) + '\n' +
    GIT_REAL + ' -C ' + JSON.stringify(repo) + ' add -A >/dev/null 2>&1\n' +
    GIT_REAL + ' -C ' + JSON.stringify(repo) + ' commit -q -m "head andou" >/dev/null 2>&1\n';

  let wrapper = '#!/bin/sh\n';
  if (o.corrida === 'antes-do-push') {
    wrapper += 'case "$*" in *" push "*|push*) ' + avancaRemoto + ' ;; esac\n';
    wrapper += 'exec ' + GIT_REAL + ' "$@"\n';
  } else if (o.corrida === 'apos-push') {
    wrapper += 'case "$*" in *" push "*|push*)\n' +
               '  ' + GIT_REAL + ' "$@"; RC=$?\n' +
               '  if [ $RC -eq 0 ]; then ' + avancaRemoto + ' fi\n' +
               '  exit $RC ;;\nesac\n';
    wrapper += 'exec ' + GIT_REAL + ' "$@"\n';
  } else if (o.corrida === 'apos-confirmacao') {
    wrapper += 'case "$*" in *ls-remote*)\n' +
               '  ' + GIT_REAL + ' "$@"; RC=$?\n' +
               '  ' + criaCommitLocal +
               '  exit $RC ;;\nesac\n';
    wrapper += 'exec ' + GIT_REAL + ' "$@"\n';
  } else if (o.corrida === 'fetch-falha') {
    wrapper += 'case "$*" in *fetch*) exit 1 ;; esac\n';
    wrapper += 'exec ' + GIT_REAL + ' "$@"\n';
  } else {
    wrapper += 'exec ' + GIT_REAL + ' "$@"\n';
  }
  if (o.corrida) {
    fs.writeFileSync(path.join(bin, 'git'), wrapper);
    fs.chmodSync(path.join(bin, 'git'), 0o755);
  }
  fs.writeFileSync(path.join(bin, 'npm'),
    '#!/bin/sh\necho "$@" >> ' + JSON.stringify(path.join(marcas, 'npm.txt')) + '\n' +
    'case "$1" in\n' +
    '  test) exit ' + (preflightPassa ? '0' : '1') + ' ;;\n' +
    '  run) exit 0 ;;\n' +
    '  *) exit 0 ;;\n' +
    'esac\n');
  [path.join(bin, 'firebase'), path.join(bin, 'curl'), path.join(bin, 'npm'), path.join(bin, 'sleep')]
    .forEach((f) => fs.chmodSync(f, 0o755));

  // Topologias deliberadas, montadas ANTES de rodar o script.
  if (o.remotoAdiantado) {
    /* remoto avança para um DESCENDENTE do commit local ⇒ publicar aqui rebaixaria o ar.
     * ⚠️ O commit local precisa ESTAR no remoto antes, senão isto vira divergência (os dois
     * lados com commit próprio) e o teste mediria o quarto estado em vez do terceiro. */
    git(['push', '-q', 'origin', 'HEAD:main']);
    const t = execFileSync('git', ['--git-dir=' + remoto, 'rev-parse', 'main^{tree}'], { encoding: 'utf8' }).trim();
    const c2 = execFileSync('git', ['--git-dir=' + remoto, 'commit-tree', t, '-p', 'main'], {
      encoding: 'utf8', input: 'mais novo que o local\n',
      env: Object.assign({}, process.env, { GIT_AUTHOR_NAME: 'i', GIT_AUTHOR_EMAIL: 'i@i', GIT_COMMITTER_NAME: 'i', GIT_COMMITTER_EMAIL: 'i@i' })
    }).trim();
    execFileSync('git', ['--git-dir=' + remoto, 'update-ref', 'refs/heads/main', c2]);
  }
  if (o.localDefasado) {
    /* O remoto anda, o HEAD local passa a DESCENDER dele, e a referência de tracking é
     * deixada VELHA de propósito. É o caso que separa "cópia local defasada" (normal, tem
     * de publicar) de "divergência" (tem de travar). */
    const velha = execFileSync('git', ['-C', repo, 'rev-parse', 'refs/remotes/origin/main'], { encoding: 'utf8' }).trim();
    git(['push', '-q', 'origin', 'HEAD:main']);
    fs.appendFileSync(path.join(repo, 'js', 'store.js'), '// mais uma\n');
    git(['add', '-A']); git(['commit', '-q', '-m', 'em cima do remoto']);
    git(['update-ref', 'refs/remotes/origin/main', velha]);
  }

  // ⚠️ recomputadas DEPOIS das topologias deliberadas — antes delas o HEAD/remoto mudam.
  const shaRelease2 = git(['rev-parse', 'HEAD']).trim();
  const remotoAntes2 = execFileSync('git', ['rev-parse', 'main'], { cwd: remoto, encoding: 'utf8' }).trim();

  const r = spawnSync('bash', o.dryRun ? ['scripts/deploy-hosting.sh', '--dry-run'] : ['scripts/deploy-hosting.sh'], {
    cwd: repo, encoding: 'utf8',
    env: Object.assign({}, process.env, { PATH: bin + ':' + process.env.PATH, TMPDIR: base })
  });
  const remotoDepois = execFileSync('git', ['rev-parse', 'main'], { cwd: remoto, encoding: 'utf8' }).trim();
  const chamouFirebase = fs.existsSync(path.join(marcas, 'firebase.txt'))
    ? fs.readFileSync(path.join(marcas, 'firebase.txt'), 'utf8') : '';
  const publicado = fs.existsSync(path.join(marcas, 'publicado.txt'))
    ? fs.readFileSync(path.join(marcas, 'publicado.txt'), 'utf8') : '';
  return {
    status: r.status, saida: (r.stdout || '') + (r.stderr || ''),
    remotoAntes: remotoAntes2, remotoDepois, shaRelease: shaRelease2, chamouFirebase, publicado,
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

console.log('▸ ③ preflight VERDE: publica e então atualiza backup');
{
  const c = cenario(true);
  try {
    ok(/preflight VERDE/.test(c.saida), 'o preflight passou');
    ok(/deploy --only hosting/.test(c.chamouFirebase), '⭐ o Hosting foi chamado');
    eq(c.remotoDepois, c.shaRelease, '⭐ o backup remoto avançou depois do Hosting');
    ok(c.remotoDepois !== c.remotoAntes, 'ou seja: o push de backup aconteceu');
  } finally { c.limpar(); }
}

/* ── ⑤ AS JANELAS DE CORRIDA E AS BORDAS DA NOVA ORDEM ───────────────────────────────
 * Tudo aqui nasceu do conserto de 22/set/2026, quando o push saiu de DEPOIS do upload para
 * ANTES dele. Cada cenário fecha uma janela concreta; nenhum depende de tempo. */

console.log('\n▸ ⑤ o ensaio não encosta no remoto');
{
  const c = cenario({ preflightPassa: true, dryRun: true });
  try {
    eq(c.remotoDepois, c.remotoAntes, '⭐ `--dry-run` deixa o remoto INALTERADO');
    ok(!/deploy --only hosting/.test(c.chamouFirebase), 'e não chama o upload');
    ok(/nada foi empurrado e nada foi publicado/.test(c.saida), 'e diz que não empurrou nem publicou');
  } finally { c.limpar(); }
}

console.log('▸ ⑤b o `fetch` falha ⇒ não se decide por referência velha');
{
  const c = cenario({ preflightPassa: true, corrida: 'fetch-falha' });
  try {
    ok(c.status !== 0, 'o script sai com erro');
    ok(/não consegui atualizar origin\/main/.test(c.saida),
      '⭐ e diz que não conseguiu atualizar — sem base fresca não se publica');
    ok(!/deploy --only hosting/.test(c.chamouFirebase), 'e não chama o upload');
    eq(c.remotoDepois, c.remotoAntes, 'e o remoto não se move');
  } finally { c.limpar(); }
}

console.log('▸ ⑥ remoto avança ANTES do push ⇒ o lease recusa e nada é publicado');
{
  const c = cenario({ preflightPassa: true, corrida: 'antes-do-push' });
  try {
    ok(c.status !== 0, 'o script sai com erro');
    ok(/push do main foi RECUSADO/.test(c.saida), 'e diz que o push foi recusado');
    ok(!/deploy --only hosting/.test(c.chamouFirebase),
      '⭐ sem push não há upload — o `firebase deploy` NÃO foi chamado');
    ok(c.remotoDepois !== c.shaRelease, 'e o remoto não recebeu o commit de release');
  } finally { c.limpar(); }
}

console.log('▸ ⑦ remoto avança APÓS o push, antes da confirmação ⇒ divergência pós-push');
{
  const c = cenario({ preflightPassa: true, corrida: 'apos-push' });
  try {
    ok(c.status !== 0, 'o script sai com erro');
    ok(/DIVERG[ÊE]NCIA P[ÓO]S-PUSH/.test(c.saida),
      '⭐ e a mensagem é de divergência PÓS-PUSH, distinta da recusa do lease');
    ok(!/push do main foi RECUSADO/.test(c.saida),
      '⛔ não se confunde com o lease: ali ninguém tocou no ar; aqui o commit ENTROU e foi ultrapassado');
    ok(!/deploy --only hosting/.test(c.chamouFirebase), 'e o upload NÃO acontece');
  } finally { c.limpar(); }
}

console.log('▸ ⑧ HEAD anda depois da confirmação ⇒ publica o SHA CONFIRMADO, não o novo');
{
  const c = cenario({ preflightPassa: true, corrida: 'apos-confirmacao' });
  try {
    ok(/deploy --only hosting/.test(c.chamouFirebase), 'o upload aconteceu');
    ok(/marcador=confirmado/.test(c.publicado),
      '⭐ e o pacote publicado é o do SHA CONFIRMADO no remoto');
    ok(!/marcador=head-movel/.test(c.publicado),
      '⛔ o commit que moveu o HEAD depois da confirmação NÃO foi ao ar');
  } finally { c.limpar(); }
}

console.log('▸ ⑨ o ar não alcança a versão ⇒ reconciliar, sem anunciar sucesso');
{
  const c = cenario({ preflightPassa: true, arNuncaConfirma: true });
  try {
    ok(c.status !== 0, 'o script sai com erro');
    ok(/upload N[ÃA]O foi confirmado/.test(c.saida), 'e diz que o upload não foi confirmado');
    ok(/[àa] frente do ar/.test(c.saida),
      '⭐ e explica que o main ficou à frente do ar — o lado seguro, ninguém rebaixado');
    ok(!/✓ NO AR/.test(c.saida), '⛔ e NÃO anuncia sucesso');
  } finally { c.limpar(); }
}

console.log('▸ ⑩ remoto À FRENTE do HEAD ⇒ aborta (publicar rebaixaria o ar)');
{
  const c = cenario({ preflightPassa: true, remotoAdiantado: true });
  try {
    ok(c.status !== 0, 'o script sai com erro');
    ok(/À FRENTE deste commit|A FRENTE deste commit/.test(c.saida),
      '⭐ e diz que o remoto está à frente');
    ok(!/deploy --only hosting/.test(c.chamouFirebase),
      '⛔ nada é publicado — era este o caso que dizia "já contém este commit" e publicava o velho');
  } finally { c.limpar(); }
}

console.log('▸ ⑪ cópia local DEFASADA (mas sem divergir) ⇒ publica normalmente');
{
  const c = cenario({ preflightPassa: true, localDefasado: true });
  try {
    ok(/deploy --only hosting/.test(c.chamouFirebase),
      '⭐ referência local velha NÃO trava: o fetch bloqueante a renova e a BASE vem de lá');
    eq(c.remotoDepois, c.shaRelease, 'e o remoto recebe o commit');
  } finally { c.limpar(); }
}

// ── ④ a cópia do preflight é a mesma da publicação, e roda a corrida real ────────────
console.log('▸ ④ a cópia do preflight tem as dependências ligadas e proíbe "pulada"');
{
  const i = sh.indexOf('montar_copia() {');
  const j = sh.indexOf('\n}', i);
  const fn = sh.slice(i, j);
  ok(/git archive "\$REF" \| tar -x -C "\$DEST"/.test(fn), 'a função extrai por `git archive`');
  ok(!/git archive HEAD/.test(fn),
    '⭐ e NÃO por `HEAD`: a referência é argumento, porque HEAD se move entre a confirmação e a montagem');
  ok(/REF="\$\{2:\?/.test(fn), 'e a referência é OBRIGATÓRIA — esquecê-la falha alto, não vira HEAD');
  ok(/ln -s "\$NM" "\$DEST\/node_modules"/.test(fn), 'liga o node_modules da raiz');
  ok(/ln -s "\$NM_AD" "\$DEST\/functions-autodraw\/node_modules"/.test(fn), 'e o do functions-autodraw');
  ok(/\.deploy-alignment\.json/.test(fn), 'e escreve o carimbo de alinhamento');
  const corrida = fs.readFileSync(path.join(RAIZ, 'functions-autodraw', 'test-corrida-slot-emu.js'), 'utf8');
  ok(/SP_EXIGE_CORRIDA_REAL === '1'/.test(corrida) && /process\.exit\(1\)/.test(corrida),
    '⛔ e com a marca ligada a corrida não pode sair 0 por "pulada"');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
