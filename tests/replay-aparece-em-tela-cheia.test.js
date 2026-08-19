/* O REPLAY PRECISA NASCER DENTRO DE QUEM ESTÁ EM TELA CHEIA
 * node tests/replay-aparece-em-tela-cheia.test.js
 *
 * A FALHA REAL (relato do dono, 18/ago/2026): _"clicando no botão de replay, o replay
 * passava atrás da tela em que estávamos e ficava não visível corretamente"_.
 *
 * ⚠️ NÃO ERA Z-INDEX, e essa é a parte que engana: o overlay do replay usa 100060, o
 * MAIOR valor do app inteiro. É escopo de RENDERIZAÇÃO. O placar ao vivo entra em tela
 * cheia (`requestFullscreen` em bracket-ui.js) e o navegador desenha SÓ a subárvore do
 * elemento em tela cheia — o que estiver pendurado no `body` fica FORA e não aparece,
 * por maior que seja a camada. Subir o z-index nunca resolveria.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let falhas = 0;
function ok(c, m) { if (c) { console.log('  ✓ ' + m); return; } falhas++; console.log('  ✗ ' + m); }

const replay = fs.readFileSync(path.join(ROOT, 'js', 'views', 'match-replay.js'), 'utf8');
const bui = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');

console.log('\nREPLAY APARECE MESMO COM O PLACAR EM TELA CHEIA');

// a premissa: o placar realmente entra em tela cheia (se sair, esta regra perde sentido)
ok(/requestFullscreen|webkitRequestFullscreen/.test(bui),
   'o placar ao vivo entra em tela cheia (a premissa desta regra)');

// o replay escolhe o host certo
ok(/document\.fullscreenElement/.test(replay),
   'o replay pergunta quem está em tela cheia antes de se pendurar');
ok(/webkitFullscreenElement/.test(replay),
   'e cobre o prefixo webkit (Safari/WKWebView, que é onde o dono viu)');
ok(/\|\|\s*document\.body/.test(replay),
   'sem tela cheia, `body` continua sendo o host');
ok(!/^\s*document\.body\.appendChild\(ov\);/m.test(replay),
   'não sobrou o append cego no body (era a causa)');

console.log(falhas === 0 ? '\n✅ o replay nasce dentro do escopo desenhado\n' : '\n❌ ' + falhas + ' falha(s)\n');
process.exit(falhas === 0 ? 0 : 1);
