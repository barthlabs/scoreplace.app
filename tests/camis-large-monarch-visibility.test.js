const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./render-harness');

const t = H.hydrateMonarchGroups(H.buildViaDraw('Liga', 144, {
  ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true
}));
assert.strictEqual(t.groups.length, 36);
t.groups.forEach((group, index) => {
  const category = index < 8 ? 'Fem Diamante' : index < 24 ? 'Fem Ouro' : 'Fem Prata';
  group.category = category;
  group.matches.forEach(match => { match.category = category; });
});

const html = H.window._renderMonarchStage(t, false, false, { suppressAutoAdvance: true });
assert.strictEqual((html.match(/data-monarch-large="1"/g) || []).length, 36);
assert.strictEqual((html.match(/data-monarch-category="Fem Diamante"/g) || []).length, 8);
assert.strictEqual((html.match(/data-monarch-category="Fem Ouro"/g) || []).length, 16);
assert.strictEqual((html.match(/data-monarch-category="Fem Prata"/g) || []).length, 12);
assert.strictEqual((html.match(/data-monarch-large="1"[^>]* hidden/g) || []).length, 36);
assert.strictEqual(t.groups.reduce((n, g) => n + g.matches.length, 0), 108);

const small = H.hydrateMonarchGroups(H.buildViaDraw('Liga', 8, {
  ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true
}));
small.groups.forEach(group => {
  group.category = 'Fem Diamante';
  group.matches.forEach(match => { match.category = group.category; });
});
assert.doesNotMatch(H.window._renderMonarchStage(small, false, false, {
  suppressAutoAdvance: true
}), /data-monarch-large="1"/);

// Exercita os helpers reais de troca de aba e entrada em grupo oculto.
const source = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
const helpers = source.slice(source.indexOf('function _bracketMonarchGroupsApply('),
  source.indexOf('window._bracketSelectCategoryTab ='));
const categories = ['Fem Diamante', 'Fem Ouro', 'Fem Prata'];
const groups = categories.map(category => ({
  hidden: true,
  getAttribute(name) { return name === 'data-monarch-category' ? category : null; },
  querySelector() { return { getAttribute() { return 'fem'; } }; },
  closest() { return this; }
}));
const root = {
  _bracketTabsScope: {
    querySelectorAll() { return groups; },
    contains(group) { return groups.includes(group); }
  },
  getAttribute() { return 'CAMIS'; }
};
const context = {
  document: { querySelectorAll() { return [root]; } },
  _bracketTabGender() { return 'fem'; },
  _bracketTabsApply(id, gender, category, round, canonical) {
    assert.strictEqual(id, 'CAMIS');
    assert.strictEqual(gender, 'fem');
    assert.strictEqual(canonical, true);
    context._bracketMonarchGroupsApply(root, category, false);
  }
};
vm.createContext(context);
vm.runInContext(helpers, context);
context._bracketMonarchGroupsApply(root, 'Fem Ouro', false);
assert.deepStrictEqual(groups.map(group => group.hidden), [true, false, true]);
context._bracketMonarchGroupsApply(root, '__upcoming', true);
assert.deepStrictEqual(groups.map(group => group.hidden), [true, true, true]);
context._bracketRevealMonarchTarget(groups[2]);
assert.deepStrictEqual(groups.map(group => group.hidden), [true, true, false]);
console.log('CAMIS: 36 grupos e 108 jogos preservados; layout inicial por categoria.');
