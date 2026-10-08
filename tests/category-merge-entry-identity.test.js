/* Mesclar/desfazer categoria não pode decidir inscrição por e-mail, nome ou só
 * pelo primeiro membro de uma dupla. O núcleo é vendorizado ao autoDraw: este
 * teste trava a regra na fonte e exige que o vendor acompanhe. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(value, message) { if (value) pass++; else { fail++; console.error('✗ ' + message); } }

const sandbox = { window: null }; sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/domain/participant-identity.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/identity-core.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/views/tournaments-categories.js'), 'utf8'), sandbox);

const a = { p1Uid: 'uid-a', p1Name: 'Mesmo nome', p2ManualId: 'manual-a', p2Name: 'Convidada', email: 'velho-a@test' };
const b = { p1Uid: 'uid-a', p1Name: 'Mesmo nome', p2ManualId: 'manual-b', p2Name: 'Convidada', email: 'velho-a@test' };
const t = { combinedCategories: ['A', 'B'], participants: [Object.assign({ categories: ['A'] }, a), Object.assign({ categories: ['B'] }, b)], matches: [], standings: [] };
ok(sandbox._categoryMutationsCore.merge(t, 'A', 'B', 'AB', 10) === true, 'mesclagem é aplicada');
const map = t.mergeHistory[0].participants;
ok(Object.keys(map).length === 2, 'duplas com mesmo primeiro UID/e-mail não colidem');
ok(Object.keys(map).every((key) => !key.includes('@') && key.includes('manual:')), 'histórico novo não usa e-mail e inclui o ID manual');
ok(sandbox._categoryMutationsCore.unmerge(t, { timestamp: 10, mergedName: 'AB', sourceCat: 'A', targetCat: 'B' }) === true, 'desmesclagem é aplicada');
ok(t.participants[0].categories[0] === 'A' && t.participants[1].categories[0] === 'B', 'desmesclagem devolve cada dupla à categoria de origem');

const source = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-categories.js'), 'utf8');
const vendor = fs.readFileSync(path.join(ROOT, 'functions-autodraw/vendor/tournaments-categories.js'), 'utf8');
ok(source === vendor, 'vendor do autoDraw acompanha o núcleo de categorias');
console.log(fail ? ('❌ ' + fail + ' falha(s), ' + pass + ' ok') : ('✅ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);
