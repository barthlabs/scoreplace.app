'use strict';
/* O Firebase pode sair não-zero DEPOIS de imprimir "Deploy complete!", mas uma falha sem
 * esse marcador não pode terminar como sucesso. Este ensaio usa um Firebase falso para provar
 * as duas situações sem tocar no projeto nem chamar a rede. */
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = path.join(__dirname, '..');
const falso = fs.mkdtempSync(path.join(os.tmpdir(), 'scoreplace-firebase-falso-'));
const bin = path.join(falso, 'firebase');
fs.writeFileSync(bin, '#!/usr/bin/env bash\nprintf "%s\\n" "$FIREBASE_FALSO_SAIDA"\nexit "$FIREBASE_FALSO_EXIT"\n');
fs.chmodSync(bin, 0o755);

function executar(saida, codigo) {
  const env = Object.assign({}, process.env, {
    PATH: falso + path.delimiter + process.env.PATH,
    FIREBASE_FALSO_SAIDA: saida,
    FIREBASE_FALSO_EXIT: String(codigo),
  });
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
  return spawnSync('bash', ['scripts/deploy-functions.sh', 'main'], { cwd: raiz, env, encoding: 'utf8' });
}

let r = executar('Error: permission denied', 1);
let texto = (r.stdout || '') + (r.stderr || '');
assert.notEqual(r.status, 0, 'erro sem marcador de conclusão aborta');
assert.match(texto, /sem confirmar 'Deploy complete!'/, 'o motivo do aborto declara a falta de evidência');

r = executar('✔ Deploy complete!\nError: unexpected error after publish', 2);
texto = (r.stdout || '') + (r.stderr || '');
assert.equal(r.status, 0, 'marcador explícito permite seguir mesmo após exit não-zero do CLI');
assert.match(texto, /DEPOIS de confirmar o deploy/, 'o aviso descreve a condição excepcional sem fingir que não houve erro');

fs.rmSync(falso, { recursive: true, force: true });
console.log('✅ deploy-functions só confirma falha depois de evidência explícita');
