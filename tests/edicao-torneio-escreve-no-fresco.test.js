const fs = require('fs');
const s = fs.readFileSync('js/store.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const add = s.slice(s.indexOf('  addTournament(data) {'), s.indexOf('  logAction(', s.indexOf('  addTournament(data) {')));
ok(/var _isExisting = _idx !== -1/.test(add), 'separa edição existente de criação nova');
ok(/_isExisting[\s\S]*?commitTournamentTx/.test(add) && /Object\.keys\(_editPatch\)/.test(add), 'edição reaplica somente o patch no documento fresco');
ok(/_subirImagemTorneio[\s\S]*?_persistEdit/.test(add), 'upload de imagem termina antes da transação de edição');
ok(/else if \(window\.FirestoreDB && window\.FirestoreDB\.db\)[\s\S]*?saveTournament\(tourData, \{ withImages: true \}\)/.test(add), 'criação nova mantém a porta especializada');
if (fail) process.exit(1);
