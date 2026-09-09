/* Notificações de placar precisam transportar sets como dado, não como texto "6 5 14".
 * Este gate cobre a cadeia inteira: proposta → notificação/app → fila → digest de e-mail. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let failures = 0;
function ok(cond, label) { if (cond) console.log('✓ ' + label); else { console.error('✗ ' + label); failures++; } }

const bracket = read('js/views/bracket-ui.js');
const auto = read('functions-autodraw/index.js');
const queue = read('js/firebase-db.js');
const dispatch = read('js/views/tournaments-organizer.js');
const digest = read('functions/index.js');
const app = read('js/views/notifications-view.js');

ok(/function _notificationScoreboard/.test(auto) && /Number\.isFinite\(p1\)/.test(auto), 'CF só cria aviso com sets canônicos completos');
ok(/collection\('notificationOutbox'\)/.test(auto) && /tx\.set\(notifOutboxRef, _notif \|\| _transitionNotif\)/.test(auto), 'placar e outbox nascem na mesma transação');
ok(/const _pendingAntes/.test(auto) && /pendingBefore: _pendingAntes/.test(auto), 'aprovação preserva autoria da proposta antes de consumi-la');
ok(/confirmou o resultado lançado por/.test(auto) && /function _notificationPersonName/.test(auto), 'confirmação identifica quem confirmou e nunca expõe e-mail como autoria');
ok(/liveIdentity = await _loadLiveNames/.test(auto) && /callerName =/.test(auto), 'CF resolve nome de exibição antes de comunicar o resultado');
ok(/exports\.deliverScoreNotification\s*=\s*onDocumentCreated/.test(auto), 'CF entrega a outbox depois do commit');
ok(/scoreboard: item\.scoreboard/.test(auto) && /scoreboard: item\.scoreboard/.test(auto), 'plataforma e fila recebem o mesmo placar estruturado da CF');
ok(!/try\s*\{\s*_notifyPendingApproval\(/.test(bracket), 'cliente não dispara aviso a partir do card potencialmente velho');
ok(/scoreboard:\s*templateData\.scoreboard/.test(dispatch), 'canal de e-mail encaminha o payload');
ok(/scoreboard:\s*opts\.scoreboard/.test(queue), 'fila do digest preserva o payload');
ok(/function _digestScoreboard/.test(digest) && /_digestScoreboard\(it, P\)/.test(digest), 'e-mail renderiza tabela alinhada');
ok(/#16a34a/.test(digest) && /#dc2626/.test(digest), 'e-mail pinta vencedor em verde e derrotado em vermelho');
ok(/function _scoreboardHtml/.test(app) && /scoreboardHtml/.test(app), 'notificação dentro do app usa a mesma tabela');
ok(/window\._matchScoreboard\s*=\s*function/.test(bracket), 'a apresentação local continua entendendo a mesma grade');

if (failures) process.exit(1);
console.log('✅ notificacao-placar-estruturado: OK');
