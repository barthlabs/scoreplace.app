'use strict';

const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts/migrar-fases-legadas.js'), 'utf8');
let pass = 0;
let fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }

ok('o censo de marcadores transitórios existe', source.includes('function legacySwissMarkers'));
ok('censo mede os quatro marcadores sem inferir por nome de jogador',
  /format: String\(t\.format \|\| ''\) === 'Suíço Clássico'/.test(source) &&
  /classifyFormat: String\(t\.classifyFormat \|\| ''\) === 'swiss'/.test(source) &&
  /currentStage: String\(t\.currentStage \|\| ''\) === 'swiss'/.test(source) &&
  /swissRounds: t\.swissRounds !== null/.test(source));
ok('dry-run só enumera os marcadores e não os envia no PATCH',
  source.includes('updateMask.fieldPaths=phases') &&
  !/fieldPaths=phases,swissRounds/.test(source) &&
  !/fields:\s*\{[^}]*swissRounds/.test(source));
ok('relatório mostra o total por marcador', source.includes('marcadores suíços transitórios (somente censo)'));

console.log((fail ? '❌' : '✅') + ' migrar-fases-legadas-censo: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
