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
ok(/tournaments_backup\/\$\{t\.id\}/.test(src) && /tournamentSplitReceipts\/\$\{t\.id\}/.test(src),
  'o gate distingue backup pré-divisão de recibo canônico auditado');
ok(/splitProvenance/.test(src) && /born-canonical/.test(src),
  'torneio que já nasceu dividido tem prova própria, sem backup histórico inventado');
ok(!/\/participants`, tk\),\n\s*lista\(`\$\{BASE\}\/tournaments\/\$\{t\.id\}\/history/.test(src),
  'não volta a ler a coleção participants fixa');
ok(/const fora = S\.partesDe\(config\)/.test(src),
  'a fonte canônica é invariável: todo torneio é lido como dividido');
ok(/MARCADOR DE COMPATIBILIDADE AUSENTE OU INCOMPLETO/.test(src),
  'marcador legado ausente vira bloqueio de compatibilidade, nunca caminho de torneio inteiro');
ok(!/PARTES_DO_ESPELHO_LEGADO/.test(src) && !/estado\.dividida/.test(src),
  'não resta caminho de auditoria para torneio inteiro');
ok(/process\.exitCode = problemasN \? 1 : 0/.test(src) && !/process\.exit\(problemasN/.test(src),
  'o veredito não é truncado por process.exit antes do stdout esvaziar');
ok(/function contaRegistrosMontados/.test(src) && /registro\.item != null/.test(src),
  'a prova conta o conteúdo dos registros, não buracos materializados em índices históricos');
ok(/const CONCORRENCIA = 8/.test(src) && /await emLotes\(torneios, CONCORRENCIA/.test(src),
  'a auditoria completa usa concorrência limitada, sem deixar a prova serial expirar');

console.log((fail ? '✗' : '✓') + ' conferidor-fase2-segue-a-fonte-canonica: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
