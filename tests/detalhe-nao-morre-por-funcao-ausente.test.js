/* O DETALHE DO TORNEIO NÃO MORRE POR UMA FUNÇÃO AUSENTE
 * node tests/detalhe-nao-morre-por-funcao-ausente.test.js
 *
 * RELATO DO DONO (28/ago/2026): _"como eu vou sortear se nao me der a pagina de detalhe
 * para editar o sorteio ou clicar no botao de sortear"_.
 *
 * ⛔ EU PASSEI MEIO DIA DIZENDO QUE ERA "por desenho" — três vezes, sem nunca medir. Era
 * render morto. `renderTournaments` chamava `window._inscritoIndividualCard` CRU, e essa
 * função mora em participants.js: se aquele arquivo não tiver executado até a linha, o
 * `map` estoura e leva o render do DETALHE inteiro junto. Medido no harness: **0 bytes**
 * de HTML. Página em branco, nenhum erro na cara de quem olha.
 *
 * ⭐ O QUE TORNA ISTO REVOLTANTE: o IRMÃO desta chamada, em bracket.js, já tinha a guarda
 * (`typeof … === 'function' ? … : …`). Duas chamadas da mesma função — uma protegida,
 * outra não — e a desprotegida era a da tela mais usada do app.
 *
 * ⛔ A QUEDA NÃO PODE SER VAZIA NEM MUDA: sem o builder, o inscrito ainda sai pelo NOME e
 * a falha vai pro Sentry. Card feio é recuperável; tela em branco não.
 * [[feedback_init_que_morre_no_meio_e_silencioso]]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const _R = require('./recorte.js');   // ⛔ recorta pelo CONSTRUTO, nunca por tamanho fixo
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
const brk = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

console.log('\n① A chamada do DETALHE está protegida');
const i = src.indexOf('var _mkCard = window._inscritoIndividualCard;');
ok(i > 0, 'o builder é capturado numa variável antes de ser usado');
/* ⛔ ancorado no FIM do bloco, não num número: recorte por tamanho fixo já reprovou
 * teste sem defeito sete vezes neste repo (basta um comentário empurrar a linha). */
const bloco = _R.ateSairDoBloco(src, i);
ok(/typeof _mkCard === 'function'/.test(bloco), '⛔ e o uso é guardado por typeof');
ok(/_captureException/.test(bloco), 'a ausência é REPORTADA (não engolida)');
ok(/window\._pName/.test(bloco), 'e a queda ainda mostra o NOME do inscrito');

console.log('\n② Não sobrou nenhuma chamada crua');
const cru = /window\._inscritoIndividualCard\s*\(/g;
const usos = (src.match(cru) || []).length;
ok(usos === 0, 'tournaments.js não chama mais a função direto pelo window (achados: ' + usos + ')');
ok(/typeof window\._inscritoIndividualCard === 'function'/.test(brk),
   'e bracket.js segue com a guarda que ele já tinha');

console.log('\n③ A lição, travada: quem desenha a tela não pode depender de fé');
ok(!/\.map\(function \(p\) \{ return window\._inscritoIndividualCard/.test(src),
   '⛔ o `map` cru — o que produzia 0 bytes de HTML — não voltou');

console.log(falhas === 0
  ? '\n✅ função ausente vira card feio, nunca tela em branco\n'
  : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
