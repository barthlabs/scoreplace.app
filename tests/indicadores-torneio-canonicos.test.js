/* Indicadores canônicos do torneio: dashboard e detalhe não podem divergir.
 * node tests/indicadores-torneio-canonicos.test.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
const cats = fs.readFileSync(path.join(ROOT, 'js/views/tournaments-categories.js'), 'utf8');
let bad = 0;
function ok(v, msg) { console.log((v ? '✓' : '✗') + ' ' + msg); if (!v) bad++; }

ok(/project_tournament_countdown_dd_hh_mm_ss/.test(store), 'a regressiva de evento tem contrato canônico DD:HH:MM:SS');
ok(/return _p2\(d\) \+ 'd ' \+ _p2\(h\) \+ 'h ' \+ _p2\(m\) \+ 'm ' \+ _p2\(s\) \+ 's'/.test(store), 'dias, horas, minutos e segundos sempre aparecem');
ok(/Estimativa de duração total/.test(cats), 'a previsão é explicitamente total');
const forecast = cats.slice(cats.indexOf('window._buildDurationForecast'));
ok(!/_titleLbl \+= ' por bloco'/.test(forecast) && !/\/categoria/.test(forecast), 'o card não apresenta bloco nem categoria como duração');
ok(/reduce\(function\(total, k\)[\s\S]*return total \+ rounds/.test(cats), 'os blocos entram somados na duração total');
ok(/var _summary = \[d\.realCount/.test(cats) && /dupla/.test(forecast) && /teamsPerCategory/.test(forecast) && /_summary\.push\(d\.matches/.test(cats), 'o resumo contém participantes, duplas, times e jogos');
console.log((bad ? '❌' : '✅') + ' indicadores-torneio-canonicos: ' + (6 - bad) + ' ok, ' + bad + ' falha(s)');
process.exitCode = bad ? 1 : 0;
