'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const order = require('../scripts/neon-ordem-fotos-2026-10-15.json');

const groups = [['Fem Light', 16], ['Fem Power', 8], ['Fem Extreme', 8],
  ['Masc Light', 16], ['Masc Power', 8], ['Masc Extreme', 8]];
const pairs = groups.flatMap(([label, count]) => {
  assert.equal(order[label].length, count, label + ' tem a quantidade da foto');
  return order[label];
});
assert.equal(pairs.length, 64);
assert.equal(new Set(pairs.map((pair) => pair.pairId)).size, 64, 'identidades das duplas são únicas');
const oldSeq = pairs.flatMap((pair) => [pair.oldSeq, pair.oldSeq + 1]).sort((a, b) => a - b);
assert.deepEqual(oldSeq, Array.from({ length: 128 }, (_, index) => index + 1),
  'os 128 números antigos são uma permutação exata');
assert.deepEqual(order['Fem Light'].map((pair) => pair.oldSeq),
  [1, 3, 5, 7, 9, 11, 13, 15, 97, 99, 101, 103, 105, 107, 109, 111],
  'Fem Light não salta para Fem Power depois da oitava dupla');
assert.deepEqual(order['Masc Light'].map((pair) => pair.oldSeq),
  [49, 51, 53, 55, 57, 59, 61, 63, 113, 115, 117, 119, 121, 123, 125, 127],
  'Masc Light mantém as 16 duplas antes de Masc Power');
const source = fs.readFileSync(path.join(__dirname, '../scripts/reparar-neon-sequencia-fotos.js'), 'utf8');
assert.match(source, /tx\.update\(regRef\.doc\(id\), \{ enrollSeq: target\[index\] \}\)/);
assert.match(source, /'item\.p1Seq': target\[0\], 'item\.p2Seq': target\[1\]/);
assert.match(source, /const changes = proposal\(root, state, restore\);/,
  'aplicação valida estado antigo; restauração valida estado já aplicado');
assert.doesNotMatch(source, /tx\.(?:delete|set)\(/, 'reparo não cria/apaga documentos');
console.log('✅ ordem fixa das fotos e reparo limitado à numeração');
