'use strict';

const assert = require('assert');
const fs = require('fs');
const serviceCredential = require('../scripts/firebase-service-account-token');

const helper = fs.readFileSync('scripts/firebase-service-account-token.js', 'utf8');
const planner = fs.readFileSync('scripts/planejar-materializacao-inscricoes-canonicas.js', 'utf8');
const audit = fs.readFileSync('scripts/auditar-inscricoes-canonicas.js', 'utf8');
const readOnlyScripts = [
  'auditar-transicao-classificatoria-legada.js',
  'backup-torneios.js',
  'baixar-torneios.js',
  'censo-formatos-legados.js',
  'conferir-banco-novo.js',
  'conferir-espelho-resultados.js',
  'conferir-indice-completo.js',
  'conferir-repescados-por-desempenho.js',
  'medir-meus-torneios.js',
].map((file) => ({ file, source: fs.readFileSync('scripts/' + file, 'utf8') }));
const allAdministrativeScripts = fs.readdirSync('scripts', { recursive: true })
  .filter((file) => file.endsWith('.js'))
  .map((file) => ({ file, source: fs.readFileSync('scripts/' + file, 'utf8') }));

assert.ok(helper.includes('GoogleAuth') && helper.includes('GOOGLE_APPLICATION_CREDENTIALS'),
  'o leitor administrativo deve usar a conta de serviço persistente');
assert.strictEqual(serviceCredential.credentialPath({}), serviceCredential.DEFAULT_KEY_FILE,
  'sem variável explícita, o leitor deve escolher a chave persistente padrão e não a sessão local');
assert.strictEqual(serviceCredential.credentialPath({ GOOGLE_APPLICATION_CREDENTIALS: '/tmp/chave.json' }), '/tmp/chave.json',
  'um cofre explícito deve prevalecer para automação isolada');
assert.strictEqual(typeof serviceCredential.accessTokenForServiceAccountSync, 'function',
  'scripts legados síncronos devem obter token pela mesma conta de serviço');
assert.ok(!/exec(?:Sync|FileSync)?\([^\n]*gcloud auth print-access-token/.test(helper) && !planner.includes('gcloud auth print-access-token') && !audit.includes('gcloud auth print-access-token'),
  'planejamento e censo canônicos não podem voltar ao token OAuth humano');
assert.ok(planner.includes('await accessTokenForServiceAccount()') && audit.includes('await accessTokenForServiceAccount()'),
  'os dois fluxos de reforma devem renovar a credencial pela mesma porta');
readOnlyScripts.forEach(({ file, source }) => {
  assert.ok(source.includes("require('./firebase-service-account-token')"), file + ' deve usar o cofre comum');
  assert.ok(source.includes('accessTokenForServiceAccountSync()'), file + ' deve pedir token pela conta de serviço');
  assert.ok(!source.includes('gcloud auth print-access-token'), file + ' não pode voltar ao OAuth humano');
});
allAdministrativeScripts.forEach(({ file, source }) => {
  assert.ok(!source.includes('gcloud auth print-access-token'), file + ' não pode reintroduzir OAuth humano');
  if (file !== 'firebase-service-account-token.js' && source.includes('accessTokenForServiceAccountSync')) {
    assert.ok(source.includes("firebase-service-account-token"), file + ' deve importar o cofre comum');
  }
});

console.log('✅ credencial-persistente-censos: nenhum script administrativo volta ao OAuth humano');
