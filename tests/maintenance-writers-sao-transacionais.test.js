const fs = require('fs');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const cats = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
const tourn = fs.readFileSync('js/views/tournaments.js', 'utf8');
const purge = cats.slice(cats.indexOf('// v2.4.29: ao abrir, limpa categorias mortas'), cats.indexOf('_renderModal();', cats.indexOf('// v2.4.29: ao abrir, limpa categorias mortas')));
const dedup = tourn.slice(tourn.indexOf('// Deduplicação de participantes'), tourn.indexOf('// Build organizers section', tourn.indexOf('// Deduplicação de participantes')));
ok(/commitTournamentTx/.test(purge) && /_purgeInvalidParticipantCategories\(ft\)/.test(purge), 'limpeza passiva de categorias reaplica no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(purge), 'limpeza passiva não regrava snapshot inteiro');
ok(/commitTournamentTx/.test(dedup) && /_deduplicateParticipants\(ft\)/.test(dedup), 'deduplicação passiva reaplica no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(dedup), 'deduplicação passiva não regrava snapshot inteiro');
if (fail) process.exit(1);
