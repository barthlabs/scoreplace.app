'use strict';
/* REGRESSÃO: visibilidade não pode depender de um rótulo único ao lado do switch.
 * Privado e Público ficam simultaneamente visíveis, e criar, editar e template
 * obrigatoriamente atualizam a mesma fonte de verdade (#tourn-public). */
const fs = require('fs');
const src = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const pt = fs.readFileSync('js/i18n-pt.js', 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }

console.log('──── visibilidade explícita do torneio ────');
ok(src.includes("id: 'tournament-visibility-mode'") && src.includes("left: _t('create.privateLabel'), right: _t('create.publicLabel')"), 'o formulário mostra Privado à esquerda e Público à direita');
ok(src.includes("mode: 'visibility'") && src.includes("descId: 'vis-desc'"), 'o controle tem estado e descrição próprios');
ok(src.includes("var isPublic = vis === 'public';") && src.includes("hidden.value = 'true'") && src.includes("hidden.value = 'false'"), 'o valor persistido continua booleano e canônico');
ok(src.includes("_setLateEnrollmentModeVisual(row, isPublic)") && src.includes("window._setVisibility(tpl.isPublic ? 'public' : 'private')"), 'template e toque manual sincronizam a mesma representação visual');
ok(pt.includes("'create.visibilitySection': 'Visibilidade do torneio'") && pt.includes("'create.privateLabel': 'Privado'"), 'rótulos em português existem');
if (fail) process.exitCode = 1;
console.log('\n' + (fail ? '❌' : '✅') + ' visibilidade explícita: ' + pass + ' verificações' + (fail ? ', ' + fail + ' falharam' : ''));
