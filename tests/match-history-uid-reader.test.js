const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'match-history.js'), 'utf8');
let ok = 0, fail = 0;
function t(label, cond) { if (cond) { ok++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } }

console.log('\n──── histórico UID-only no leitor ────');
const item = src.slice(src.indexOf('function _scoreplaceRecordToItem'), src.indexOf('window._spScoreplaceItems'));
const load = src.slice(src.indexOf('async function _fromScoreplace'), src.indexOf('async function _fromScoreplace') + 2600);
t('o card resolve rótulo pelo UID vivo', /window\._nameForUid\(p\.uid\)/.test(item));
t('nome gravado aparece apenas como ponte de acervo legado', /return \(p && p\.name\) \|\| ''/.test(item));
t('a lista pré-carrega perfis públicos por UID', /await window\._preloadUserProfiles\(profileUids\)/.test(load));
t('o leitor não tenta perfil privado', !/loadUserProfile\s*\(/.test(item + load));

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) process.exit(1);
console.log('✅ match-history-uid-reader: OK');
