'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js', 'views', 'explore.js'), 'utf8');
const start = source.indexOf('function _participantMatchesUser');
const end = source.indexOf('// ---- User card HTML builder ----', start);
const sandbox = { window: null }; sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(source.slice(start, end), sandbox);
let failures = 0;
function ok(condition, label) { console.log((condition ? '✓ ' : '✗ ') + label); if (!condition) failures++; }

ok(sandbox._participantMatchesUser({ uid: 'u-ana', email: 'casa@test', displayName: 'Ana' }, 'casa@test', 'Ana', 'u-ana'),
  'UID da própria entrada encontra a pessoa');
ok(sandbox._participantMatchesUser({ p1Uid: 'u-ana', p2Uid: 'u-bia' }, '', '', 'u-bia'),
  'UID de membro de dupla encontra a pessoa');
ok(!sandbox._participantMatchesUser({ email: 'casa@test', displayName: 'Ana' }, 'casa@test', 'Ana', 'u-outra'),
  'e-mail e nome iguais não atribuem inscrição a outra conta');
ok(!sandbox._participantMatchesUser('Ana / Bia', '', 'Ana', 'u-ana'),
  'linha textual legada não finge ser identidade de conta');

process.exit(failures ? 1 : 0);
