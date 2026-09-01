/* deploy-liga-firebase-admin.test.js — "PULADA" NÃO É APROVAÇÃO.
 * node tests/deploy-liga-firebase-admin.test.js
 *
 * O QUE ACONTECEU (medido em 01/set/2026, na publicação da 2.1.81):
 * `functions-autodraw/test-corrida-slot-emu.js` é o único gate que prova a trava manual ×
 * automático no MECANISMO — duas transações concorrentes no Firestore Emulator, com o abort
 * e o retry do servidor. Ele foi registrado no `npm test`, que é o `hosting.predeploy`.
 * Só que o predeploy roda numa CÓPIA extraída por `git archive`, e
 * `functions-autodraw/node_modules` é gitignored: lá o `firebase-admin` não existe. O teste
 * se declarou PULADA, saiu 0, e a release subiu com a prova de concorrência NÃO EXECUTADA.
 * ⛔ Um gate que se declara pulado não é um gate.
 *
 * O que este arquivo trava, por FONTE (não precisa publicar nada pra conferir):
 *  ① o deploy LIGA o `firebase-admin` dentro da cópia extraída, como já fazia com a raiz;
 *  ② se a dependência não existir no ambiente-fonte, o deploy FALHA — e falha ANTES de
 *     qualquer upload (ou seja, antes do `firebase deploy`);
 *  ③ o deploy marca o caminho (`SP_EXIGE_CORRIDA_REAL`) e, com essa marca, o teste da
 *     corrida NÃO pode sair 0 por "pulada";
 *  ④ a checagem acontece DEPOIS do push do main e ANTES do upload — a ordem importa: falhar
 *     barato antes de publicar é o desenho do script.
 * E, de verdade: ⑤ uma cópia `git archive` com a dependência ligada EXECUTA a corrida real.
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
const teste = fs.readFileSync(path.join(RAIZ, 'functions-autodraw', 'test-corrida-slot-emu.js'), 'utf8');

// ── ① o deploy liga a dependência ────────────────────────────────────────────────────
console.log('\n▸ ① o deploy liga o firebase-admin dentro da cópia extraída');
{
  ok(/ln -s "\$NM_AD" "\$DEST\/functions-autodraw\/node_modules"/.test(sh),
    'faz o symlink de functions-autodraw/node_modules na cópia');
  ok(/functions-autodraw\/node_modules\/firebase-admin/.test(sh),
    'e procura o firebase-admin de verdade antes de ligar');
  ok(/ln -s "\$NM" "\$DEST\/node_modules"/.test(sh),
    'sem perder o symlink da raiz que já existia');
}

// ── ② falta a dependência → o deploy morre ──────────────────────────────────────────
console.log('▸ ② sem a dependência no ambiente-fonte, o deploy FALHA');
{
  const i = sh.indexOf('NM_AD=""');
  const bloco = sh.slice(i, i + 1400);
  ok(/if \[\[ -z "\$NM_AD" \]\]; then/.test(bloco), 'testa a ausência');
  ok(/exit 1/.test(bloco), 'e sai 1 — não segue');
  ok(/firebase-admin NÃO existe no ambiente-fonte/.test(bloco), 'dizendo exatamente o que faltou');
  ok(/npm install/.test(bloco), 'e qual é o conserto');
}

// ── ③ e ④ a marca e a ORDEM ─────────────────────────────────────────────────────────
console.log('▸ ③ o deploy marca o caminho e a corrida deixa de poder ser "pulada"');
{
  ok(/export SP_EXIGE_CORRIDA_REAL=1/.test(sh), 'o deploy exporta SP_EXIGE_CORRIDA_REAL=1');
  ok(/SP_EXIGE_CORRIDA_REAL === '1'/.test(teste), 'e o teste da corrida lê essa marca');
  const j = teste.indexOf('if (!ADMIN) {');
  const ramo = teste.slice(j, j + 1200);
  ok(/if \(EXIGE\)/.test(ramo), 'com a marca ligada, o ramo do "pulado" muda');
  ok(/process\.exit\(1\)/.test(ramo), '⭐ e sai 1 — "pulada" vira VERMELHO no caminho de deploy');
}

console.log('▸ ④ a checagem vem ANTES do upload (e depois do push do main)');
{
  const pos = {
    push: sh.indexOf('git push origin "HEAD:main"'),
    check: sh.indexOf('firebase-admin NÃO existe no ambiente-fonte'),
    link: sh.indexOf('ln -s "$NM_AD"'),
    // ⚠️ o COMANDO, não a menção: o cabeçalho do script documenta a linha 6 do fluxo com o
    // mesmo texto, e `indexOf` pegava o comentário — dando "antes" pra tudo.
    deploy: sh.indexOf('firebase deploy --only hosting --project')
  };
  ok(pos.push > 0 && pos.check > 0 && pos.link > 0 && pos.deploy > 0, 'achei os quatro marcos no script');
  ok(pos.check < pos.deploy, '⭐ a checagem acontece ANTES do `firebase deploy` (nada é publicado)');
  ok(pos.link < pos.deploy, 'e o symlink também');
  ok(pos.push < pos.check, 'e depois do alinhamento do main, que é o desenho do script');
}

// ── ⑤ a prova de verdade: cópia git archive + dependência ligada roda a corrida ──────
console.log('▸ ⑤ cópia `git archive` COM a dependência ligada executa a corrida real');
{
  const admin = path.join(RAIZ, 'functions-autodraw', 'node_modules');
  const ehRepo = fs.existsSync(path.join(RAIZ, '.git'));
  if (!ehRepo) {
    /* ⭐ AQUI DENTRO É A PRÓPRIA CÓPIA DO PREDEPLOY (extraída por `git archive`, sem `.git`).
     * Refazer o ensaio seria impossível — e desnecessário: o que este teste quer provar é
     * que a dependência CHEGA nesta cópia, e isso dá pra afirmar olhando embaixo do pé.
     * É a asserção mais forte que existe neste contexto: se ela passar, a corrida rodou de
     * verdade nesta mesma execução do predeploy. */
    ok(fs.existsSync(path.join(admin, 'firebase-admin')),
      '⭐ estamos DENTRO da cópia do predeploy e o firebase-admin está ligado aqui');
    ok(fs.existsSync(path.join(RAIZ, 'functions-autodraw', 'test-corrida-slot-emu.js')),
      'e o teste da corrida veio junto na cópia');
    ok(process.env.SP_EXIGE_CORRIDA_REAL === '1',
      '⛔ e a marca que proíbe "pulada" está ligada nesta execução');
  } else if (!fs.existsSync(path.join(admin, 'firebase-admin'))) {
    console.error('  ✗ firebase-admin ausente nesta árvore — este teste EXIGE a dependência');
    console.error('    (é exatamente o que o deploy passou a exigir). CONSERTO: cd functions-autodraw && npm install');
    fail++;
  } else {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'spdeploygate-'));
    try {
      // reproduz o que o deploy faz: extrai o HEAD e liga os node_modules
      const tar = execFileSync('bash', ['-c',
        'git archive HEAD | tar -x -C ' + JSON.stringify(dest)], { cwd: RAIZ, encoding: 'utf8' });
      ok(fs.existsSync(path.join(dest, 'functions-autodraw', 'test-corrida-slot-emu.js')),
        'a cópia extraída tem o teste da corrida');
      ok(!fs.existsSync(path.join(dest, 'functions-autodraw', 'node_modules')),
        '⛔ e NÃO tem node_modules (é o gitignore — a causa do "PULADA" da 2.1.81)');
      fs.symlinkSync(admin, path.join(dest, 'functions-autodraw', 'node_modules'));

      // com a marca do deploy: nada de "pulada"
      const r = spawnSync(process.execPath, ['functions-autodraw/test-corrida-slot-emu.js'], {
        cwd: dest, encoding: 'utf8',
        env: Object.assign({}, process.env, { SP_EXIGE_CORRIDA_REAL: '1',
          PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH })
      });
      const saida = (r.stdout || '') + (r.stderr || '');
      eq(r.status, 0, '⭐ a corrida RODOU na cópia extraída e passou');
      ok(!/PULADA/.test(saida), '⛔ e não houve "PULADA" nenhuma');
      ok(/12 corridas disputadas de verdade no emulador/.test(saida),
        '⭐ com as 12 disputas reais no Emulator');
      ok(/✓ 31 asserções/.test(saida), '⭐ e as 31 asserções');
      ok(/re-execução de transação de verdade em 12\/12/.test(saida),
        'e com abort+retry do servidor em 12/12 — a corrida foi real');
    } finally {
      try { fs.rmSync(dest, { recursive: true, force: true }); } catch (e) { /* melhor esforço */ }
    }
  }
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
process.exit(fail ? 1 : 0);
