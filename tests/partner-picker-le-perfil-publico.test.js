'use strict';

/* O seletor de parceiro só pinta nome e foto dos amigos. Não pode ser uma porta
 * paralela para baixar a ficha privada inteira ao abrir uma inscrição em dupla. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const start = source.indexOf('window._partnerPickerInit = async function');
const end = source.indexOf('// Renderiza o dropdown com as seções de resultados', start);
assert.ok(start >= 0 && end > start, 'achei o carregador do seletor de parceiro');
const block = source.slice(start, end);

assert.match(block, /await window\._preloadUserProfiles\(toLoad\)/,
  'o seletor carrega amigos pela hidratação pública canônica');
assert.match(block, /window\._userProfileCache \|\| \{\}/,
  'o seletor lê o cache público compartilhado');
assert.match(block, /displayName: d\.displayName \|\| '', photoURL: d\.photoURL \|\| ''/,
  'somente nome e foto são copiados para o cache próprio do picker');
assert.doesNotMatch(block, /collection\('users'\)|collection\("users"\)/,
  'o seletor não consulta `users` diretamente');
assert.doesNotMatch(block, /loadUserProfile\(/,
  'o seletor não baixa a ficha privada de amigos');

console.log('✅ partner picker usa perfil público — 5 verificações');
