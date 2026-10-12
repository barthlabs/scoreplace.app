'use strict';
const C = require('./legacy-category-definition-core');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const legacy = { combinedCategories: ['Fem A', 'Masc B'] };
const resolved = C.resolve(legacy, [{ sourceKey: 'a', entry: { uid: 'u1', category: 'Fem A' } }]);
ok('projeta rótulos legados em IDs determinísticos', resolved.shouldPersist && resolved.definitions.length === 2 && resolved.definitions[0].id === C.idForLabel('Fem A'));
ok('projeção não inventa critérios ou exclusividade', resolved.definitions.every((definition) => definition.dimension === 'custom' && definition.exclusivityGroup === null && Object.keys(definition.criteria).length === 0));
ok('ponte aceita o rótulo legado e devolve somente ID', resolved.categoryIdForLegacyLabel('Fem A') === C.idForLabel('Fem A'));
const general = C.resolve({}, [{ sourceKey: 'a', entry: { uid: 'u1' } }]);
ok('elenco antigo sem categoria ganha Geral explícita', general.defaultCategoryId && general.categoryIdForLegacyLabel('') === general.defaultCategoryId);
const typed = C.resolve({ categoryDefinitions: [{ id: 'fem-a', label: 'Fem A', dimension: 'skill', exclusivityGroup: 'skill', criteria: {} }] }, []);
ok('definição tipada existente não é regravada', !typed.shouldPersist && typed.source === 'existing');
bad('bloqueia rótulos diferentes que colidem após normalização', () => C.resolve({ combinedCategories: ['Fem A', 'fem a'] }, []));
console.log((fail ? '❌' : '✅') + ' legacy-category-definition-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
