'use strict';
/* O catálogo é a linguagem exibida; a capability é a fronteira de escrita.
 * Este teste obriga qualquer tipo novo a declarar se nasce no navegador ou no
 * servidor, evitando que uma tela volte a cair na antiga escrita direta. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../functions/notification-authority-core');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'notification-catalog.js'), 'utf8');
const catalog = new Set([...src.matchAll(/^\s*['\"]?([a-z][a-z0-9_-]*)['\"]?\s*:/gm)].map((m) => m[1]));
const browserTypes = new Set([...core.SOCIAL_TYPES, ...core.TOURNAMENT_TYPES, 'account_update']);
// Estes três nascem exclusivamente em Functions autenticadas/especializadas;
// não devem ganhar uma passagem genérica pelo navegador.
const serverOnly = new Set(['friend_request', 'friend_accepted', 'contact_phone_set']);
const missing = [...catalog].filter((type) => !browserTypes.has(type) && !serverOnly.has(type));
assert.deepEqual(missing, [], 'todo tipo do catálogo declara sua autoridade de criação');
assert.equal([...browserTypes].filter((type) => !catalog.has(type)).length, 0,
  'todo tipo permitido ao navegador existe no catálogo visual');
console.log('✓ notification-authority-catalog: catálogo e capability concordam (' + catalog.size + ' tipos)');
