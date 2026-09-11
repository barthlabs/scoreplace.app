const fs = require('fs');
const s = fs.readFileSync('js/store.js', 'utf8');
const form = fs.readFileSync('js/views/create-tournament.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const add = s.slice(s.indexOf('  addTournament(data) {'), s.indexOf('  logAction(', s.indexOf('  addTournament(data) {')));
ok(/var _isExisting = _idx !== -1/.test(add), 'separa edição existente de criação nova');
ok(/_isExisting[\s\S]*?_callCF\('updateTournamentConfiguration'/.test(add) && !/_isExisting[\s\S]*?commitTournamentTx/.test(add), 'edição despacha somente o patch para a Function');
ok(/_subirImagemTorneio[\s\S]*?_callCF\('updateTournamentConfiguration'/.test(add), 'upload de imagem termina antes do comando de edição');
ok(/Object\.assign\(tourData, fresh\)[\s\S]*?_saveToCache/.test(add), 'cache só recebe o retorno canônico do servidor');
ok(add.includes("_callFn('createTournament'") && !add.includes('saveTournament('), 'criação nova usa a Function especializada');
const submit = form.slice(form.indexOf('if (editId) {'), form.indexOf('// Auto-assign categories', form.indexOf('if (editId) {')));
ok(/await window\.AppStore\.addTournament\(tourData\)/.test(submit), 'formulário espera a resposta da porta canônica');
ok(!/AppStore\.sync\(/.test(submit), 'formulário não regrava o snapshot após a porta canônica');
if (fail) process.exit(1);
