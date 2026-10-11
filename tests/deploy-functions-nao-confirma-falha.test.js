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
const chave = path.join(falso, 'service-account.json');
const hook = path.join(falso, 'firebase-auth-hook.js');
fs.writeFileSync(chave, '{}\n');
fs.writeFileSync(bin,
  '#!/usr/bin/env bash\n' +
  'case "$*" in *"functions:secrets:get"*) exit 0;; esac\n' +
  'printf "%s\\n" "$FIREBASE_FALSO_SAIDA"\nexit "$FIREBASE_FALSO_EXIT"\n');
// O helper persistente é exercitado sem rede: o preload troca somente aquisição do token
// e consulta de billing. O deploy propriamente dito continua passando pelo Firebase falso.
fs.writeFileSync(hook,
  "const Module=require('module');const load=Module._load;Module._load=function(r){if(r==='google-auth-library'||/google-auth-library$/.test(r))return{GoogleAuth:class{async getClient(){return{getAccessToken:async()=>({token:'teste'})}}}};return load.apply(this,arguments)};global.fetch=async()=>({ok:true,json:async()=>({state:'ENABLED'})});\n");
fs.chmodSync(bin, 0o755);

function executar(saida, codigo) {
  const env = Object.assign({}, process.env, {
    PATH: falso + path.delimiter + process.env.PATH,
    FIREBASE_FALSO_SAIDA: saida,
    FIREBASE_FALSO_EXIT: String(codigo),
    GOOGLE_APPLICATION_CREDENTIALS: chave,
    NODE_OPTIONS: '-r ' + hook,
  });
  return spawnSync('bash', ['scripts/deploy-functions.sh', 'main', '--all'], { cwd: raiz, env, encoding: 'utf8' });
}

let r = executar('Error: permission denied', 1);
let texto = (r.stdout || '') + (r.stderr || '');
assert.notEqual(r.status, 0, 'erro sem marcador de conclusão aborta');
assert.match(texto, /sem confirmar 'Deploy complete!'/, 'o motivo do aborto declara a falta de evidência');

r = executar('✔ Deploy complete!\nError: unexpected error after publish', 2);
texto = (r.stdout || '') + (r.stderr || '');
assert.equal(r.status, 0, 'marcador explícito permite seguir mesmo após exit não-zero do CLI');
assert.match(texto, /DEPOIS de confirmar o deploy/, 'o aviso descreve a condição excepcional sem fingir que não houve erro');

r = executar('✔ Deploy complete!\nCould not create or update Cloud Run service autodraw, Container Healthcheck failed.', 1);
texto = (r.stdout || '') + (r.stderr || '');
assert.notEqual(r.status, 0, 'health check falho invalida o marcador genérico de conclusão');
assert.match(texto, /sem revisão saudável ou atualização recusada/, 'o motivo impede carimbo falso após falha de Cloud Run');

fs.rmSync(falso, { recursive: true, force: true });
console.log('✅ deploy-functions só confirma falha depois de evidência explícita');
