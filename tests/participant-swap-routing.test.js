'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('  window._openTournamentParticipantReplacement = function');
const end = source.indexOf('  function _erFormedPairsPanel(', start);
assert(start > 0 && end > start, 'entrada compartilhada da troca existe');

const opened = [], errors = [];
const tournament = { id: 'tour-test', canonicalRegistrationMigration: { fingerprint: 'valid' } };
const pairs = [
  { fixedPairId: 'pair-light', categoryId: 'light', p1ManualId: 'manual-a',
    p1Name: 'Atleta manual', p2Uid: 'uid-partner' },
  { fixedPairId: 'pair-power', categoryId: 'power', p1ManualId: 'manual-a',
    p1Name: 'Atleta manual', p2Uid: 'uid-partner' },
];
const sandbox = {
  window: {
    _findTournamentById: () => tournament,
    _souOrganizador: () => true,
    _canonicalCategoryIdForDisplay: (_t, category) => category === 'Fem Light' ? 'light' : category,
    FirestoreDB: {
      loadCanonicalTournamentRoster: async () => ({ data: { participants: pairs } }),
      db: { collection: (collection) => {
        assert.equal(collection, 'usersPublic');
        return { doc: (uid) => {
          assert.equal(uid, 'uid-partner');
          return { get: async () => ({ exists: true, data: () => ({ displayName: 'Parceira da conta' }) }) };
        } };
      } },
    },
  },
  _erShowReplacementDialog: (_t, row) => opened.push(row),
  showNotification: (_title, message) => errors.push(message),
};
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);

(async () => {
  sandbox.window._openTournamentParticipantReplacement('tour-test', '', 'manual-a', 'Fem Light');
  sandbox.window._openTournamentParticipantReplacement('tour-test', 'uid-partner', '', 'power');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(opened.length, 2, 'nome manual e UID abrem a mesma tela');
  assert.equal(opened[0].categoryId, 'light', 'categoria desambigua inscrições repetidas');
  assert.equal(opened[0].manualId, 'manual-a');
  assert.equal(opened[1].categoryId, 'power');
  assert.equal(opened[1].uid, 'uid-partner');
  assert.equal(opened[1].name, 'Parceira da conta', 'UID sem nome no roster busca perfil atual');
  assert.deepEqual(errors, []);
  console.log('✓ troca pelo nome usa identidade e categoria canônicas nas três entradas');
})().catch((error) => { console.error(error); process.exitCode = 1; });
