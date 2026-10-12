'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/create-tournament.js'), 'utf8');
const format2 = fs.readFileSync(path.join(__dirname, '..', 'js/views/format2.js'), 'utf8');
const main = fs.readFileSync(path.join(__dirname, '..', 'js/main.js'), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }

const start = source.indexOf('const tourData = {');
const end = source.indexOf('// Tiebreakers', start);
const save = source.slice(start, end === -1 ? source.length : end);

ok('o salvamento passa pelo compilador único',
  save.includes('window.FORMAT2.compileToPhases') && save.includes('tourData.phases = _f2out.phases'));
ok('novo save não lê controles suíços para gravar top-level',
  !/getElementById\('suico-(?:rounds|first-draw-date|first-draw-time|draw-interval|manual-draw)'\)/.test(save));
ok('campo transitório swissRounds sempre é limpo no save atual',
  /tourData\.swissRounds\s*=\s*null;/.test(save) && !/tourData\.swissRounds\s*=\s*parse/.test(save));
ok('pareamento e rodadas ficam no contrato de fase, não num modo paralelo',
  format2.includes("classification: { structure: 'round_robin', pairing: _roundPairing }") &&
  format2.includes('rounds: cfg.rodadas.n'));
ok('o contrato de configuração não admite suíço como estrutura de fase',
  !/structure\s*:\s*['\"]swiss['\"]/.test(format2) &&
  format2.includes("strategy: 'ranking_clusters'"));
ok('o formulário normaliza a chave legada antes de recalcular a interface',
  source.includes("if (formatSelect.value === 'suico') formatSelect.value = 'liga';"));
ok('o formulário não volta a sugerir nem a persistir suíço como formato novo',
  !source.includes("{ key: 'suico', label: 'Suíço Clássico', optVal: 'suico' }") &&
  !/formatMap\s*=\s*\{[^}]*suico:\s*['\"]Suíço Clássico['\"]/.test(save));
ok('a ajuda não apresenta suíço como solução ou formato independente',
  !main.includes('Repescagem, Suíço, Reabrir') &&
  !main.includes('<b>Suíço</b> — Várias rodadas antes de afunilar'));

console.log((fail ? '❌' : '✅') + ' format2-novo-sem-suico: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
