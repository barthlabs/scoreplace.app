#!/usr/bin/env node
/* NOME DE TORNEIO NÃO APARECE REPETIDO.
 *
 * Relato do dono (11/ago/2026, print da ficha do @FernandoBernacchi):
 *   "torneio rp 2026 10 anos repetido e sem data. que merda. precisa funcionar direito"
 *
 * MEDIDO no doc real (letzplayScans/XqOVCgyAWOatjMmIXggibbP0x022, lido às 19:05 UTC com
 * extVersion 1.99) — o campo chega repetido DA FONTE, não é o app concatenando:
 *   name: "TORNEIO RP 2026 - 10 anos - TORNEIO RP 2026 - 10 anos"
 *   categoryRaw: ""
 * O `h2.title.with-avatar` da página do letzplay junta nome + categoria; sem categoria,
 * ele repete o próprio nome no lugar dela.
 *
 * ⚠️ O RISCO DO CONSERTO é maior que o defeito: nome legítimo TEM hífen ("T&F Special
 * Edition - torneio PAIS - Masculino - Bronze"). Cortar "na metade" ou "no primeiro
 * hífen" mutilaria nomes certos. Por isso só se colapsa PARTE REPETIDA — e metade da
 * suíte existe pra travar o que NÃO pode mudar.
 *
 * Uso:  node tests/lz-nome-de-torneio-nao-repete.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(n, fn) { try { fn(); ok++; console.log('  ✓ ' + n); } catch (e) { bad++; console.log('  ✗ ' + n + '\n      ' + e.message); } }

function extrai(arquivo, nome) {
  const src = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
  const i = src.indexOf('function ' + nome + '(');
  assert.ok(i > 0, nome + ' não existe em ' + arquivo);
  let j = src.indexOf('{', i), d = 0, k = j;
  for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return new Function(src.slice(i, k + 1) + '\nreturn ' + nome + ';')();
}

// A MESMA regra nos dois lados: app (cura o já gravado) e extensão (cura a origem).
const NOS_DOIS = [
  ['app', extrai('js/views/tournaments-enrollment-report.js', '_lzSemRepeticao')],
  ['extensão', extrai('extension/content.js', '_semRepeticao')]
];

console.log('\n1. O CASO REAL DO PRINT');
NOS_DOIS.forEach(([onde, f]) => {
  t(onde + ': "RP 2026 - 10 anos" repetido vira UM', () => {
    assert.strictEqual(f('TORNEIO RP 2026 - 10 anos - TORNEIO RP 2026 - 10 anos'),
      'TORNEIO RP 2026 - 10 anos');
  });
});

console.log('\n2. NOME LEGÍTIMO NÃO PODE SER TOCADO (é o risco do conserto)');
const INTOCADOS = [
  ['T&F Special Edition - torneio PAIS - Masculino - Bronze', '3 hífens, nenhuma repetição'],
  ['Finals ranking social 2025 - Finais Masculina D', 'hífen separando categoria'],
  ['Torneio de Férias só Casais', 'sem separador'],
  ['Open - Feminina C', 'curto, com hífen'],
  ['Torneio Interno de Beach Tennis - BTG Pactual - Mista D', 'clube no meio'],
  ['Copa Copa Cabana', 'palavra repetida MAS não é o nome inteiro']
];
NOS_DOIS.forEach(([onde, f]) => {
  INTOCADOS.forEach(([nome, nota]) => {
    t(onde + ': intocado — ' + nota, () => assert.strictEqual(f(nome), nome));
  });
});

console.log('\n3. OUTRAS FORMAS DE REPETIÇÃO');
NOS_DOIS.forEach(([onde, f]) => {
  t(onde + ': duplicado sem separador', () => assert.strictEqual(f('Copa Verão Copa Verão'), 'Copa Verão'));
  t(onde + ': duplicado curto com hífen', () => assert.strictEqual(f('Aberto - Aberto'), 'Aberto'));
  t(onde + ': vazio e nulo não quebram', () => { assert.strictEqual(f(''), ''); assert.strictEqual(f(null), ''); });
});

console.log('\n4. ESTÁ FIADO NO CAMINHO REAL');
t('o app passa o nome pela função antes de montar a linha', () => {
  const src = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
  assert.ok(/nomeBruto = _lzSemRepeticao\(/.test(src), 'o nome voltou a ser usado cru');
});
t('a extensão passa o nome pela função nas DUAS fontes (h2 e og:title)', () => {
  const src = fs.readFileSync(path.join(raiz, 'extension/content.js'), 'utf8');
  const fn = src.slice(src.indexOf('function tourneyNameFromDoc'), src.indexOf('function _rowNum'));
  assert.strictEqual((fn.match(/_semRepeticao\(/g) || []).length, 2,
    'as duas saídas (h2 e og:title) têm que passar pela função');
});

console.log('\n' + (bad ? '❌' : '✅') + ' lz-nome-de-torneio-nao-repete: ' + ok + ' passaram, ' + bad + ' falharam');
process.exit(bad ? 1 : 0);
