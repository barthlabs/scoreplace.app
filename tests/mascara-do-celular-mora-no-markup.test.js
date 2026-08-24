/* A MÁSCARA DO CELULAR DO PERFIL MORA NO MARKUP — NÃO EM addEventListener (2.0.54)
 * node tests/mascara-do-celular-mora-no-markup.test.js
 *
 * Caso Vanessa Kaufmann (24/ago/2026, print do dono): digitou 11991372028 no perfil e o
 * campo ficou CRU, com o botão Verificar apagado. Os listeners de máscara/sync eram
 * presos por addEventListener na CRIAÇÃO do modal — qualquer caminho que recrie ou mova
 * o nó por innerHTML os perde, em silêncio. A fiação agora vai no atributo (oninput
 * inline), que sobrevive a qualquer re-render — mesma tática do diálogo de contato do
 * organizador. E a máscara lê o DDI VIVO do select (a closure antiga ficava presa no
 * DDI do dia da criação).
 */
const fs = require('fs');
const path = require('path');
const AUTH = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// 1. o input do celular carrega o handler INLINE (sobrevive a re-render)
ok(/id="profile-edit-phone"[^>]*oninput="window\._profilePhoneMaskInput && window\._profilePhoneMaskInput\(this\)"/.test(AUTH),
  'o input profile-edit-phone precisa do oninput INLINE — addEventListener se perde em re-render');

// 2. o handler global existe, grava data-digits e lê o DDI VIVO do select
ok(/window\._profilePhoneMaskInput = function \(inp\)/.test(AUTH), 'falta window._profilePhoneMaskInput');
ok(/_profilePhoneMaskInput = function[\s\S]{0,400}getElementById\('profile-phone-country'\)/.test(AUTH),
  'a máscara tem que ler o DDI VIVO do select (a closure antiga prendia no DDI da criação)');
ok(/_profilePhoneMaskInput = function[\s\S]{0,600}setAttribute\('data-digits', raw\)/.test(AUTH),
  'o handler precisa manter data-digits (é dele que o save e o botão leem)');
ok(/_profilePhoneMaskInput = function[\s\S]{0,900}_profilePhoneSyncVerifyBtn/.test(AUTH),
  'o handler precisa reavaliar o botão Verificar a cada tecla');

// 3. o onchange do DDI (inline) também reavalia o botão
ok(/profile-phone-country[^>]*onchange="[^"]*_profilePhoneSyncVerifyBtn/.test(AUTH),
  'trocar o DDI precisa reavaliar o botão pelo handler inline');

// 4. o listener legado delega pro handler global (senão re-formata preso no DDI velho)
ok(/_setupPhoneMask[\s\S]{0,600}window\._profilePhoneMaskInput\(this\);\s*\n\s*return;/.test(AUTH),
  'o listener antigo do _setupPhoneMask tem que delegar pro handler global');

console.log('\nmascara-do-celular-mora-no-markup: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
