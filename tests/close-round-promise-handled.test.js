// O erro de closeRound já é mostrado dentro de _doCloseRound. Chamadores fire-and-forget
// devem consumi-lo para não criar unhandledrejection/Sentry falso; a aprovação encadeia o catch dela.
const fs = require('fs');
let n = 0;
function ok(v, m) { if (!v) { console.error('✗ ' + m); process.exitCode = 1; } else { n++; console.log('✓ ' + m); } }
const ui = fs.readFileSync('js/views/bracket-ui.js', 'utf8');
const bracket = fs.readFileSync('js/views/bracket.js', 'utf8');
ok(ui.includes('window._closeRound(tId, _roundIdxAuto, matchId, _closeResultCtx).catch(function() {});'), 'auto-close consome rejeição');
ok(bracket.includes('window._closeRound(t.id, currentRound - 1).catch(function() {});'), 'safety-net consome rejeição');
ok((bracket.split('.catch(function(){})').length - 1) >= 2, 'botões de fechar consomem rejeição');
console.log('✓ ' + n + ' asserções');
