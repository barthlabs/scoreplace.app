/* O VENDOR DO autoDraw NÃO FICA VELHO — e a trava que garante isso não pode ser decoração.
 *
 * O QUE ACONTECEU (23/ago/2026, medido). `functions-autodraw/vendor/` é cópia de
 * `js/views/*` feita por `copy-vendor.js`, e quem roda o copy é o PREDEPLOY do
 * `scripts/deploy-functions.sh autodraw`. Entre um deploy e outro o vendor fica velho — e
 * 52 arquivos de teste carregam o servidor por `draw-core.js`, que dá require() no VENDOR,
 * não no fonte. Mudei identity-core.js/bracket-logic.js/bracket-ui.js, rodei `npm test` →
 * 435/435 VERDE; rodei o deploy da CF (que re-sincroniza o vendor) e, com o vendor fresco,
 * 12 suítes quebraram na hora — late-entry-idempotent, late-dupla-pow2-grow, e2e-form-pair,
 * classificatory-phase-sweep, functions-autodraw/test-integrate-late, entre outras. O gate
 * estava verde sobre código que o servidor nem tinha.
 *
 * A ESCALA: nos últimos 45 dias, 737 de 1296 commits (57%) tinham vendor velho. O estado
 * NORMAL do repo era exercitar a cópia errada.
 *
 * O QUE ESTE TESTE GUARDA — as duas metades, porque cada uma sozinha mente:
 *   ① a trava ESTÁ LIGADA no `npm test` e o vendor DESTE repo está em dia. É esta metade
 *      que falha se alguém sujar um arquivo do vendor de propósito (ou esquecer de rodar
 *      o copy depois de mexer em js/views/).
 *   ② a trava DETECTA de verdade — num sandbox, com o SCRIPT REAL (não uma réplica: réplica
 *      é o que deixa suíte verde sobre código revertido). Se ela parar de acusar
 *      divergência, órfão ou lista ilegível, a metade ① vira falso-verde permanente.
 *
 * ⚠️ O sandbox NUNCA toca o vendor de verdade — ele é gerado; sujar à mão é proibido.
 *
 * Roda com: node tests/vendor-do-autodraw-nao-fica-velho.test.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const TRAVA = path.join(RAIZ, 'scripts', 'check-vendor-fresh.js');
const COPY_VENDOR = path.join(RAIZ, 'functions-autodraw', 'copy-vendor.js');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}

function rodar(root) {
  const r = spawnSync(process.execPath, [TRAVA, '--root', root], { encoding: 'utf8' });
  return { status: r.status, saida: (r.stdout || '') + (r.stderr || '') };
}

// ─────────────────────────────────────────────────────────────────────────────
// ① A TRAVA ESTÁ LIGADA, E O VENDOR DESTE REPO ESTÁ EM DIA
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n① a trava está ligada e o vendor deste repo está em dia');

const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
ok(/check-vendor-fresh\.js/.test(pkg.scripts.test),
  'package.json: o script `test` chama scripts/check-vendor-fresh.js (senão a trava existe e ninguém roda)');
const iTrava = pkg.scripts.test.indexOf('check-vendor-fresh.js');
const iSuites = pkg.scripts.test.indexOf('tests/run-unit.js');
ok(iTrava !== -1 && iSuites !== -1 && iTrava < iSuites,
  'a trava roda ANTES das suítes — o erro aparece no topo, não soterrado sob 400 suítes');

const real = rodar(RAIZ);
ok(real.status === 0,
  'o vendor está idêntico a js/views/ neste checkout' +
  (real.status === 0 ? '' : '\n' + real.saida.split('\n').map((l) => '      │ ' + l).join('\n')));

// ─────────────────────────────────────────────────────────────────────────────
// ② A TRAVA DETECTA DE VERDADE — sandbox, script REAL
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n② a trava detecta de verdade (sandbox com o script real)');

const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-vendor-'));

// O sandbox carrega o copy-vendor.js REAL — então a leitura da lista `const FILES = [...]`
// é exercitada no formato de verdade, com os comentários de verdade entre os nomes.
function montarSandbox() {
  fs.rmSync(SB, { recursive: true, force: true });
  fs.mkdirSync(path.join(SB, 'js', 'views'), { recursive: true });
  fs.mkdirSync(path.join(SB, 'functions-autodraw', 'vendor'), { recursive: true });
  fs.copyFileSync(COPY_VENDOR, path.join(SB, 'functions-autodraw', 'copy-vendor.js'));
  const nomes = listaDoCopyVendor();
  for (const n of nomes) {
    const conteudo = '// stub de ' + n + '\nwindow._x = 1;\n';
    fs.writeFileSync(path.join(SB, 'js', 'views', n), conteudo);
    fs.writeFileSync(path.join(SB, 'functions-autodraw', 'vendor', n), conteudo);
  }
  return nomes;
}
function listaDoCopyVendor() {
  const bloco = fs.readFileSync(COPY_VENDOR, 'utf8').match(/const\s+FILES\s*=\s*\[([\s\S]*?)^\];/m);
  const nomes = [];
  for (const linha of bloco[1].split('\n')) {
    for (const m of linha.replace(/\/\/.*$/, '').matchAll(/'([^']+)'/g)) nomes.push(m[1]);
  }
  return nomes;
}

const NOMES = montarSandbox();
ok(NOMES.length >= 15, 'a lista do copy-vendor.js foi lida (' + NOMES.length + ' arquivos)');
ok(rodar(SB).status === 0, 'sandbox espelhado → passa');

// (a) vendor velho: o fonte andou e a cópia ficou pra trás. É o caso real.
montarSandbox();
const ALVO = 'bracket-logic.js';
fs.appendFileSync(path.join(SB, 'js', 'views', ALVO), '\nwindow._novidadeQueOServidorPrecisa = 1;\n');
let r = rodar(SB);
ok(r.status === 1, 'fonte mudou e vendor não → sai 1');
ok(r.saida.includes(ALVO), 'a saída DIZ qual arquivo divergiu (' + ALVO + ')');
ok(r.saida.includes('node functions-autodraw/copy-vendor.js'), 'a saída dá a receita do conserto');

// (b) a trava NÃO pode "consertar" sozinha. Dar require() no copy-vendor.js EXECUTA a
//     cópia — a trava sairia verde e o vendor commitado seguiria velho. Ela lê por texto.
ok(fs.readFileSync(path.join(SB, 'functions-autodraw', 'vendor', ALVO), 'utf8')
   !== fs.readFileSync(path.join(SB, 'js', 'views', ALVO), 'utf8'),
  'conferir NÃO copia — a trava acusa, ela não conserta escondido');

// (c) arquivo da lista que nunca chegou ao vendor/.
montarSandbox();
fs.rmSync(path.join(SB, 'functions-autodraw', 'vendor', ALVO));
r = rodar(SB);
ok(r.status === 1 && r.saida.includes(ALVO), 'arquivo da lista ausente do vendor/ → sai 1');

// (d) órfão: saiu da lista, ficou no vendor/. O copy só copia, nunca apaga — se o
//     draw-core ainda o carrega, o servidor roda um arquivo que o app já não tem.
montarSandbox();
fs.writeFileSync(path.join(SB, 'functions-autodraw', 'vendor', 'saiu-da-lista.js'), '// sobra\n');
r = rodar(SB);
ok(r.status === 1 && r.saida.includes('saiu-da-lista.js'), 'órfão no vendor/ → sai 1');

// (e) lista ilegível: renomear/reformatar o `const FILES` faria a trava conferir ZERO
//     arquivo e sair verde. Trava que não sabe o que confere é decoração.
montarSandbox();
const cv = path.join(SB, 'functions-autodraw', 'copy-vendor.js');
fs.writeFileSync(cv, fs.readFileSync(cv, 'utf8').replace('const FILES = [', 'const ARQUIVOS = ['));
r = rodar(SB);
ok(r.status === 1, 'lista `const FILES` ilegível → sai 1 (não sai verde conferindo nada)');

// (f) fonte listada que não existe: o copy-vendor morreria no deploy; a trava avisa antes.
montarSandbox();
fs.rmSync(path.join(SB, 'js', 'views', ALVO));
r = rodar(SB);
ok(r.status === 1 && r.saida.includes(ALVO), 'fonte da lista ausente em js/views/ → sai 1');

fs.rmSync(SB, { recursive: true, force: true });

console.log('\n' + (falhas ? '❌ ' + falhas + '/' + testes + ' falharam' : '✅ ' + testes + '/' + testes + ' ok'));
process.exit(falhas ? 1 : 0);
