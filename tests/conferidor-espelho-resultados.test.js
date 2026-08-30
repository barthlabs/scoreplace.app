/* O conferidor de results deve partir da FONTE canônica, inclusive quando dividida. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'conferir-espelho-resultados.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/Split\.montarDoBanco\(/.test(src), 'torneio dividido é montado pelo núcleo canônico');
ok(/Roster\.collectMatches\(t\)/.test(src), 'jogos são lidos do torneio montado, não do documento magro');
ok(/Roster\.buildSeedDoc\(t, porId\[id\]\)/.test(src), 'estado desejado vem da mesma projeção usada pelo writer');
ok(/Roster\.subdocSignature\(atual\)/.test(src) && /Roster\.subdocSignature\(esperado\)/.test(src),
  'divergência compara a assinatura canônica e ignora metadados irrelevantes');
ok(/camposDiferentes\(atual, esperado\)/.test(src), 'modo detalhe identifica os campos divergentes sem reescrever o espelho');
ok(/results ausentes/.test(src) && /results divergentes/.test(src), 'ausência e divergência são reportadas separadamente');
ok(/NÃO escreve nada/.test(src), 'o script declara explicitamente a auditoria somente de leitura');

console.log((fail ? '✗' : '✓') + ' conferidor-espelho-resultados: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
