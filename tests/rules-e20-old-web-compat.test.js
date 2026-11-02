'use strict';
const { rodarNoEmulador } = require('./emulador');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.join(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-e20-old-web-'));
const config = path.join(temp, 'firebase.json');
try {
  fs.writeFileSync(config, JSON.stringify({ firestore: { rules: path.join(root, 'firestore.rules') },
    emulators: { firestore: { host: '127.0.0.1', port: 8199 }, ui: { enabled: false }, singleProjectMode: true } }));
  const output = rodarNoEmulador(['emulators:exec', '--only', 'firestore', '--config', config,
    '--project', 'demo-scoreplace', 'node tests/rules/e20-old-web-compat.mjs'],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH } });
  if (!output.includes('✅ E26: raiz e matches legíveis')) throw new Error(output.slice(-1500));
  console.log('✅ E26: web antiga preserva raiz/jogos, sem ler results');
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
