'use strict';
/* O seletor de inscrições é uma régua só: criação/edição, eliminatória e chave.
 * Nunca volte a mostrar um único rótulo dinâmico cujo sentido precisa ser adivinhado. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const create = read('js/views/create-tournament.js');
const format2 = read('js/views/format2-ui.js');
const bracket = read('js/views/bracket.js');
const css = read('css/components.css');
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }

console.log('──── seletor canônico de inscrições durante a fase ────');
ok(create.includes('window._lateEnrollmentModeSwitchHtml = function'), 'há um único gerador para os pares de estados');
ok(create.includes("left: _t('create.lateEnrollClosed'), right: _t('create.lateEnrollOpen')"), 'formulário mostra Fechadas à esquerda e Abertas à direita');
ok(create.includes("left: _t('create.lateEnrollSuplentesOnly'), right: _t('create.lateEnrollExpand')"), 'formulário mostra Suplentes à esquerda e Novos Confrontos à direita');
ok(create.includes("var isOpen = !!open.checked;") && create.includes("var isClosed = !isOpen;"), 'desligado continua gravando closed e ligado abre inscrições');
ok(create.includes("checked = _lateEnroll !== 'closed'") && create.includes("checked = tpl.lateEnrollment !== 'closed'"), 'editar e modelo repovoam o sentido visual novo');
ok(format2.includes('window._lateEnrollmentModeSwitchHtml') && format2.includes('on: !isClosed'), 'eliminatória usa o mesmo gerador e o mesmo sentido para Abertas');
ok(format2.includes("window._f2ElimLateMaster = function (openOn)"), 'handler da eliminatória recebe diretamente o estado aberto');
ok(bracket.includes('window._lateEnrollmentModeSwitchHtml') && bracket.includes("left: 'Fechadas', right: 'Abertas'"), 'atalho da chave usa o mesmo gerador e os mesmos rótulos');
ok(bracket.includes("left: 'Suplentes', right: 'Novos Confrontos'"), 'atalho da chave também mostra os dois destinos da espera');
ok(!bracket.includes("(_leFechadas ? '' : _linhaTog"), 'segundo seletor não desaparece quando inscrições estão fechadas');
ok(css.includes('.sp-late-mode-row') && css.includes('data-late-active="left"') && css.includes('data-late-active="right"'), 'CSS tem uma régua explícita para o estado ativo');
ok(css.includes('--late-left') && css.includes('--late-right') && css.includes('text-shadow:0 0 7px currentColor'), 'cores de cada lado e brilho neon vivem no componente');
if (fail) process.exitCode = 1;
console.log('\n' + (fail ? '❌' : '✅') + ' seletor canônico: ' + pass + ' verificações' + (fail ? ', ' + fail + ' falharam' : ''));
