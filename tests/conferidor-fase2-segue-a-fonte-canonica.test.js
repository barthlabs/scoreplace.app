/* O CONFERIDOR DA FASE 2 SEGUE A FONTE CANÔNICA
 *
 * Regressão de 30/ago: ele lia `participants` fixo quando o núcleo mapeia a parte
 * para `inscritos`, e comparava a remontagem completa ao documento já reduzido.
 * O resultado era 14 falsos bloqueios e nenhuma prova útil sobre a fonte viva.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'scripts', 'conferir-banco-novo.js'), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

ok(/S\.colecaoDaParte\(nome\)/.test(src), 'a coleção vem do núcleo, não de nome fixo');
ok(/S\.montarDoBanco\(/.test(src), 'torneio dividido usa o mesmo montador do app e da CF');
ok(/S\.dividir\(JSON\.parse\(JSON\.stringify\(montado\)\), nomes\)/.test(src),
  'a prova do dividido inverte montagem → divisão antes de aprovar');
ok(/tournaments_backup\/\$\{t\.id\}/.test(src), 'backup pré-divisão é obrigatório no gate');
ok(!/\/participants`, tk\),\n\s*lista\(`\$\{BASE\}\/tournaments\/\$\{t\.id\}\/history/.test(src),
  'não volta a ler a coleção participants fixa');
ok(/PARTES_DO_ESPELHO_LEGADO/.test(src) && /if \(!estado\.dividida\)/.test(src),
  'espelho legado e fonte viva dividida continuam sendo provas distintas');

console.log((fail ? '✗' : '✓') + ' conferidor-fase2-segue-a-fonte-canonica: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
