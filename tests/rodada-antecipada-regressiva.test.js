/* Regressão: encerrar uma rodada antes do horário programado inicia imediatamente
 * a regressiva da próxima rodada, preservando o prazo final planejado dela.
 * node tests/rodada-antecipada-regressiva.test.js */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-utils.js'), 'utf8');
let fail = 0, pass = 0;
function ok(value, label) { if (value) { pass++; console.log('  ✓ ' + label); } else { fail++; console.error('  ✗ ' + label); } }

const progress = src.slice(src.indexOf('window._phaseCurrentRoundProgress'), src.indexOf('// HTML interno', src.indexOf('window._phaseCurrentRoundProgress')));
const renderer = src.slice(src.indexOf('if (_inLaterPhase'), src.indexOf('if (_isLiga', src.indexOf('if (_inLaterPhase') + 1));

ok(progress.includes('var _prevRound = _idx > 0 ? rounds[_idx - 1] : null;'), 'considera apenas a rodada imediatamente anterior');
ok(progress.includes('(byRound[_prevRound] || []).filter'), 'o fim efetivo vem dos resultados daquela rodada anterior');
ok(renderer.includes('var _effectiveRoundStart = _pr.roundStartMs || _pr.prevRoundEndMs || null;'), 'guarda o início efetivo antes de calcular a janela programada');
ok(renderer.includes('actualStart = _effectiveRoundStart || ((schedStart <= now) ? schedStart : null);'), 'o início antecipado não é apagado se o horário programado ainda é futuro');
ok(renderer.replace(/\s+/g, ' ').includes('fim programado dela'), 'o contrato explica que a antecipação não altera o fim planejado');

console.log('\n' + (fail ? '❌' : '✅') + ' rodada-antecipada-regressiva: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exitCode = fail ? 1 : 0;
