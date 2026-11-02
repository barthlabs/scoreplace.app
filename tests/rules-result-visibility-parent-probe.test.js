'use strict';

// Ensaio 3.2.8: somente Rules temporárias no Firestore Emulator (porta 8133).
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
const parentGuard = `    match /{path=**}/results/{matchId} {
      allow read: if request.auth != null
        && (request.auth.uid in resource.data.get('playerUids', []))
        && canReadTournamentData(get(/databases/$(database)/documents/$(path)).data);
    }`;
const variant = original.replace(wildcard, parentGuard);
const nestedOnly = original.replace(wildcard, '');
assert.equal(variant.replace(parentGuard, wildcard), original);
assert.equal(original.replace(wildcard, ''), nestedOnly);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-result-parent-probe-'));
try {
  const baselinePath = path.join(temp, 'baseline.rules');
  const variantPath = path.join(temp, 'parent-guard.rules');
  const nestedPath = path.join(temp, 'nested-only.rules');
  const configPath = path.join(temp, 'firebase.json');
  fs.writeFileSync(baselinePath, original);
  fs.writeFileSync(variantPath, variant);
  fs.writeFileSync(nestedPath, nestedOnly);
  fs.writeFileSync(configPath, JSON.stringify({
    firestore: { rules: baselinePath },
    emulators: {
      firestore: { host: '127.0.0.1', port: 8133 },
      ui: { enabled: false },
      singleProjectMode: true
    }
  }));
  const output = rodarNoEmulador([
    'emulators:exec', '--only', 'firestore', '--config', configPath,
    '--project', 'demo-scoreplace',
    'node tests/rules/result-visibility-parent-probe.mjs'
  ], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH,
      FIRESTORE_EMULATOR_HOST: '127.0.0.1:8133',
      SP_PROBE_BASELINE_RULES: baselinePath,
      SP_PROBE_VARIANT_RULES: variantPath,
      SP_PROBE_NESTED_RULES: nestedPath
    }
  });
  assert.match(output, /VIABILIDADE: NÃO/);
  assert.match(output, /CUSTO DE get\(\): não medido/);
  console.log(output.match(/CONSULTA SÓ-PÚBLICA: (SUCESSO|NEGADA)/)?.[0] || 'Consulta só-pública sem resultado');
  console.log('✅ 3.2.8: ensaio isolado concluído; VIABILIDADE: NÃO');
} finally {
  const afterHash = digest(fs.readFileSync(realRulesPath, 'utf8'));
  fs.rmSync(temp, { recursive: true, force: true });
  assert.equal(afterHash, originalHash, 'firestore.rules de produção foi modificado');
}
