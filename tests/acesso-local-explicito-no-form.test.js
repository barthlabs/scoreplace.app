'use strict';
/* REGRESSÃO: acesso do local não pode voltar a mostrar só um rótulo junto do switch.
 * Igual a Privado/Público, os dois estados ficam visíveis; `checked` é sempre o lado
 * direito (aberto), enquanto o valor persistido conserva o contrato public/members. */
const fs = require('fs');
const src = fs.readFileSync('js/views/create-tournament.js', 'utf8');
const pt = fs.readFileSync('js/i18n-pt.js', 'utf8');
let pass = 0, fail = 0;
function ok(condition, message) { if (condition) { pass++; console.log('  ✓ ' + message); } else { fail++; console.error('  ✗ ' + message); } }

console.log('──── acesso explícito do local ────');
ok(src.includes("id: 'venue-access-mode'") && src.includes("left: _t('create.venueAccessRestricted'), right: _t('create.venueAccessOpen')"),
  'o formulário mostra Acesso restrito à esquerda e Acesso aberto ao público à direita');
ok(src.includes("mode: 'venue-access'") && src.includes("descId: 'venue-access-desc'"),
  'o controle tem estado e descrição próprios');
ok(src.includes("hiddenEl.value = 'public'") && src.includes("hiddenEl.value = 'members'"),
  'o contrato persistido public/members não mudou');
ok(src.includes('window._setLateEnrollmentModeVisual(row, toggle.checked)') && src.includes('window._setLateEnrollmentModeVisual(row, isPublic)'),
  'toque manual e reidratação atualizam o mesmo par de rótulos');
ok(pt.includes("'create.venueAccessRestricted': 'Acesso restrito'") && pt.includes("'create.venueAccessOpen': 'Acesso aberto ao público'"),
  'rótulos em português existem');
if (fail) process.exitCode = 1;
console.log('\n' + (fail ? '❌' : '✅') + ' acesso explícito do local: ' + pass + ' verificações' + (fail ? ', ' + fail + ' falharam' : ''));
