/* Formação de dupla na lista de Inscritos: a resposta canônica deve repintar
 * imediatamente e o card arrastado deve preservar seu lugar como fantasma.
 * node tests/duplas-rehydrate-drag-ghost.test.js */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const tournaments = fs.readFileSync(path.join(root, 'js', 'views', 'tournaments.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js', 'store.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css', 'components.css'), 'utf8');
let pass = 0;
function ok(condition, message) {
  if (!condition) { console.error('✗ ' + message); process.exit(1); }
  pass++;
}

ok(tournaments.includes('t.participants = _r.participants'), 'formPair aplica o roster canônico retornado pela Function');
ok(tournaments.includes('window._pdetailSig = null'), 'a assinatura da página de inscritos é invalidada para reidratar a dupla imediatamente');
ok(tournaments.includes("document.body.classList.add('sp-dupla-drag')"), 'arraste de dupla usa modo estável próprio');
ok(!tournaments.includes('window._setDragCompact(true); }, 0);'), 'arraste de dupla não compacta nem reorganiza os outros cards');
ok(store.includes("b.classList.remove('sp-dupla-drag')"), 'fim do arraste limpa o modo estável');
ok(css.includes('body.sp-dupla-drag .sp-dnd-host .participant-card.sp-drag-source') && css.includes('opacity: 0.22'), 'card de origem fica como fantasma preservando o slot');
ok(css.includes('.sticky-back-header') && css.includes('isolation: isolate'), 'a barra fixa Voltar isola sua camada no desktop');
console.log('✅ duplas-rehydrate-drag-ghost: ' + pass + ' asserções');
