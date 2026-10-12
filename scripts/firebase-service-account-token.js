#!/usr/bin/env node
/*
 * Credencial de leitura para scripts administrativos.
 *
 * A chave de serviço é persistente; o GoogleAuth renova internamente os access
 * tokens curtos, sem depender de `gcloud auth login` nem da sessão de uma
 * pessoa. Um script que não encontre a chave falha fechada em vez de recorrer
 * a OAuth pessoal por acidente.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { GoogleAuth } = require('google-auth-library');

const DEFAULT_KEY_FILE = path.join(os.homedir(), '.config', 'scoreplace', 'deploy-sa.json');
const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function credentialPath(env) {
  const value = env && env.GOOGLE_APPLICATION_CREDENTIALS;
  return value && String(value).trim() ? String(value).trim() : DEFAULT_KEY_FILE;
}

async function accessTokenForServiceAccount(options) {
  const opts = options || {};
  const keyFile = opts.keyFile || credentialPath(opts.env || process.env);
  if (!fs.existsSync(keyFile)) {
    throw new Error('credencial persistente indisponível: ' + keyFile);
  }
  const auth = new GoogleAuth({ keyFile, scopes: [CLOUD_PLATFORM_SCOPE] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token || !token.token) throw new Error('a conta de serviço não devolveu access token');
  return token.token;
}

function accessTokenForServiceAccountSync(options) {
  const opts = options || {};
  const env = Object.assign({}, process.env, opts.env || {});
  if (opts.keyFile) env.GOOGLE_APPLICATION_CREDENTIALS = opts.keyFile;
  const result = spawnSync(process.execPath, [__filename], {
    encoding: 'utf8',
    env,
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(detail || 'a conta de serviço não devolveu access token');
  }
  const token = String(result.stdout || '').trim();
  if (!token) throw new Error('a conta de serviço não devolveu access token');
  return token;
}

module.exports = {
  DEFAULT_KEY_FILE,
  credentialPath,
  accessTokenForServiceAccount,
  accessTokenForServiceAccountSync,
};

if (require.main === module) {
  accessTokenForServiceAccount()
    .then((token) => process.stdout.write(token + '\n'))
    .catch((error) => {
      console.error('Não foi possível obter a credencial persistente:', error && error.message ? error.message : error);
      process.exit(1);
    });
}
