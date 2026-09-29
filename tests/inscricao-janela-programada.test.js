'use strict';
/* Janela de inscrições: regressões que já confundiram fechar manual com sortear.
 * Este teste é deliberadamente estrutural nas portas que têm autoridade: a Function
 * aceita o campo declarativo e o botão manual não pode voltar a exigir inscritos. */
const fs = require('fs');
let fail = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) fail++; }
const editor = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const ui = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const start = ui.indexOf('window.toggleRegistrationStatus = function');
const end = ui.indexOf('// ─── Sorteio de Vagas', start);
const toggle = ui.slice(start, end);
ok(editor.includes('tourn-reg-open-date') && editor.includes('registrationOpenAt: regOpenDateVal'), 'editor salva a data/hora de abertura programada');
ok(fn.includes("'registrationOpenAt'") && fn.includes('scheduledOpeningRestoresState') && fn.includes("t.registrationOpenAt = null"), 'Function arma abertura futura e abrir/fechar manual prevalece sobre ela');
ok(!/entries\.length\s*<\s*2/.test(toggle), 'fechar manualmente não exige dois inscritos');
ok(/Isso não realiza sorteio/.test(toggle), 'interface deixa claro que fechar não sorteia');
process.exit(fail ? 1 : 0);
