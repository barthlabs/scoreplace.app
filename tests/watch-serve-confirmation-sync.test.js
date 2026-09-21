'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const bridge = fs.readFileSync(path.join(root, 'js/watch-bridge.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'js/views/bracket-ui.js'), 'utf8');
let fail = 0, pass = 0;
function ok(name, condition) { if (condition) pass++; else { fail++; console.error('  ✗ ' + name); } }
const from = bridge.indexOf("case 'setServer'");
const legacy = bridge.slice(from, bridge.indexOf("case 'hello'", from));
ok('relógio seleciona pelo mesmo estado do telefone', /_liveServeSelect\(intent\.team, intent\.playerIdx\)/.test(legacy));
ok('relógio não aplica sacador antes da confirmação', !/_liveSetServer\(intent\.team, intent\.playerIdx\)/.test(legacy));
ok('confirmar tem alvo vertical de 52px', /id="live-serve-confirm"[\s\S]{0,500}min-height:52px/.test(ui));
console.log((fail ? '❌' : '✅') + ' watch-serve-confirmation-sync: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
