/* O rótulo conta o MESMO que a barra — node tests/lz-label-equals-bar.test.js
 * O dono viu "torneio 4 de 8" logo acima de "Torneios 5 de 8". O rótulo contava o que
 * estava sendo lido AGORA (lidos+1) e a barra contava lidos: dois contadores na mesma tela.
 */
const fs = require('fs'), path = require('path');
const cnt = fs.readFileSync(path.join(__dirname, '..', 'extension', 'content.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// nenhum rótulo pode usar "lidos + 1"
ok(!/toursDone\)\.length \+ 1/.test(cnt), 'o rótulo de torneio não conta lidos+1');
ok(!/ranksDone\)\.length \+ 1/.test(cnt), 'o rótulo de ranking não conta lidos+1');

// e o que a barra conta é a mesma expressão
const cont = cnt.slice(cnt.indexOf('function contagens()'), cnt.indexOf('function contagens()') + 900);
ok(/Object\.keys\(C\.toursDone\)/.test(cont), 'a barra de torneios conta C.toursDone');
ok(/Object\.keys\(C\.ranksDone\)/.test(cont), 'a barra de rankings conta C.ranksDone');
const rotT = cnt.match(/note: 'torneio ' \+ Math\.min\(Object\.keys\(C\.toursDone\)\.length[^,]*/g) || [];
ok(rotT.length >= 2, 'os dois emits do torneio (antes e depois) usam o mesmo contador');
ok(rotT.every(x => !/\+ 1/.test(x)), 'e nenhum deles soma 1');
const rotR = cnt.match(/note: 'ranking ' \+ Math\.min\(Object\.keys\(C\.ranksDone\)\.length[^,]*/g) || [];
ok(rotR.length >= 2, 'idem nos rankings');
ok(rotR.every(x => !/\+ 1/.test(x)), 'e nenhum soma 1');

// a caixa enche com a LISTA antes de abrir o primeiro torneio
ok(/toursList\.slice\(\)\.sort\(/.test(cnt) && /\.slice\(0, 12\)/.test(cnt),
  'a lista de torneios já vira linhas no feed, do mais recente pro mais antigo');
ok(/e mais ' \+ \(toursList\.length - 12\)/.test(cnt), 'e diz quantos ficaram de fora da prévia');

// o nome de exibição do letzplay é capturado
ok(/function _nomeDoPerfilDoc\(doc\)/.test(cnt), 'existe o extrator do nome de exibição');
ok(/nomeExibicao = _nomeDoPerfilDoc\(dp\)/.test(cnt), 'a ETAPA 0 lê o nome junto com os números');
ok(/imp\.profile\.name = nomeExibicao/.test(cnt), 'e ele é carimbado no import');

console.log((fail ? '✗' : '✓') + ' lz-label-equals-bar: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
