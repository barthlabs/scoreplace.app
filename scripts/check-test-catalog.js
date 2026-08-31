#!/usr/bin/env node
/* check-test-catalog.js — TODO teste tem que ter um COMANDO que o rode.  (L15.P2)
 *
 * ⛔ O QUE ISTO IMPEDE, medido na L15.P0 sobre a árvore 8341efe2: 603 arquivos de teste no
 * disco, 581 registrados em `tests/run-unit.js` (LISTA À MÃO) e **15 que nenhum comando
 * alcançava**. Entre eles, `functions-autodraw/test-uid-identity.js` estava VERMELHO —
 * 11 de 22 — e ninguém via, porque nada o executava. Um teste que ninguém roda não é
 * cobertura: é um arquivo que dá a impressão de cobertura.
 *
 * ⚠️ E NÃO ADIANTA "REGISTRAR TUDO NO npm test": os de emulador precisam de Firestore
 * (e alguns de Functions e Auth) no ar. Por isso o catálogo tem GRUPOS, cada um com o
 * comando que de fato o roda. O gate não força o grupo — força que o arquivo ESTEJA em
 * algum grupo, com o comando escrito ao lado.
 *
 * ⭐ E ELE SE ALIMENTA DA VERDADE, não de uma segunda lista: os grupos `run-unit`,
 * `rules`, `ext` e `amizade` são lidos de `tests/run-unit.js`, do `package.json` e do
 * `tests/amizade/run.js`. Só o grupo `emulador-manual` é declarado aqui — porque não há
 * comando único que o rode, e é exatamente essa a informação que faltava.
 *
 * Uso:  node scripts/check-test-catalog.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

/* ── Grupo declarado: suítes de emulador que se rodam UMA A UMA ───────────────
 * ⚠️ Cada uma sobe e derruba o próprio emulador, então elas NÃO podem correr em paralelo:
 * as `rules-*` disputam as portas 8098/8099 e TODAS usam o projeto `demo-scoreplace`, ou
 * seja, os dados se misturariam. Rodadas em série, como aqui, não colidem. */
const EMULADOR_MANUAL = {
  'functions/test-backfill-emu.js':
    'firebase emulators:exec --only functions,firestore --project demo-scoreplace "node functions/test-backfill-emu.js"',
  'functions/test-syncroster-emu.js':
    'firebase emulators:exec --only functions,firestore --project demo-scoreplace "node functions/test-syncroster-emu.js"',
  'functions/test-pair-replicate.js':
    'firebase emulators:exec --only firestore --config firebase.emulator.json --project demo-scoreplace "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test-pair-replicate.js"',
  'functions/test-sandbox-replicate.js':
    'firebase emulators:exec --only firestore --config firebase.emulator.json --project demo-scoreplace "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test-sandbox-replicate.js"',
  'functions/test-reminders-emulator.js':
    'firebase emulators:exec --only firestore --config firebase.emulator.json --project demo-scoreplace "FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node functions/test-reminders-emulator.js"',
};

/* ── Grupo declarado: suítes do autodraw que rodam a partir do PRÓPRIO diretório ──
 * ⚠️ Elas fazem `require('./draw-core.js')` com caminho relativo, então `node
 * functions-autodraw/x.js` da raiz funciona, mas o cabeçalho delas manda rodar de dentro.
 * O comando registrado é o que de fato funciona nos dois casos. */
const AUTODRAW_MANUAL = [
  'test-closeround.js', 'test-closeround-authz.js', 'test-drawinitial.js',
  'test-drawround-authz.js', 'test-format2.js', 'test-orphan-uid.js',
  'test-parity-old-vs-new.js', 'test-persist-boundary.js', 'test-uid-identity.js',
].reduce((acc, f) => {
  acc['functions-autodraw/' + f] = 'node functions-autodraw/' + f;
  return acc;
}, {});

