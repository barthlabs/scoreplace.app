/* O REPLAY TEM QUE APARECER, INCLUSIVE COM ALGO EM TELA CHEIA
 * node tests/replay-aparece-em-tela-cheia.test.js
 *
 * A FALHA REAL (relato do dono, 18/ago/2026): _"clicando no botão de replay, o replay
 * passava atrás da tela em que estávamos e ficava não visível corretamente"_.
 *
 * ⚠️ NÃO ERA Z-INDEX, e essa é a parte que engana: o overlay do replay usava 100060, o
 * MAIOR valor do app inteiro. É escopo de RENDERIZAÇÃO — o navegador desenha SÓ a
 * subárvore do elemento em tela cheia (`requestFullscreen`), e o que estiver pendurado
 * no `body` fica FORA, por maior que seja a camada. Subir o z-index nunca resolveria.
 *
 * ⚠️ ESTE ARQUIVO FOI REVISADO NA 1.9.60, DE PROPÓSITO — e o motivo importa mais que
 * as asserções. Ele travava o MECANISMO do conserto de 1.9.59 (o replay perguntava
 * `document.fullscreenElement` antes de se pendurar). Esse mecanismo deixou de existir
 * porque a CAUSA deixou de existir: o replay não é mais um segundo overlay. Ele virou
 * o próprio placar ao vivo em modo reprodução (`opts.replay` em `_openLiveScoring`),
 * então não há mais um elemento solto pra pendurar no lugar errado.
 *
 * O QUE ESTE ARQUIVO GUARDA, ENTÃO, É O INVARIANTE E NÃO O MECANISMO:
 *
 *     NÃO PODE EXISTIR UMA SEGUNDA TELA DE REPLAY PENDURADA ÀS CEGAS NO BODY.
 *
 * Enquanto o replay for a mesma tela do placar, o invariante vale por construção.
 * Se um dia alguém reintroduzir um overlay próprio, estas asserções cobram de volta a
 * pergunta pelo elemento em tela cheia — que é a única forma de aquele desenho
 * funcionar. É a mesma regra de manutenção do `sw-abre-sem-tela-branca`: forma nova de
 * o replay sumir da tela entra NESTE arquivo.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const replay = fs.readFileSync(path.join(ROOT, 'js', 'views', 'match-replay.js'), 'utf8');
const bui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

console.log('\nO REPLAY APARECE — MESMO COM ALGO EM TELA CHEIA');

// a premissa: alguma tela realmente entra em tela cheia (se sair, a regra perde sentido)
ok(/requestFullscreen|webkitRequestFullscreen/.test(bui),
   'o app entra em tela cheia em algum ponto (a premissa desta regra)');

// ── O caminho de hoje: uma tela só ────────────────────────────────────────────
// `_openLiveScoring` remove o overlay anterior e cria o SEU, que é o que o usuário
// está vendo — não há um segundo elemento disputando escopo de desenho com ele.
ok(/window\._openLiveScoring/.test(replay),
   'o replay é o PLACAR AO VIVO (delega em vez de desenhar tela própria)');
ok(!/createElement\(['"]div['"]\)[\s\S]{0,600}?position:fixed/.test(replay),
   'match-replay.js não cria overlay próprio — não há segunda tela pra sumir atrás');

// ── A trava de verdade: se um overlay próprio VOLTAR, ele tem que perguntar ────
// (hoje o antecedente é falso e as duas passam de graça; elas existem pra o dia em
// que alguém reintroduzir o desenho paralelo — e aí o custo já está pago.)
var criaOverlay = /document\.createElement\(['"]div['"]\)/.test(replay);
ok(!criaOverlay || /document\.fullscreenElement/.test(replay),
   'se voltar a existir overlay próprio, ele pergunta quem está em tela cheia');
ok(!criaOverlay || /webkitFullscreenElement/.test(replay),
   'e cobre o prefixo webkit (Safari/WKWebView, que é onde o dono viu)');
ok(!/document\.body\.appendChild\(ov\)/.test(replay),
   'não existe append cego no body (era exatamente a causa de 1.9.59)');

// ── E a reprodução tem que aparecer DENTRO do placar, não pendurada no body ────
ok(/overlay\.appendChild\(_rBar\)/.test(bui),
   'a barra de controle da reprodução nasce DENTRO do overlay do placar');

console.log(falhas === 0 ? '\n✅ o replay nasce dentro do escopo desenhado\n' : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
