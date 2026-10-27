'use strict';
/* Réplica local do backup do Neon. Nunca conecta ao projeto real. */
const path = require('path');
const { rodarNoEmulador } = require('./emulador');
const { ORIGINAL, assertNeonEmulatorTarget } = require('./neon-sandbox-guard');

const root = path.join(__dirname, '..');
const backupPath = process.env.NEON_BACKUP_PATH;
if (!backupPath || !path.isAbsolute(backupPath)) throw new Error('Defina NEON_BACKUP_PATH absoluto para o backup local.');
const config = require(path.join(root, 'firebase.neon-sandbox.json'));
if (config.emulators.firestore.port !== 8093 || config.emulators.auth.port !== 9092 || config.emulators.functions.port !== 5011 ||
    !config.functions.some(item => item.source === 'functions-autodraw')) throw new Error('Configuração de emulador inesperada.');

const env = { ...process.env,
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8093',
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9092',
  FIREBASE_FUNCTIONS_EMULATOR_HOST: '127.0.0.1:5011',
  GCLOUD_PROJECT: 'demo-scoreplace',
  ADMIN_PATH: path.join(root, 'functions/node_modules/firebase-admin'),
  NEON_BACKUP_PATH: backupPath
};
delete env.GOOGLE_APPLICATION_CREDENTIALS;
const driver = path.join(__dirname, 'neon-emulator-copy-driver.js');
const command = 'node ' + JSON.stringify(driver);
const out = rodarNoEmulador(['emulators:exec', '--config', 'firebase.neon-sandbox.json', '--project', 'demo-scoreplace',
  '--only', 'firestore,auth', command], { cwd: root, env, maxBuffer: 12 * 1024 * 1024 });
if (!/NEON_EMULATOR_COPY_OK/.test(out)) throw new Error('O driver não confirmou a cópia.');
console.log('Cópia local do Neon validada no emulador. ID-base:', ORIGINAL.slice(0, 12) + '…');
