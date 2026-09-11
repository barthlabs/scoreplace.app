/* A limpeza L8 é uma operação administrativa explícita: nunca muda um órfão que carregue
 * informação não derivável e só conclui depois de reler o estado. */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'remover-orfaos-espelho-resultados.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('✗ ' + m); } }
ok(/--tid/.test(src) && /Não há modo global/.test(src), 'exige um torneio específico; não há limpeza global');
ok(/r\.missing \|\| r\.divergent/.test(src), 'recusa limpar se o espelho canônico não estiver íntegro');
ok(/o\.risco\.placar \|\| o\.risco\.wo \|\| o\.risco\.replay \|\| o\.risco\.pendente/.test(src), 'placar, W.O., replay e pendência bloqueiam a exclusão');
ok(/const depois = auditar\(\)/.test(src) && /depois\.orphans\.length/.test(src), 'relê e exige pós-condição limpa');
ok(/method: 'DELETE'/.test(src) && /for \(const item of candidatos\)/.test(src), 'só apaga os candidatos comprovados pelo conferidor');
console.log((fail ? '✗ ' : '✓ ') + pass + ' asserções');
process.exitCode = fail ? 1 : 0;
