'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const store = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
const start = source.indexOf('var _resolveOrgGender = function(uid) {');
const end = source.indexOf('\n        };', start);
assert.ok(start >= 0 && end > start, 'resolvedor de gênero da organização encontrado');
const resolver = source.slice(start, end + '\n        };'.length);

function resolve(pair, profileGender, uid = 'person-1') {
  const context = {
    _cu2: null,
    _t: { participants: [] },
    _competitors: [pair],
    window: {
      _genderForUid: () => profileGender,
      _pGenderMembro: (p, side) => p[side + 'Gender'] || ''
    }
  };
  const resultContext = { ...context, uid };
  vm.runInNewContext(resolver + '\nresult = _resolveOrgGender(uid);', resultContext);
  return resultContext.result;
}

assert.equal(resolve({ p1Uid: 'person-1', p2Uid: 'person-2', category: 'Fem Light' }, ''), 'feminino');
assert.equal(resolve({ p1Uid: 'person-2', p2Uid: 'person-1', category: 'Feminino Power' }, ''), 'feminino');
assert.equal(resolve({ p1Uid: 'person-1', p2Uid: 'person-2', category: 'Masc Light' }, ''), 'masculino');
assert.equal(resolve({ p1Uid: 'person-1', p2Uid: 'person-2', category: 'Misto' }, ''), '');
assert.equal(resolve({ p1Uid: 'person-3', p2Uid: 'person-2', category: 'Fem Light' }, ''), '');
assert.equal(resolve({ p1Uid: 'person-1', p1Gender: 'outro', category: 'Fem Light' }, ''), 'outro');
assert.equal(resolve({ p1Uid: 'person-1', category: 'Fem Light' }, 'masculino'), 'masculino');
assert.match(source, /data-role-tournament-gender=/);
assert.match(store, /_genderForUid\(u\) \|\| e\.getAttribute\('data-role-tournament-gender'\)/);
console.log('✅ papel da organização segue o perfil quando conhecido e usa a categoria do torneio como fallback');
