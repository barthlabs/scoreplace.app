'use strict';

const assert = require('assert');
const fs = require('fs');
const serviceCredential = require('../scripts/firebase-service-account-token');

const helper = fs.readFileSync('scripts/firebase-service-account-token.js', 'utf8');
const planner = fs.readFileSync('scripts/planejar-materializacao-inscricoes-canonicas.js', 'utf8');
const audit = fs.readFileSync('scripts/auditar-inscricoes-canonicas.js', 'utf8');

assert.ok(helper.includes('GoogleAuth') && helper.includes('GOOGLE_APPLICATION_CREDENTIALS'),
  'o leitor administrativo deve usar a conta de serviço persistente');
assert.strictEqual(serviceCredential.credentialPath({}), serviceCredential.DEFAULT_KEY_FILE,
  'sem variável explícita, o leitor deve escolher a chave persistente padrão e não a sessão local');
assert.strictEqual(serviceCredential.credentialPath({ GOOGLE_APPLICATION_CREDENTIALS: '/tmp/chave.json' }), '/tmp/chave.json',
  'um cofre explícito deve prevalecer para automação isolada');
assert.ok(!/exec(?:Sync|FileSync)?\([^\n]*gcloud auth print-access-token/.test(helper) && !planner.includes('gcloud auth print-access-token') && !audit.includes('gcloud auth print-access-token'),
  'planejamento e censo canônicos não podem voltar ao token OAuth humano');
assert.ok(planner.includes('await accessTokenForServiceAccount()') && audit.includes('await accessTokenForServiceAccount()'),
  'os dois fluxos de reforma devem renovar a credencial pela mesma porta');

console.log('✅ credencial-persistente-censos: planejamento e censo usam somente conta de serviço');
