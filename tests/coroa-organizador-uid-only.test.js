'use strict';
/* A coroa pode ser visual, mas não pode atribuir papel por homonímia.
 * Quem não traz UID não recebe selo de organizador; os renderizadores de
 * participante chamam `_isOrgPlayer`, que compara somente UIDs estruturais. */
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
let fail = 0;
function ok(condition, message) {
  console.log((condition ? '✓ ' : '✗ ') + message);
  if (!condition) fail++;
}
function bodyAfter(marker) {
  const start = source.indexOf(marker);
  const end = source.indexOf('\n};', start);
  return source.slice(start, end < 0 ? source.length : end + 3);
}
const player = bodyAfter('window._isOrgPlayer = function');
const byName = bodyAfter('window._isOrgName = function');
const display = bodyAfter('window._nameWithCrown = function');
ok(player.includes('t.creatorUid') && player.includes('adminUids') && player.includes('c.uid'),
  'identificação de organizador em participante usa UID estrutural');
ok(!player.includes('_isOrgName('), 'participante não cai para nome quando o UID falta');
ok(/return false;/.test(byName) && !byName.includes('organizerName') && !byName.includes('displayName === name'),
  'compatibilidade por nome não atribui mais papel de organizador');
ok(!display.includes('_isOrgName(') && !display.includes('_CROWN_MINI'),
  'helper que recebe apenas texto não injeta coroa de organizador');
process.exit(fail ? 1 : 0);
