const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-analytics.js'), 'utf8');
let ok = 0, fail = 0;
function t(label, cond) { if (cond) { ok++; console.log('  ✓ ' + label); } else { fail++; console.log('  ✗ ' + label); } }

console.log('\n──── análise de histórico UID-only ────');
const block = src.slice(src.indexOf('function _historyPlayerName'), src.indexOf('function _fmtDuration'));
t('rótulo vem do resolvedor público por UID', /window\._nameForUid\(player\.uid\)/.test(block));
t('estatística individual prioriza chave UID', /mySlot\.uid \? r\.playerStats\[mySlot\.uid\]/.test(block));
t('nome é ponte somente para playerStats legado', /r\.playerStats\[mySlot\.name\]/.test(block));
t('homônimos não são confundidos como a mesma pessoa', /pj\.uid && me\.uid && pj\.uid === me\.uid/.test(block));
t('parceiro e adversário usam o resolvedor UID', /name: _historyPlayerName\(pj\)/.test(block));
t('não consulta perfil privado', !/loadUserProfile\s*\(/.test(block));

console.log('\n' + ok + ' asserts OK, ' + fail + ' falha(s)');
if (fail) process.exit(1);
console.log('✅ tournaments-analytics-uid-reader: OK');
