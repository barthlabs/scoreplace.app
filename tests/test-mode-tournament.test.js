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
assert(/class="toggle-switch"[^>]*>[\s\S]*?<input type="checkbox" role="switch" id="tourn-test-mode"[\s\S]*?<span class="toggle-slider"><\/span>/.test(form),
  'modo de teste usa o mesmo controle deslizante dos demais toggles');
const html = fs.readFileSync('index.html', 'utf8');
const editorAssetVersion = (html.match(/js\/views\/create-tournament\.js\?v=(\d+\.\d+\.\d+)/) || [])[1];
assert(editorAssetVersion && editorAssetVersion.split('.').map(Number).reduce((n, part) => n * 1000 + part, 0) > 2007019,
  'a ficha deve usar um endereço novo para invalidar o formulário antigo em cache');
const dashboard = fs.readFileSync('js/views/dashboard.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');
const courtStart = bracket.indexOf('var _gameOrder = Number(matchNum);');
const courtEnd = bracket.indexOf('var _busyPlaceholder = ', courtStart);
assert(courtStart >= 0 && courtEnd > courtStart);
const suggestCourt = new Function('matchNum', '_cardCourts', '_freeCourts', '_preferredCourt',
  '_persistedBusy', '_persistedCourt', 'opts', 'm', '_suggestedCourt',
  bracket.slice(courtStart, courtEnd) + '\nreturn _displayCourt;');
const courts = Array.from({ length: 9 }, (_, i) => 'Quadra ' + (i + 1));
assert.deepEqual([1, 2, 3, 10].map(n => suggestCourt(n, courts, courts, '', false, '', {}, {}, '')),
  ['Quadra 1', 'Quadra 2', 'Quadra 3', 'Quadra 1'],
  'jogos recebem sugestão pela ordem, com volta após a última quadra');
assert.equal(suggestCourt(2, courts, courts, '', false, 'Quadra 7', {}, {}, ''), 'Quadra 7',
  'quadra já escolhida pelo organizador prevalece');
assert.equal(suggestCourt(2, courts, courts.filter(c => c !== 'Quadra 2'), '', false, '', {}, {}, ''), 'Quadra 1',
  'quadra ocupada não é sugerida');
assert(bracket.includes("(_isSuperEightMon ? '' : '<div class=\"sp-monarch-group-title-row\"") &&
  bracket.includes('var _mineBadgeMon = _isMineMon && !_isSuperEightMon'),
  'o cabeçalho técnico do grupo e o selo SEU GRUPO não aparecem no Super 8');
const crownStart = dashboard.indexOf('var _showMonarchCrown = ');
const crownEnd = dashboard.indexOf('var _cardTab', crownStart);
assert(crownStart >= 0 && crownEnd > crownStart);
const showsCrown = new Function('item', 'tRef', dashboard.slice(crownStart, crownEnd) + '\nreturn _showMonarchCrown;');
assert.equal(showsCrown({ m:{ isMonarch:true } }, { superEight:true }), false,
  'o Super 8 usa o motor das parcerias, mas não exibe coroa de Rei/Rainha');
assert.equal(showsCrown({ m:{ isMonarch:true } }, { superEight:false }), true,
  'Rei/Rainha mantém a coroa');
assert(fs.readFileSync('functions-autodraw/tournament-create.js', 'utf8')
  .includes("key === 'testModeEnabled'"), 'criação não aceita ativação forjada do modo de teste');

const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const syncStart = source.indexOf("if (Object.prototype.hasOwnProperty.call(patch, 'resultEntry') && Array.isArray(t.phases)");
const syncEnd = source.indexOf('if (camisNameRebase)', syncStart);
assert(syncStart >= 0 && syncEnd > syncStart);
const syncResultEntry = new Function('t', 'patch', source.slice(syncStart, syncEnd));
const configured = { resultEntry:['organizer'], phases:[{ resultEntry:'organizer' }, { resultEntry:'referee' }] };
syncResultEntry(configured, { resultEntry:['organizer','players'] });
assert.deepEqual(configured.phases[0].resultEntry, ['organizer','players'],
  'editar quem lança o placar atualiza a permissão canônica da classificatória');
assert.equal(configured.phases[1].resultEntry, 'referee', 'a fase futura conserva sua regra própria');
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
