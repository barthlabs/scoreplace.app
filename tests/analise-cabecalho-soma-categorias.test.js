'use strict';
// O cabeçalho da Análise conta pessoas posicionadas nas categorias do torneio,
// não somente os perfis que declararam gênero. Não toca no roster de produção.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('function _erPairPlacementGender(members, t) {');
const end = source.indexOf('\n  window._erPairPlacementGender =', start);
assert.ok(start > 0 && end > start, 'resolvedor real encontrado');
const staged = new Map();
const context = {
  _erPairCategory: members => staged.has(members[0].id) ? staged.get(members[0].id) : members[0].category,
  _decomposeCat: category => ({ gender: /^Fem(?:\s|$)/.test(category || '') ? 'Fem' : /^Masc(?:\s|$)/.test(category || '') ? 'Masc' : 'Misto' }),
  _mxGenderOf: member => member.profileGender || null,
};
const placedGender = vm.runInNewContext('(' + source.slice(start, end) + ')', context);
const pair = (id, category, profileGender) => [{ id, category, profileGender }, { id: id + '-b' }];
const pairs = [];
for (let i = 0; i < 64; i++) {
  const category = i < 16 ? 'Fem Light' : i < 24 ? 'Fem Power' : i < 32 ? 'Fem Extreme'
    : i < 48 ? 'Masc Light' : i < 56 ? 'Masc Power' : 'Masc Extreme';
  // Perfis ausentes e divergentes reproduzem os importados do Neon.
  pairs.push(pair(i, category, i % 3 === 0 ? null : (i % 2 ? 'feminino' : 'masculino')));
}
const counts = () => pairs.reduce((n, members) => {
  const gender = placedGender(members, {});
  if (gender) n[gender] += 2;
  return n;
}, { feminino: 0, masculino: 0 });
assert.deepEqual(counts(), { feminino: 64, masculino: 64 }, '32+16+16 pessoas em cada gênero');
for (let i = 32; i < 40; i++) staged.set(i, 'Fem Light');
assert.deepEqual(counts(), { feminino: 80, masculino: 48 }, 'mover 8 duplas na prévia desloca 16 pessoas');
assert.equal(placedGender(pair('mixed', 'Misto', 'feminino'), {}), 'feminino', 'Misto usa gênero pessoal');
assert.equal(placedGender(pair('none', '', 'masculino'), {}), 'masculino', 'sem categoria usa gênero pessoal');
assert.equal(placedGender(pair('unknown', '', null), {}), null, 'sem categoria nem gênero permanece indefinido');

const matrix = source.slice(source.indexOf('function _matrixInner(rows, t) {'), source.indexOf('window._erRenderMatrix', source.indexOf('function _matrixInner(rows, t) {')));
assert.match(matrix, /var genderMatches = _erPairPlacementGender\(members, t\) === genderKey/, 'box usa o mesmo gênero de posição');
assert.match(matrix, /pairFemTotal = pairGroups\.reduce[^\n]+_erPairPlacementGender\(members, t\)/, 'cabeçalho feminino usa o mesmo resolvedor');
assert.match(matrix, /pairMascTotal = pairGroups\.reduce[^\n]+_erPairPlacementGender\(members, t\)/, 'cabeçalho masculino usa o mesmo resolvedor');
console.log('✅ Cabeçalhos da Análise somam as categorias: 8 verificações');
