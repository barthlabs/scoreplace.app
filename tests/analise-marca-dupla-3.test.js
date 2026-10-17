'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('  function _erIsTransferredFemalePair(');
const end = source.indexOf('  function _erPairCard(', start);
assert(start >= 0 && end > start, 'classificador da dupla 3 existe');
const classify = new Function('_erDisplayCategory', '_decomposeCat', '_erPairCategory',
  source.slice(start, end) + '\nreturn _erIsTransferredFemalePair;')(
  (t, id) => (t.categoryDefinitions.find((d) => d.id === id) || {}).label || id,
  (label) => ({ gender: /^Masc(?:\s|$)/.test(label) ? 'Masc' : /^Fem(?:\s|$)/.test(label) ? 'Fem' : null }),
  (members) => members[0].category
);
const t = { categoryDefinitions: [
  { id: 'cat-m', label: 'Masc Light' }, { id: 'cat-f', label: 'Fem Light' },
  { id: 'cat-misto', label: 'Misto Light' }
] };
const pair = (origin, category, otherOrigin = origin) => [
  { originCategoryId: origin, category }, { originCategoryId: otherOrigin, category }
];
assert.strictEqual(classify(pair('cat-m', 'Fem Light'), t), true, 'origem masculina e destino feminino recebe 3');
assert.strictEqual(classify(pair('cat-f', 'Fem Light'), t), false, 'inscrição feminina original não recebe 3');
assert.strictEqual(classify(pair('cat-m', 'Masc Light'), t), false, 'destino masculino não recebe 3');
assert.strictEqual(classify(pair('cat-misto', 'Fem Light'), t), false, 'origem mista não recebe 3');
assert.strictEqual(classify(pair('', 'Fem Light'), t), false, 'sem origem não recebe 3');
assert.strictEqual(classify(pair('removed', 'Fem Light'), t), false, 'ID de origem removido não recebe 3');
assert.strictEqual(classify(pair('cat-m', 'Fem Light', 'cat-f'), t), false, 'origens divergentes não recebem 3');
assert(source.includes('originCategoryId: p.originCategoryId || \'\''), 'origem passa pela expansão da dupla');
assert(source.includes('originCategoryId: (p && p.originCategoryId) || \'\''), 'origem passa para as linhas da matriz');
const card = source.slice(source.indexOf('  function _erPairCard('), source.indexOf('  window._erEditPairMember', source.indexOf('  function _erPairCard(')));
assert.strictEqual((card.match(/<span class="badge badge-info"/g) || []).length, 1, 'um selo por card');
assert(card.includes("(thirdPair ? '<span") && card.includes('memberLine(a) + memberLine(b)'), 'selo é da dupla, não de cada membro');
const render = new Function('_erIsTransferredFemalePair', '_liveState', '_pendingEdits', '_erSelectedOrders',
  '_erPairCategory', '_decomposeCat', '_erPairPlacementGender', '_esc', card + '\nreturn _erPairCard;')(
  classify, { t, isOrg: false }, {}, {}, (members) => members[0].category,
  (label) => ({ skill: label.split(' ')[1] || '' }), () => 'feminino', (value) => String(value)
);
const html = render(pair('cat-m', 'Fem Light').map((member, index) => Object.assign(member,
  { order: index + 1, name: 'Pessoa ' + (index + 1), assigned: ['Fem Light'] })));
assert.strictEqual((html.match(/aria-label="Dupla 3"/g) || []).length, 1, 'a renderização real mostra um único selo 3');
assert(html.includes('right:8px;bottom:7px;font-size:10px'), 'selo 3 pequeno no canto inferior direito');
const renderEditable = new Function('_erIsTransferredFemalePair', '_liveState', '_pendingEdits', '_erSelectedOrders',
  '_erPairCategory', '_decomposeCat', '_erPairPlacementGender', '_esc', card + '\nreturn _erPairCard;')(
  classify, { t: { ...t, canonicalRegistrationMigration: { fingerprint: 'verified' } }, isOrg: true }, {}, {},
  (members) => members[0].category, (label) => ({ skill: label.split(' ')[1] || '' }), () => 'feminino', String
);
const editable = renderEditable(pair('cat-m', 'Fem Light').map((member, index) => Object.assign(member,
  { order: index + 1, name: 'Pessoa ' + (index + 1), assigned: ['Fem Light'] })));
assert.strictEqual((editable.match(/window\._erEditPairMember\(/g) || []).length, 2, 'cada nome abre a própria vaga');
assert(!editable.includes('✏️'), 'nenhum lápis na dupla');
console.log('✓ Análise: selo 3 só para dupla feminina com origem masculina canônica');
