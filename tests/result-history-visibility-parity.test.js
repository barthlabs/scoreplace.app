'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');

const root = path.join(__dirname, '..');
const realRulesPath = path.join(root, 'firestore.rules');
const original = fs.readFileSync(realRulesPath, 'utf8');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const originalHash = digest(original);
const wildcard = `    match /{path=**}/results/{matchId} {
      allow read: if request.auth != null
        && (request.auth.uid in resource.data.get('playerUids', []));
    }`;
assert.equal(original.split(wildcard).length, 2, 'curinga results deve ocorrer uma vez');
const nestedOnly = original.replace(wildcard, '');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-result-visibility-parity-'));
try {
  const rulesPath = path.join(temp, 'nested-only.rules');
  const configPath = path.join(temp, 'firebase.json');
  fs.writeFileSync(rulesPath, nestedOnly);
  fs.writeFileSync(configPath, JSON.stringify({
    firestore: { rules: rulesPath },
    emulators: {
      firestore: { host: '127.0.0.1', port: 8134 },
      ui: { enabled: false }, singleProjectMode: true
    }
  }));
  const output = rodarNoEmulador([
    'emulators:exec', '--only', 'firestore', '--config', configPath,
    '--project', 'demo-scoreplace',
    'node tests/rules/result-history-visibility-parity.mjs'
  ], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env,
      PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8134',
      SP_RESULT_PARITY_RULES: rulesPath
    }
  });
  assert.match(output, /PARIDADE: OK/);
  console.log('✅ 3.2.8: paridade da política de leitura de torneio com Rules aninhadas');
} finally {
  assert.equal(digest(fs.readFileSync(realRulesPath, 'utf8')), originalHash,
    'firestore.rules de produção foi modificado');
  fs.rmSync(temp, { recursive: true, force: true });
}
