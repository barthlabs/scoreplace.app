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
ok(/data-pis-toolbar/.test(ui) && /data-pis-scroll/.test(ui) && /height:100%;/.test(ui) && /overflow:hidden/.test(ui) &&
  /data-pis-close[\s\S]*?data-pis-apply[\s\S]*?data-pis-publish/.test(ui) &&
  !/margin-top:14px[\s\S]*?data-pis-apply/.test(ui),
  'Voltar fica à esquerda; Salvar ajustes e Publicar ficam ativos à direita em barra opaca fora do painel rolável, sem comando no rodapé');
ok(/data-pis-shuffle/.test(ui) && /data-pis-copy-other-day/.test(ui) && /Fisher–Yates/.test(ui) && /fixMatchOnSlot/.test(ui),
  'a revisão permite embaralhar os jogos ou repetir a estrutura do outro dia sem recriar slots de quadra e horário');
const scheduleStart = ui.indexOf('window._openPendingInitialSchedule = function');
const scheduleEnd = ui.indexOf('window._rememberPendingDrawMarker = function', scheduleStart);
const schedule = scheduleStart >= 0 && scheduleEnd > scheduleStart ? ui.slice(scheduleStart, scheduleEnd) : '';
ok(/Horários são estimados/.test(schedule) && !/if \(!latest\.cabe\)[\s\S]{0,220}?return;/.test(schedule) && /Publicando horários estimados/.test(schedule) && /\.catch\(function \(e\)/.test(schedule),
  'agenda excedente continua visível como estimativa e a publicação não fica bloqueada nem silenciosa');
process.exitCode = fail ? 1 : 0;
