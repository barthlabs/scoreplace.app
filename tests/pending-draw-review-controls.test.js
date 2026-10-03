/* A revisão não pode depender de o listener já ter entregue o snapshot novo.
 * Regressão: o sorteio ficava marcado no Firestore, mas a tela só mostrava o toast. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'js/views/bracket-logic.js'), 'utf8');
const draw = fs.readFileSync(path.join(root, 'js/views/tournaments-draw.js'), 'utf8');
const detail = fs.readFileSync(path.join(root, 'js/views/tournaments.js'), 'utf8');
const fn = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let fail = 0;
function ok(condition, message) { if (!condition) { fail++; console.error('❌ ' + message); } else console.log('✅ ' + message); }

ok(/getPendingDrawReviewState/.test(fn) && /const canReview = t\.creatorUid === uid/.test(fn) && /adminUids\.indexOf\(uid\)/.test(fn) && /new HttpsError\('permission-denied', 'Só a organização revisa este sorteio\.'\)/.test(fn),
  'a Function devolve somente o marcador da revisão e exige organização por UID');
ok(/_hydratePendingDrawMarker/.test(ui) && /getPendingDrawReviewState/.test(ui),
  'a interface reidrata o marcador canônico quando o snapshot local está atrasado');
const start = ui.indexOf('window._openPendingDrawReview = function');
const end = ui.indexOf('window._renderPendingDrawBanner = function');
const modal = start >= 0 && end > start ? ui.slice(start, end) : '';
ok(/data-annul/.test(modal) && /data-publish/.test(modal) && /_annulPendingDraw\(tId\)/.test(modal) && /_publishPendingDraw\(tId\)/.test(modal),
  'a própria janela de revisão expõe e liga Anular e Publicar');
ok(/renderTournaments\(container, id\)/.test(ui) && !/_softRefreshView\(\)/.test(modal),
  'ao recuperar o marcador, o detalhe aberto é repintado explicitamente');
ok(/_rememberPendingDrawMarker\(tId, d\.tournament\.pendingDraw\)/.test(draw),
  'a resposta do sorteio preserva imediatamente o marcador até o listener alcançar');
ok(/_hydratePendingDrawMarker\(visible\[0\]\.id\)/.test(detail),
  'abrir novamente o detalhe também recupera controles de uma revisão pendente');
ok(/function returnToPendingDetail\(\)[\s\S]*?_rememberPendingDrawMarker\(tId, pd\)[\s\S]*?renderTournaments\(container, String\(tId\)\)/.test(ui) &&
  /querySelector\('\[data-pis-close\]'\)\.onclick = returnToPendingDetail/.test(ui) &&
  /data-pis-publish/.test(ui) && /saveSchedule\(latest\)[\s\S]*?_publishPendingDraw\(tId\)/.test(ui) &&
  /Ajustar torneio/.test(ui) && /✕ Anular/.test(ui),
  'a revisão abre no planejamento, publica dali e Voltar restaura no detalhe somente ajuste e anulação');
ok(/position:sticky;top:0;z-index:5/.test(ui) &&
  /data-pis-close[\s\S]*?data-pis-publish/.test(ui) &&
  !/Salvar ajustes<\\\/button><button type="button" data-pis-publish/.test(ui),
  'Voltar fica à esquerda e Publicar à direita no cabeçalho fixo; a grade não tem comando de publicação no rodapé');
process.exitCode = fail ? 1 : 0;
