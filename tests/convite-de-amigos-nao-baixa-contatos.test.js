'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments.js'), 'utf8');
const start = source.indexOf('window._inviteFriendsToTournament = async function');
const end = source.indexOf('window.switchInviteTab = function', start);
assert.ok(start >= 0 && end > start, 'achei o convite coletivo de amigos');
const block = source.slice(start, end);

assert.match(block, /carregarPerfilPublico\(friendUid\)/,
  'a lista de amigos usa o espelho público');
assert.match(block, /_sendUserNotification\(friendUid,/,
  'a entrega passa o UID à porta canônica de notificação');
assert.doesNotMatch(block, /loadUserProfile\(|collection\('users'\)|profile\.email|profile\.phone|mailto:\?bcc/,
  'o convite não baixa nem expõe e-mail ou telefone de amigos');
assert.match(block, /p\.uid.*friendUid|p\.p1Uid.*friendUid|p\.p2Uid.*friendUid/s,
  'a deduplicação de inscritos prefere a identidade por UID');

console.log('✅ convite coletivo não baixa contatos privados — 4 verificações');