/* Testes que NÃO são suíte: fixtures, harnesses e helpers que outras suítes requerem. */
const NAO_SAO_SUITE = new Set([
  'tests/render-harness.js', 'tests/headless.js', 'tests/recorte.js',
  'tests/pilula-ver-mais.js', 'tests/_stub-firestore-http.js',
  'tests/_conta-de-partes-fixture.js', 'tests/concurrency/emu-harness.js',
  'tests/concurrency/emu-harness-views.js',
]);
/* ⚠️ `tests/test-utils.js` SAIU desta lista: ele está em `tests/run-unit.js` e RODA no
 * `npm test` — ou seja, é suíte catalogada, não fixture. Uma isenção que não isenta nada
 * mente sobre por que o arquivo está ali, e some com a informação de que ele é executado. */

/* ── Onde cada grupo é descoberto (a VERDADE, não uma cópia) ─────────────────── */
const catalogo = new Map();
const põe = (arq, grupo, cmd) => { if (!catalogo.has(arq)) catalogo.set(arq, { grupo, cmd }); };

// run-unit: a lista à mão do runner
const runUnit = ler('tests/run-unit.js');
const bloco = runUnit.slice(runUnit.indexOf('const SUITES = ['), runUnit.indexOf('\n];'));
[...bloco.matchAll(/'([^']+\.js)'/g)].forEach((m) => põe(m[1], 'run-unit', 'npm test'));

// scripts do package.json que citam um arquivo diretamente
const scripts = JSON.parse(ler('package.json')).scripts || {};
Object.keys(scripts).forEach((k) => {
  [...String(scripts[k]).matchAll(/(tests\/[A-Za-z0-9_./-]+\.js)/g)]
    .forEach((m) => põe(m[1], k, 'npm run ' + k));
});

// tests/amizade/run.js requer as suítes por nome
const amiz = ler('tests/amizade/run.js');
[...amiz.matchAll(/require\('\.\/([^']+\.test\.js)'\)/g)]
  .forEach((m) => põe('tests/amizade/' + m[1], 'amizade', 'npm run test:amizade'));

// grupos declarados
Object.keys(EMULADOR_MANUAL).forEach((f) => põe(f, 'emulador-manual', EMULADOR_MANUAL[f]));
Object.keys(AUTODRAW_MANUAL).forEach((f) => põe(f, 'autodraw-manual', AUTODRAW_MANUAL[f]));

/* ── O universo real no disco ───────────────────────────────────────────────── */
/* ⛔ UMA VARREDURA SÓ, RECURSIVA NOS TRÊS. A primeira versão deste gate (L15.P2) descia
 * em `tests/` mas lia `functions/` e `functions-autodraw/` só no PRIMEIRO NÍVEL — um
 * `functions/qualquer-pasta/test-x.js` ficaria órfão e o gate diria "completo".
 * ⚠️ Um gate com ponto cego é pior que gate nenhum: ele responde "está tudo catalogado"
 * com a mesma cara nos dois casos, e é justamente essa resposta que faz ninguém procurar.
 *
 * ⭐ E OS DOIS PADRÕES VALEM EM QUALQUER LUGAR: `*.test.js` (convenção de `tests/`) e
 * `test-*.js` (convenção de `functions/`). Restringir o padrão por diretório reabriria a
 * mesma brecha por outro caminho — um `functions/foo/bar.test.js` escaparia.
 * Medido antes de trocar: aceitar os dois em todos os três acrescenta UM arquivo ao
 * universo (`tests/test-utils.js`), que já é suíte registrada no `run-unit.js`.
 *
 * ⛔ `node_modules` fica de fora em TODO nível — `functions/node_modules` sozinho tem
 * milhares de `test-*.js` de dependências, que não são nossos e nunca serão catalogados. */
const RAIZES = ['tests', 'functions', 'functions-autodraw'];
const EH_TESTE = (nome) => /\.test\.js$/.test(nome) || /^test-.*\.js$/.test(nome);

const universo = [];
(function varrer(dir) {
  const abs = path.join(RAIZ, dir);
  if (!fs.existsSync(abs)) return;
  fs.readdirSync(abs, { withFileTypes: true }).forEach((e) => {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (e.name !== 'node_modules') varrer(rel); return; }
    if (EH_TESTE(e.name)) universo.push(rel);
  });
});
RAIZES.forEach((d) => {
  (function varrer(dir) {
    const abs = path.join(RAIZ, dir);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs, { withFileTypes: true }).forEach((e) => {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) { if (e.name !== 'node_modules') varrer(rel); return; }
      if (EH_TESTE(e.name)) universo.push(rel);
    });
  })(d);
});

