'use strict';
/* A chave só recebe nome/foto pela porta pública por UID. O teste comportamental
 * e17-perfil-uid-ui cobre lápide, dupla, avatar e ausência de escrita. Esta trava
 * impede que uma consulta por nome ou pela ficha privada volte ao carregador. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
const start = src.indexOf('async function _preloadPlayerPhotos');
const end = src.indexOf('\n// AGUARDANDO MELHOR DERROTADO:', start);
assert(start >= 0 && end > start, 'carregador da chave encontrado');
const body = src.slice(start, end);
assert.match(body, /window\._preloadUserProfiles\(_todosUids\)/, 'reusa leitura pública por UID');
assert.doesNotMatch(body, /\.where\(['"]displayName['"]/, 'sem consulta por nome');
assert.doesNotMatch(body, /\.collection\(['"]users['"]\)/, 'sem ficha privada');
assert.doesNotMatch(body, /\.collection\(COL\)/, 'sem segundo leitor de perfis');
assert.match(body, /window\._userProfileCache\[uid\]/, 'nome usa o mesmo perfil público que a foto');

const regress = body.replace('window._preloadUserProfiles(_todosUids)',
  "window.FirestoreDB.db.collection('users').doc(_todosUids[0]).get()");
assert.notStrictEqual(regress, body, 'controle muda o carregador');
assert.match(regress, /\.collection\(['"]users['"]\)/, 'controle seria barrado');
console.log('✓ foto da chave: leitura pública única por UID, sem nome/ficha privada');
