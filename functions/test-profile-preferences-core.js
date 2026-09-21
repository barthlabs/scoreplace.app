'use strict';

const C = require('./profile-preferences-core');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) pass++;
  else { fail++; console.error('  ✗ ' + name); }
}
function rejects(name, value) {
  try { C.normalizeInterfacePreferences(value); ok(name, false); }
  catch (_) { ok(name, true); }
}

const both = C.normalizeInterfacePreferences({ theme: 'light', uiScale: 1.3 });
ok('aceita somente tema claro permitido', C.normalizeInterfacePreferences({ theme: 'light' }).theme === 'light');
ok('aceita somente tema escuro permitido', C.normalizeInterfacePreferences({ theme: 'dark' }).theme === 'dark');
ok('aceita escala no limite inferior', C.normalizeInterfacePreferences({ uiScale: C.UI_SCALE_MIN }).uiScale === C.UI_SCALE_MIN);
ok('aceita escala no limite superior', C.normalizeInterfacePreferences({ uiScale: C.UI_SCALE_MAX }).uiScale === C.UI_SCALE_MAX);
ok('preserva os dois valores aceitos', both.theme === 'light' && both.uiScale === 1.3);
rejects('rejeita payload vazio', {});
rejects('rejeita campo de perfil arbitrário', { displayName: 'Ana' });
rejects('rejeita mistura de campo permitido e arbitrário', { theme: 'dark', phone: 'x' });
rejects('rejeita tema fora da enumeração', { theme: 'ocean' });
rejects('rejeita escala abaixo do intervalo', { uiScale: C.UI_SCALE_MIN - 0.001 });
rejects('rejeita escala acima do intervalo', { uiScale: C.UI_SCALE_MAX + 0.001 });
rejects('rejeita escala não numérica', { uiScale: '1.3' });
rejects('rejeita NaN', { uiScale: NaN });

console.log((fail ? '❌' : '✅') + ' profile-preferences-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
