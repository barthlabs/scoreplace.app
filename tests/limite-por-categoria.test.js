'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/views/create-tournament.js'), 'utf8');
const format = fs.readFileSync(path.join(root, 'js/views/format2-ui.js'), 'utf8');
const fn = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failures = 0;
function ok(condition, label) { console.log((condition ? '✓ ' : '✗ ') + label); if (!condition) failures++; }
const nodes = {};
for (const id of ['category-capacity-section', 'category-capacity-general', 'tourn-max-per-category', 'tourn-custom-category-capacity',
  'tourn-max-by-category', 'category-capacity-grid', 'tourn-max-participants', 'cap-max-container', 'category-capacity-summary']) {
  nodes[id] = { value: '', checked: false, style: {}, innerHTML: '', readOnly: false };
}
nodes['tourn-max-by-category'].value = '{}';
const names = ['Fem Light', 'Fem Power', 'Fem Extreme', 'Masc Light', 'Masc Power', 'Masc Extreme'];
const context = { window: { _getCreateFormCategoryData: () => ({ combinedCategories: names }) },
  document: { getElementById: id => nodes[id] || null }, console };
const start = source.indexOf('  window._syncCategoryCapacity = function(options) {');
const end = source.indexOf('  window._onInscricaoChange = function', start);
ok(start >= 0 && end > start, 'cálculo de capacidade exposto no editor');
if (start >= 0 && end > start) vm.runInNewContext(source.slice(start, end), context);

// Contrato uniforme anterior permanece: 6 × 16 = 96, com total não editável.
nodes['tourn-max-per-category'].value = '16';
context.window._syncCategoryCapacity();
ok(nodes['tourn-max-participants'].value === '96' && nodes['tourn-max-participants'].readOnly, 'sem personalização: 16 × 6 = 96 e total somente leitura');
ok(nodes['tourn-max-by-category'].value === '{}' && nodes['category-capacity-grid'].style.display === 'none', 'sem personalização o mapa fica vazio');
ok(nodes['category-capacity-general'].style.display === '', 'campo geral visível no modo uniforme');

// Contrato novo: duas Light com 32, quatro outras com 16 = 128.
nodes['tourn-custom-category-capacity'].checked = true;
context.window._toggleCategoryCapacity(true);
const light = { 'Fem Light': 32, 'Fem Power': 16, 'Fem Extreme': 16, 'Masc Light': 32, 'Masc Power': 16, 'Masc Extreme': 16 };
nodes['tourn-max-by-category'].value = JSON.stringify(light);
context.window._syncCategoryCapacity();
ok(nodes['tourn-max-participants'].value === '128' && nodes['tourn-max-participants'].readOnly, 'personalizado: soma 32+16+16+32+16+16 = 128');
ok(nodes['category-capacity-grid'].style.display === 'grid' && nodes['category-capacity-grid'].innerHTML.includes('Fem Light'), 'switch mostra entradas por categoria');
ok(nodes['category-capacity-general'].style.display === 'none', 'modo personalizado oculta campo e valor genéricos');
names.pop();
context.window._syncCategoryCapacity();
ok(!Object.hasOwn(JSON.parse(nodes['tourn-max-by-category'].value), 'Masc Extreme'), 'categoria removida não deixa exceção órfã');
nodes['tourn-custom-category-capacity'].checked = false;
context.window._toggleCategoryCapacity(false);
ok(nodes['tourn-max-by-category'].value === '{}' && nodes['category-capacity-grid'].style.display === 'none', 'switch desligado limpa exceções e oculta a grade');
ok(nodes['category-capacity-general'].style.display === '' && nodes['tourn-max-per-category'].value === '16', 'desligar restaura o campo geral anterior');

// Uma configuração antiga incoerente não pode voltar a 96 só por abrir o editor.
names.push('Masc Extreme');
nodes['tourn-max-participants'].value = '128';
nodes['tourn-max-per-category'].value = '16';
context.window._categoryCapacityLoadGuard = { total: 128, categories: names.slice().reverse() };
context.window._syncCategoryCapacity();
ok(nodes['tourn-max-participants'].value === '128', 'edição preserva total 128 legado mesmo se ordem das categorias mudar');
nodes['tourn-custom-category-capacity'].checked = true;
nodes['tourn-max-by-category'].value = JSON.stringify(light);
context.window._syncCategoryCapacity({ userChanged: true });
nodes['tourn-max-by-category'].value = JSON.stringify({ ...light, 'Fem Light': 0 });
context.window._syncCategoryCapacity();
ok(JSON.parse(nodes['tourn-max-by-category'].value)['Fem Light'] === 0, 'valor inválido não é substituído silenciosamente pelo padrão');
ok(/let maxPartsVal =/.test(source) && /if \(customCategoryCapacity && validMap\) maxPartsVal = expectedCapacity;/.test(source) &&
  /!customCategoryCapacity && !validGeneral/.test(source), 'save usa soma personalizada sem dispensar validação do modo geral');

ok(/maxParticipantsPerCategory: maxPerCategoryVal/.test(source) && /maxParticipantsByCategory: maxByCategoryVal/.test(source), 'edição persiste padrão e mapa no mesmo payload');
ok(/maxParticipantsByCategory: \(function\(\)/.test(source), 'template preserva o mapa');
ok(/maxParticipantsByCategory'/.test(fn), 'Function aceita o mapa na porta canônica');
ok(/toggle-switch toggle-sm/.test(format) && /Personalizar rodadas por categoria/.test(format), 'rodadas por categoria usam switch visual');
process.exit(failures ? 1 : 0);
