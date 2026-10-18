'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('  function _erIsTransferredFemalePair(');
const end = source.indexOf('  function _erPairCard(', start);
assert(start >= 0 && end > start, 'classificador da dupla 3 existe');
const classify = new Function('_erDisplayCategory', '_decomposeCat', '_erPairCategory',
  source.slice(start, end) + '\nreturn _erIsTransferredFemalePair;')(
  (t, id) => (t.categoryDefinitions.find((d) => d.id === id) || {}).label || id,
  (label) => ({ gender: /^Masc(?:\s|$)/.test(label) ? 'Masc' : /^Fem(?:\s|$)/.test(label) ? 'Fem' : null,
    skill: label.split(' ')[1] || '' }),
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
assert.strictEqual(classify(pair('cat-m', 'Fem Power'), t), false, 'realocada para Fem Power não é dupla 3 Light');
assert.strictEqual(classify(pair('cat-m', 'Fem Extreme'), t), false, 'realocada para Fem Extreme não é dupla 3 Light');
assert.strictEqual(classify(pair('cat-f', 'Fem Light'), t), false, 'inscrição feminina original não recebe 3');
assert.strictEqual(classify(pair('cat-m', 'Masc Light'), t), false, 'destino masculino não recebe 3');
assert.strictEqual(classify(pair('cat-misto', 'Fem Light'), t), false, 'origem mista não recebe 3');
assert.strictEqual(classify(pair('', 'Fem Light'), t), false, 'sem origem não recebe 3');
assert.strictEqual(classify(pair('removed', 'Fem Light'), t), false, 'ID de origem removido não recebe 3');
assert.strictEqual(classify(pair('cat-m', 'Fem Light', 'cat-f'), t), false, 'origens divergentes não recebem 3');
const drawn = { ...t, categorySchedule:{ slots:[{ category:'Fem Light', day:'2026-10-22' }, { category:'Fem Light', day:'2026-10-23' }] },
  teamCompetition:{ schedule:{ pairDayAssignments:[{ fixedPairId:'pair-lottery', day:'2026-10-23' }] } } };
assert.strictEqual(classify(pair('cat-f', 'Fem Light').map((member) => ({ ...member, fixedPairId:'pair-lottery' })), drawn), true,
  'as três sorteadas passam a mostrar 3 após a confirmação do plano');
assert(source.includes('originCategoryId: p.originCategoryId || \'\''), 'origem passa pela expansão da dupla');
assert(source.includes('originCategoryId: (p && p.originCategoryId) || \'\''), 'origem passa para as linhas da matriz');
const card = source.slice(source.indexOf('  function _erPairCard('), source.indexOf('  window._erEditPairMember', source.indexOf('  function _erPairCard(')));
const fakeWindow = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js/paleta-tabela.js'), 'utf8'), { window: fakeWindow });
const lzColors = { white: '#f3f4f6', violet: '#a78bfa', green: '#2dd4a0', blue: '#38bdf8', yellow: '#f0b445', red: '#f26a6a' };
assert.strictEqual((card.match(/<span class="badge badge-info"/g) || []).length, 1, 'um selo por card');
assert(card.includes("(thirdPair ? '<span") && card.includes('memberLine(a) + memberLine(b)'), 'selo é da dupla, não de cada membro');
const render = new Function('window', '_LZ_COL', '_erIsTransferredFemalePair', '_liveState', '_pendingEdits', '_erSelectedOrders',
  '_erPairCategory', '_decomposeCat', '_erPairPlacementGender', '_esc', card + '\nreturn _erPairCard;')(
  fakeWindow, lzColors, classify, { t, isOrg: false }, {}, {}, (members) => members[0].category,
  (label) => ({ skill: label.split(' ')[1] || '' }), () => 'feminino', (value) => String(value)
);
const html = render(pair('cat-m', 'Fem Light').map((member, index) => Object.assign(member,
  { order: index + 1, name: 'Pessoa ' + (index + 1), assigned: ['Fem Light'] })));
assert.strictEqual((html.match(/aria-label="Dupla 3"/g) || []).length, 1, 'a renderização real mostra um único selo 3');
assert(html.includes('right:8px;bottom:7px;font-size:10px'), 'selo 3 pequeno no canto inferior direito');
const renderEditable = new Function('window', '_LZ_COL', '_erIsTransferredFemalePair', '_liveState', '_pendingEdits', '_erSelectedOrders',
  '_erPairCategory', '_decomposeCat', '_erPairPlacementGender', '_esc', card + '\nreturn _erPairCard;')(
  fakeWindow, lzColors, classify, { t: { ...t, canonicalRegistrationMigration: { fingerprint: 'verified' } }, isOrg: true }, {}, {},
  (members) => members[0].category, (label) => ({ skill: label.split(' ')[1] || '' }), () => 'feminino', String
);
const editable = renderEditable(pair('cat-m', 'Fem Light').map((member, index) => Object.assign(member,
  { order: index + 1, name: 'Pessoa ' + (index + 1), assigned: ['Fem Light'] })));
assert.strictEqual((editable.match(/window\._erOpenParticipantFicha\(/g) || []).length, 2, 'cada nome abre a própria ficha');
assert(!editable.includes('onclick="event.stopPropagation();window._erEditPairMember('), 'edição não aparece no card');
assert(!editable.includes('✏️'), 'nenhum lápis na dupla');
const statusMembers = pair('cat-m', 'Fem Light').map((member, index) => Object.assign(member,
  { order: index + 1, name: 'Pessoa ' + (index + 1), _lzColor: index ? lzColors.red : lzColors.green }));
const statusHtml = render(statusMembers);
assert(statusHtml.includes('color:var(--sp-c-2dd4a0,#2dd4a0)'), 'primeira pessoa tem status verde com token de tema');
assert(statusHtml.includes('color:var(--er-lz-red,#f26a6a)'), 'segunda pessoa tem status vermelho com token de tema');
statusMembers[0]._lzColor = lzColors.white;
delete statusMembers[1]._lzColor;
const fallbackHtml = render(statusMembers);
assert(fallbackHtml.includes('color:var(--sp-c-f3f4f6,#f3f4f6)'), 'branco classificado passa pelo tema');
assert(fallbackHtml.includes('color:var(--text-bright)'), 'sem classificação usa cor neutra');
const css = fs.readFileSync(path.join(__dirname, '..', 'css/components.css'), 'utf8');
assert(/\[data-er-pair-order\] > div::before\s*\{[^}]*background:\s*currentColor/s.test(css), 'bolinha acompanha a cor do nome');
const matrixRender = source.slice(source.indexOf('  window._erRenderMatrix = function'), source.indexOf('  // ── BUSCA DA ANÁLISE', source.indexOf('  window._erRenderMatrix = function')));
assert(matrixRender.indexOf('_erReconcilePairRows') < matrixRender.indexOf('_erApplyLzToRows') && matrixRender.indexOf('_erApplyLzToRows') < matrixRender.indexOf('_matrixInner'), 'reclassifica depois de reconciliar e antes de renderizar');
assert(matrixRender.includes('lzCtx.scanMap || {}') && matrixRender.includes('lzCtx.rows = _liveState.rows'), 'usa scan atualizado e sincroniza linhas');
console.log('✓ Análise: selo 3 só para dupla feminina com origem masculina canônica');
