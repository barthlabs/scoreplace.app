'use strict';
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-test-mode-rules-'));
const config = path.join(dir, 'firebase.json');
fs.writeFileSync(config, JSON.stringify({
  firestore: { rules:path.join(root, 'firestore.rules') },
  emulators: { firestore:{ host:'127.0.0.1', port:8199 }, ui:{ enabled:false }, singleProjectMode:true }
}));
const output = rodarNoEmulador([
  'emulators:exec', '--only', 'firestore', '--config', config,
  '--project', 'demo-scoreplace', 'node tests/rules/test-mode.mjs'
], { cwd:root, encoding:'utf8', stdio:['ignore','pipe','pipe'],
  env:Object.assign({}, process.env, { PATH:'/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
if (!output.includes('✅ modo Teste isolado nas regras')) {
  throw new Error('O teste do modo Teste não concluiu:\n' + output.slice(-1200));
}
console.log('✅ regras do modo Teste validadas no emulador');
