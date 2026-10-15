'use strict';

const assert = require('assert');
const fs = require('fs');
const { window: engineWindow } = require('./headless.js');
const source = fs.readFileSync('js/views/bracket-ui.js', 'utf8');
const start = source.indexOf('async function _confirmAdministrativeResultFromServer(');
const end = source.indexOf('window._organizerResetMatch =', start);
assert(start >= 0 && end > start, 'helper de confirmação administrativa existe');
const body = source.slice(start, end);
assert(body.indexOf('loadTournamentById(tId)') >= 0, 'releitura canônica após commit');
assert(body.indexOf('window._applyCFTournament(tId, fresh)') >= 0, 'espelho recebe documento completo');
assert(body.indexOf('window._applyCFTournament(tId, fresh)') < body.indexOf("showNotification(title, detail, 'success')"),
  'sucesso só é anunciado depois de aplicar o documento fresco');
const events = [];
const fakeWindow = {
  _collectAllMatches: engineWindow._collectAllMatches,
  FirestoreDB: { loadTournamentById: async () => {
    events.push('server');
    return { matches: [{ id: 'j1' }] };
  } },
  _applyCFTournament: () => events.push('apply')
};
const confirm = new Function('window', 'showNotification', body +
  '\nreturn _confirmAdministrativeResultFromServer;')(fakeWindow,
  (_title, _detail, kind) => events.push(kind));
const run = async () => {
  assert.strictEqual(await confirm('t1', 'j1', 'ok', ''), true);
  assert.deepStrictEqual(events, ['server', 'apply', 'success']);
  for (const nested of [
    { matches: [], rounds: [{ matches: [{ id: 'j1' }] }] },
    { matches: [], groups: [{ matches: [{ id: 'j1' }] }] }
  ]) {
    events.length = 0;
    fakeWindow.FirestoreDB.loadTournamentById = async () => { events.push('server'); return nested; };
    assert.strictEqual(await confirm('t1', 'j1', 'ok', ''), true,
      'jogo em rounds/groups também confirma o snapshot canônico');
    assert.deepStrictEqual(events, ['server', 'apply', 'success']);
  }
  events.length = 0;
  fakeWindow.FirestoreDB.loadTournamentById = async () => {
    events.push('server');
    return { matches: [{ id: 'outro' }] };
  };
  assert.strictEqual(await confirm('t1', 'j1', 'ok', ''), false);
  assert.deepStrictEqual(events, ['server', 'warning'], 'jogo ausente não produz falso sucesso');
};
for (const action of ['reset-match', 'revert-wo', 'reopen-result']) {
  const i = source.indexOf("action: '" + action + "'");
  assert(i >= 0, action + ' usa callable');
  const endOfHandler = source.indexOf('\n};', i);
  assert(endOfHandler > i && source.slice(i, endOfHandler).includes('_confirmAdministrativeResultFromServer'),
    action + ' aguarda a releitura completa');
}
run().then(() => console.log('✓ operações administrativas confirmam a chave completa antes de anunciar atualização'))
  .catch(error => { console.error(error); process.exitCode = 1; });
