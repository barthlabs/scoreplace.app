/* Notificações de placar precisam transportar sets como dado, não como texto "6 5 14".
 * Este gate cobre a cadeia inteira: proposta → notificação/app → fila → digest de e-mail. */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let failures = 0;
function ok(cond, label) { if (cond) console.log('✓ ' + label); else { console.error('✗ ' + label); failures++; } }

const bracket = read('js/views/bracket-ui.js');
const queue = read('js/firebase-db.js');
const dispatch = read('js/views/tournaments-organizer.js');
const digest = read('functions/index.js');
const app = read('js/views/notifications-view.js');

ok(/window\._matchScoreboard\s*=\s*function/.test(bracket) && /notifData\.scoreboard\s*=\s*window\._matchScoreboard/.test(bracket), 'resultado por sets cria payload estruturado');
ok(/label:\s*s\.superTiebreak\s*\?\s*'STB'\s*:\s*\('Set '\s*\+\s*\(i \+ 1\)\)/.test(bracket), 'payload nomeia Set 1… e STB');
ok(/scoreboard:\s*templateData\.scoreboard/.test(dispatch), 'canal de e-mail encaminha o payload');
ok(/scoreboard:\s*opts\.scoreboard/.test(queue), 'fila do digest preserva o payload');
ok(/function _digestScoreboard/.test(digest) && /_digestScoreboard\(it, P\)/.test(digest), 'e-mail renderiza tabela alinhada');
ok(/#16a34a/.test(digest) && /#dc2626/.test(digest), 'e-mail pinta vencedor em verde e derrotado em vermelho');
ok(/function _scoreboardHtml/.test(app) && /scoreboardHtml/.test(app), 'notificação dentro do app usa a mesma tabela');
ok((bracket.match(/scoreboard\s*=\s*window\._matchScoreboard/g) || []).length >= 3, 'proposta e confirmações usam a mesma grade');

if (failures) process.exit(1);
console.log('✅ notificacao-placar-estruturado: OK');
