'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('functions/index.js');
const db = read('js/firebase-db.js');
const store = read('js/store.js');
const auth = read('js/views/auth.js');
const rules = read('firestore.rules');
let pass = 0;
let fail = 0;
function ok(name, condition) {
  if (condition) pass++;
  else { fail++; console.error('  ✗ ' + name); }
}
function block(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return source.slice(from, to === -1 ? source.length : to);
}

const fn = block(index, 'exports.updateOwnInterfacePreferences', 'exports.dismissDuplicateSuspicion');
const client = block(db, 'async saveInterfacePreferences', 'async saveUserProfile');
const setScale = block(store, 'window._setUiScale = function', 'window._toggleTheme = function');
const toggleTheme = block(store, 'window._toggleTheme = function', 'window._applyThemeIcon = function');
const profileTheme = block(auth, 'window._setProfileTheme = function', 'window._applyProfileThemeUI = function');

ok('Function de preferências existe', fn.length > 100);
ok('Function deriva identidade exclusivamente do token', /request\.auth && request\.auth\.uid/.test(fn));
ok('Function valida payload no core fechado', /_profilePreferences\.normalizeInterfacePreferences/.test(fn));
ok('Function falha se o perfil não existir', /!profile\.exists/.test(fn));
ok('Function usa update, portanto nunca cria users/{uid}', /tx\.update\(profileRef/.test(fn) && !/tx\.set\(profileRef/.test(fn));
ok('cliente só chama a Function', /_callFn\('updateOwnInterfacePreferences'/.test(client) && !/this\.db\.collection\('users'\)/.test(client));
ok('escala usa a porta de preferências, não saveUserProfile', /saveInterfacePreferences\(\{ uiScale: s \}\)/.test(setScale) && !/saveUserProfile/.test(setScale));
ok('toggle de tema usa a porta de preferências, não saveUserProfile', /saveInterfacePreferences\(\{ theme: next \}\)/.test(toggleTheme) && !/saveUserProfile/.test(toggleTheme));
ok('tema no perfil usa a porta de preferências, não saveUserProfile', /saveInterfacePreferences\(\{ theme: theme \}\)/.test(profileTheme) && !/saveUserProfile/.test(profileTheme));
ok('nenhuma dessas portas usa e-mail como fallback de identidade', !/uid \|\| cu\.email/.test(setScale + toggleTheme + profileTheme));
ok('Rules bloqueiam theme e uiScale diretamente', /'theme', 'uiScale'/.test(rules));

console.log((fail ? '❌' : '✅') + ' interface-preferences-server-only: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
