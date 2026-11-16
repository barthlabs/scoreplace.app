'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const form = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const ranking = form.indexOf('id="ranking-primary-choice"');
const scores = form.indexOf('id="result-entry-section"');
const tie = form.indexOf('id="tie-resolution-section"');
assert(ranking >= 0 && ranking < scores && scores < tie,
  'quem lança o placar vem após o critério principal e antes do desempate');
assert(form.includes("rowt('organizer'") && form.includes("rowt('players'") && form.includes("rowt('referee'"),
  'organizador, participantes e árbitro mantêm controles independentes');
assert(form.includes("id=\"tourn-test-mode-row\"") && form.includes("id=\"tourn-test-mode\""),
  'modo de teste está no formulário');
assert(fs.readFileSync('functions-autodraw/tournament-create.js', 'utf8')
  .includes("key === 'testModeEnabled'"), 'criação não aceita ativação forjada do modo de teste');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = source.indexOf('exports.resetTournamentToEnrollment = onCall(');
const end = source.indexOf('// ─── Rodada extra manual', start);
assert(start >= 0 && end > start);
const developerUid = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
let writes = 0;
let tournament = null;
const win = {
  _clearTournamentDraw(t) {
    t.matches = []; t.rounds = []; t.groups = []; t.tournamentStarted = null;
    t.finishedAt = null; t._finished = false;
  },
  _hasAnyMatchResult: () => true
};
const context = {
  exports: {}, onCall: (_options, fn) => fn, HttpsError: class extends Error {},
  TEST_DEVELOPER_UID: developerUid, drawWindow: win,
  _rehearsal: { makeService: () => ({ restore: () => { throw Error('rehearsal'); } }) },
  db: {
    collection(name) { return { doc(id) { return { name, id, collection: () => ({ doc: () => ({}) }) }; } }; },
    runTransaction(fn) { return fn({ delete() {}, get: async () => ({ exists: true, data: () => tournament }) }); }
  },
  _leTorneio: async () => tournament,
  _isTournamentAdmin: (t, uid) => t.creatorUid === uid,
  _drawFail: (code, message) => Object.assign(new Error(message), { code }),
  _antesDoMotor: t => JSON.parse(JSON.stringify(t)),
  _gravaTorneio: (_tx, _ref, t) => { writes++; return { clean: JSON.parse(JSON.stringify(t)) }; },
  hasDrawnBracket: t => (t.matches || []).length > 0
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const reset = context.exports.resetTournamentToEnrollment;
function mkTournament(enabled) {
  return { id: 't', creatorUid: developerUid, testModeEnabled: enabled,
    status: 'finished', _finished: true, tournamentStarted: 10,
    participants: [{ uid: 'a' }, { uid: 'b' }],
    matches: [{ id: 'm', winner: 'A', scoreP1: 6, scoreP2: 4 }], rounds: [{ round: 1 }] };
}
async function call(uid) { return reset({ auth: { uid }, data: { tournamentId: 't', restoreMode: 'testModePreDraw' } }); }
(async () => {
  tournament = mkTournament(false);
  await assert.rejects(call(developerUid), /não está habilitada/);
  assert.equal(writes, 0);
  tournament = mkTournament(true);
  await assert.rejects(call('outro'), /Só a organização/);
  assert.equal(writes, 0);
  const reply = await call(developerUid);
  assert.equal(reply.ok, true);
  assert.equal(reply.tournament.status, 'closed');
  assert.equal(reply.tournament.matches.length, 0);
  assert.equal(reply.tournament.rounds.length, 0);
  assert.equal(reply.tournament.participants.length, 2);
  assert.equal(reply.tournament.testModeEnabled, true);
  assert.equal(writes, 1);
  console.log('✓ modo de teste: permissão, reset com placar e ordem dos controles');
})().catch(error => { console.error(error); process.exitCode = 1; });
