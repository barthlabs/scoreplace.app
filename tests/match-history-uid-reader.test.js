const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'match-history.js'), 'utf8');
let ok = 0, fail = 0;
function t(label, cond) { if (cond) { ok++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } }

console.log('\n──── histórico UID-only no leitor ────');
const item = src.slice(src.indexOf('function _scoreplaceRecordToItem'), src.indexOf('window._spScoreplaceItems'));
const loadStart = src.indexOf('async function _fromScoreplace');
const loadEnd = src.indexOf('  function _sourceBadge', loadStart);
t('o corpo do leitor Scoreplace está completo', loadStart >= 0 && loadEnd > loadStart);
const load = src.slice(loadStart, loadEnd);
t('o card resolve rótulo pelo UID vivo', /window\._nameForUid\(p\.uid\)/.test(item));
t('nome gravado aparece apenas como ponte de acervo legado', /return \(p && p\.name\) \|\| ''/.test(item));
t('a lista pré-carrega perfis públicos por UID', /await window\._preloadUserProfiles\(profileUids\)/.test(load));
t('o leitor não tenta perfil privado', !/loadUserProfile\s*\(/.test(item + load));

(async () => {
  const headless = require('./headless.js');
  if (typeof global.document === 'undefined') global.document = { addEventListener() {} };
  if (!headless.window.document) headless.window.document = global.document;
  headless.load('match-history.js');
  headless.window.AppStore = { currentUser: { uid: 'fixture' } };
  headless.window.FirestoreDB = { loadScoreplaceMatchHistory: async () => null };
  let privateError = null;
  try { await headless.window._spScoreplaceItems('fixture'); }
  catch (error) { privateError = error; }
  t('histórico fechado propaga estado privado distinto de falha', !!privateError && privateError.code === 'private');
  headless.window.FirestoreDB.loadScoreplaceMatchHistory = async () => { throw new Error('offline'); };
  let offlineError = null;
  try { await headless.window._spScoreplaceItems('fixture'); }
  catch (error) { offlineError = error; }
  t('falha real de leitura não é rotulada como privacidade', !!offlineError && offlineError.message === 'offline' && offlineError.code !== 'private');
  console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
  if (fail) process.exitCode = 1;
  else console.log('✅ match-history-uid-reader: OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
