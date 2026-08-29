/* TODO JS QUE VAI AO AR PRECISA PARSEAR
 * node tests/todo-js-que-vai-ao-ar-parseia.test.js
 *
 * ⛔ POR QUE EXISTE: em 28/ago/2026 eu quebrei `js/release-notes.js` com uma barra invertida
 * solta no meio de uma string — e a suíte de 547 casos passou VERDE. Nenhum teste faz parse
 * dos arquivos que o navegador vai carregar; eles leem o fonte como TEXTO (regex) ou
 * recortam funções soltas. Arquivo que ninguém `require` nem executa nunca é parseado.
 *
 * ⚠️ E o estrago desse tipo de erro não é o arquivo: é a TELA. Um `<script>` que não
 * parseia não define nada, e o app fica sem aquela camada inteira — o mesmo formato do
 * incidente da CRASE em template literal ([[feedback_crase_em_template_literal_derruba_a_tela]]).
 *
 * ⛔ O QUE ELE NÃO PROMETE: `node --check` pega erro de SINTAXE, não erro de escopo nem de
 * lógica. Símbolo declarado em outra função (`S is not defined`, que derrubou a criação de
 * torneio no mesmo dia) passa por aqui — quem pega aquilo é EXECUTAR o caminho, e isso é
 * o gravar-torneio-dividido-roda-de-verdade.test.js. Esta trava é o piso, não o teto.
 *
 * A LISTA SAI DO index.html — os arquivos que REALMENTE vão ao ar —, nunca de uma lista
 * escrita à mão que envelheceria. Mais os lazy-loaded, que não estão no HTML e por isso
 * são justamente os mais fáceis de esquecer.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const doHtml = [];
const re = /<script[^>]+src="([^"]+\.js)(\?[^"]*)?"/g;
let m;
while ((m = re.exec(html)) !== null) {
  const rel = m[1].replace(/^\.?\//, '');
  if (/^https?:/.test(rel)) continue;
  doHtml.push(rel);
}
ok(doHtml.length > 20, 'a lista sai do index.html — ' + doHtml.length + ' script(s)');

/* Lazy-loaded: não estão no HTML e por isso são os mais esquecidos. `release-notes.js` é
 * exatamente um deles — e foi o que eu quebrei. */
const lazy = ['js/release-notes.js', 'sw.js'];
const todos = doHtml.concat(lazy).filter((f, i, a) => a.indexOf(f) === i);

console.log('\n① Todo arquivo servido faz parse');
const quebrados = [];
todos.forEach((rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { quebrados.push(rel + ' (NÃO EXISTE — o HTML pede um arquivo que não está lá)'); return; }
  try { execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' }); }
  catch (e) {
    const saida = String((e.stderr || '')).split('\n').filter(Boolean).slice(-2).join(' | ');
    quebrados.push(rel + ' → ' + saida.slice(0, 160));
  }
});
ok(quebrados.length === 0,
   '⛔ nenhum dos ' + todos.length + ' arquivos tem erro de sintaxe' +
   (quebrados.length ? '\n      ' + quebrados.join('\n      ') : ''));

console.log('\n② E os lazy-loaded estão cobertos (são os que ninguém lembra)');
lazy.forEach((f) => ok(todos.indexOf(f) !== -1, '   ' + f + ' está na varredura'));

console.log(falhas === 0
  ? '\n✅ ' + todos.length + ' arquivos servidos, todos parseiam\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
