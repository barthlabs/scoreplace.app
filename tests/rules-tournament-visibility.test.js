'use strict';

// Exercita o documento, o resumo e as subcoleções no Firestore Emulator real.
const { rodarNoEmulador } = require('./emulador');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-tournament-visibility-'));
const config = path.join(temp, 'firebase.json');
fs.writeFileSync(config, JSON.stringify({
  firestore: { rules: path.join(root, 'firestore.rules') },
  emulators: { firestore: { host: '127.0.0.1', port: 8198 }, ui: { enabled: false }, singleProjectMode: true }
}));
const output = rodarNoEmulador([
  'emulators:exec', '--only', 'firestore', '--config', config,
  '--project', 'demo-scoreplace',
  'node tests/rules/tournament-visibility.mjs'
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  env: Object.assign({}, process.env, { PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }) });
if (!output.includes('✅ visibilidade do torneio: geral, inscritos e organizadores')) {
  throw new Error('O teste de visibilidade não concluiu:\n' + output.slice(-1200));
}
console.log('✅ regra de visibilidade do torneio validada no emulador');
