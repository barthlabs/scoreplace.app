// L7: consenso de placar só dispara a Cloud Function; o navegador não escreve pendingResult.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const ui = fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8');
const store = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
const functionsIndex = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
let failed = 0;
function ok(label, value) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }
function body(start, end) { const a = ui.indexOf(start), b = ui.indexOf(end, a + start.length); return a >= 0 && b >= 0 ? ui.slice(a, b) : ''; }
const proposal = body('var _pendingLogMsg =', 'if (useSets) {');
const contest = body('window._contestResult = function', '// Helper: notifica todos');
const counter = body('var _counterLog =', '// Não auto-focar no mobile');
const reset = body('window._organizerResetMatch = function', '// Reverter / desfazer um W.O.');
const revertWo = body('window._revertWO = function', '// Editar resultado pendente:');
const reopen = body('window._editResult = function', '// ─── Edit result inline');
ok('proposta usa a callable', /commitResultTx\(tId, matchId, \{ pending: _pendingPayload \}/.test(proposal));
ok('proposta não escreve pela transação genérica', !/commitTournamentTx|AppStore\.mutate/.test(proposal));
ok('contestação usa a callable', /action: 'contest-pending'/.test(contest) && /commitResultTx/.test(contest));
ok('contestação não escreve pelo cliente', !/AppStore\.mutate|_notifyOrgAndCoHosts/.test(contest));
ok('contra-proposta usa a callable', /action: 'counter-pending'/.test(counter) && /commitResultTx/.test(counter));
ok('contra-proposta não escreve pelo cliente', !/AppStore\.mutate/.test(counter));
ok('corrida mostra a ação correta', /_reason === 'pending-other-side'/.test(store) && /Confirmar, Editar ou Contestar/.test(store));
ok('disputa nunca reutiliza a notificação de resultado confirmado', /outcome === 'in-progress' \|\| outcome === 'disputed'/.test(functionsIndex));
ok('refazer partida usa a callable', /action: 'reset-match'/.test(reset) && /commitResultTx/.test(reset));
ok('refazer partida não escreve ou notifica pelo cliente', !/AppStore\.mutate|_notifyMatchParticipants/.test(reset));
ok('reverter W.O. usa a callable', /action: 'revert-wo'/.test(revertWo) && /commitResultTx/.test(revertWo));
ok('reverter W.O. não escreve ou notifica pelo cliente', !/AppStore\.mutate|_notifyMatchParticipants/.test(revertWo));
ok('editar resultado usa a callable', /action: 'reopen-result'/.test(reopen) && /commitResultTx/.test(reopen));
ok('editar resultado não escreve pela transação genérica', !/AppStore\.mutate|commitTournamentTx/.test(reopen));
ok('transições administrativas notificam pela outbox do servidor', /_matchReopenedNotificationEvent/.test(functionsIndex) && /wo-reverted/.test(functionsIndex));
if (failed) process.exit(1);
