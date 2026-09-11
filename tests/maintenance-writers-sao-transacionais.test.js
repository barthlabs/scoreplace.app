const fs = require('fs');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
const cats = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
const tourn = fs.readFileSync('js/views/tournaments.js', 'utf8');
const dash = fs.readFileSync('js/views/dashboard.js', 'utf8');
const auto = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const purge = cats.slice(cats.indexOf('window.renderCategoryManagerPage = function'), cats.indexOf('// Central re-render:', cats.indexOf('window.renderCategoryManagerPage = function')));
const dedup = tourn.slice(tourn.indexOf('// Deduplicação de participantes'), tourn.indexOf('// Build organizers section', tourn.indexOf('// Deduplicação de participantes')));
ok(/_requestTournamentCategoryNormalization\(tId\)/.test(purge) && /exports\.normalizeTournamentCategories/.test(auto), 'limpeza passiva só solicita a normalização transacional da Function');
ok(!/AppStore\.(?:mutate|commitTournamentTx)|saveTournament\(|AppStore\.sync\(/.test(purge), 'limpeza passiva não escreve no navegador');
ok(/commitTournamentTx/.test(dedup) && /_deduplicateParticipants\(ft\)/.test(dedup), 'deduplicação passiva reaplica no documento fresco');
ok(!/saveTournament\(|AppStore\.sync\(/.test(dedup), 'deduplicação passiva não regrava snapshot inteiro');
ok(!tourn.includes('_applyLigaSeasonClosure') && /_requestExpiredLeagueSeasonClose\(t\)/.test(tourn) && /closeExpiredLeagueSeason/.test(dash), 'fechamento de temporada só é solicitado pela tela, sem escritor local');
ok(/exports\.closeExpiredLeagueSeason/.test(auto) && /runTransaction/.test(auto) && /_gravaTorneio\(tx/.test(auto), 'fechamento automático relê e grava o documento fresco na transação da Function');
if (fail) process.exit(1);