const orfaos = universo.filter((f) => !catalogo.has(f) && !NAO_SAO_SUITE.has(f));
/* ⚠️ E o inverso também acusa: um arquivo catalogado que foi APAGADO deixa o catálogo
 * mentindo — e um `npm test` verde sobre uma lista com fantasma é pior que nenhum. */
const fantasmas = [...catalogo.keys()].filter((f) => !fs.existsSync(path.join(RAIZ, f)));
/* ⚠️ E a lista de isenções também tem que ser verdade: arquivo que não existe mais, ou
 * que virou suíte catalogada, não pode continuar listado como "não é suíte". */
const isencoesMortas = [...NAO_SAO_SUITE].filter(
  (f) => !fs.existsSync(path.join(RAIZ, f)) || catalogo.has(f));

if (orfaos.length || fantasmas.length || isencoesMortas.length) {
  console.error('✗ check-test-catalog FALHOU:\n');
  if (orfaos.length) {
    console.error('  • ' + orfaos.length + ' teste(s) SEM COMANDO que os execute:');
    orfaos.forEach((f) => console.error('      · ' + f));
    console.error('\n    Um teste que ninguém roda não é cobertura — é um arquivo que');
    console.error('    dá a IMPRESSÃO de cobertura. Foi assim que test-uid-identity.js');
    console.error('    ficou 11/22 vermelho sem ninguém ver (medido na L15.P0).\n');
    console.error('    ESCOLHA UM:');
    console.error('      · headless puro         → registre em tests/run-unit.js (roda no `npm test`)');
    console.error('      · precisa de emulador   → declare em EMULADOR_MANUAL, aqui neste arquivo');
    console.error('      · é do autodraw         → declare em AUTODRAW_MANUAL');
    console.error('      · é fixture/harness     → declare em NAO_SAO_SUITE');
  }
  if (fantasmas.length) {
    console.error('  • ' + fantasmas.length + ' arquivo(s) CATALOGADO(S) que não existem mais:');
    fantasmas.forEach((f) => console.error('      · ' + f));
    console.error('\n    Tire do catálogo (ou do tests/run-unit.js) — catálogo com fantasma mente.');
  }
  if (isencoesMortas.length) {
    console.error('  • ' + isencoesMortas.length + ' isenção(ões) em NAO_SAO_SUITE que não isentam nada:');
    isencoesMortas.forEach((f) => console.error('      · ' + f +
      (catalogo.has(f) ? '  (já é suíte catalogada, roda por: ' + catalogo.get(f).cmd + ')'
                       : '  (não existe mais)')));
    console.error('\n    Tire da lista — isenção que não isenta esconde que o arquivo É executado.');
  }
  process.exitCode = 1;   // ⛔ nunca process.exit(): trunca o stdout já enfileirado
} else {
  const porGrupo = {};
  catalogo.forEach((v) => { porGrupo[v.grupo] = (porGrupo[v.grupo] || 0) + 1; });
  const resumo = Object.keys(porGrupo).sort().map((g) => g + '=' + porGrupo[g]).join(' · ');
  console.log('✓ catálogo de testes completo: ' + universo.length + ' arquivo(s), todos com comando (' + resumo + ')');
}
