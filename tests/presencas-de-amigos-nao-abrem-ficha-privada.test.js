'use strict';
/* A presença de amigos recebe UID. Um e-mail legado não pode virar uma consulta em `users`,
 * pois isso baixaria a ficha privada de uma pessoa só para compor um widget da dashboard. */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/dashboard.js'), 'utf8')
  .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
let ok = 0;
const must = (value, message) => { assert.ok(value, message); ok++; console.log('  ✓ ' + message); };

console.log('\n──── presença de amigos não abre ficha privada ────\n');

const inicio = src.indexOf('function _hydrateFriendsPresenceWidget()');
const fim = src.indexOf('\nfunction ', inicio + 1);
const corpo = src.slice(inicio, fim > inicio ? fim : undefined);
must(inicio >= 0, '① o widget de presença de amigos existe');
must(/friendsLikeUid/.test(corpo), '① a lista enviada ao leitor de presença usa apenas UIDs');
must(!/collection\('users'\)\s*\.where\('email_lower'/.test(corpo),
  '② ⛔ e-mail legado não consulta ficha privada por email_lower');
must(!/collection\('users'\)\s*\.where\('email'/.test(corpo),
  '② ⛔ nem usa a queda legada por e-mail');
must(!/setTimeout\(_hydrateFriendsPresenceWidget/.test(corpo),
  '③ não re-hidrata a dashboard depois de resolver identidade no cliente');
must(/var friends = friendsLikeUid;/.test(corpo),
  '④ o leitor de presença recebe exclusivamente a relação identificada por UID');

const reintroduzido = corpo + "\nwindow.FirestoreDB.db.collection('users').where('email_lower', '==', email);";
must(/collection\('users'\)\s*\.where\('email_lower'/.test(reintroduzido),
  '⑤ o controle comprova que a trava ficaria vermelha se a consulta voltasse');

console.log('\n✅ ' + ok + ' verificações');
