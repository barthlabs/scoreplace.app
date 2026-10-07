#!/usr/bin/env node
/*
 * Habilita, de forma explícita e rastreável, a restauração pré-publicação
 * para UM torneio. A UI nunca ativa a operação por padrão: ela só aparece ao
 * organizador depois deste ajuste administrativo, que confere id e nome antes
 * de alterar o documento. Uso:
 *
 *   source scripts/firebase-credencial-persistente.sh
 *   sp_preparar_credencial_firebase "$PWD" scoreplace-app
 *   node scripts/enable-prepublication-restore.js <tournamentId> "<nome exato>"
 *
 * Requer `functions/node_modules/firebase-admin`; em checkout novo, rode
 * `cd functions && npm ci` antes. O publicador oficial já garante isso.
 */
'use strict';

const path = require('path');
const [tournamentId, ...nameParts] = process.argv.slice(2);
const expectedName = nameParts.join(' ').trim();

if (!/^[A-Za-z0-9_-]{12,}$/.test(String(tournamentId || '')) || !expectedName) {
  console.error('Uso: node scripts/enable-prepublication-restore.js <tournamentId> "<nome exato>"');
  process.exit(1);
}

let admin;
try {
  admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
} catch (error) {
  console.error('Dependência firebase-admin indisponível. Rode `cd functions && npm ci` e tente novamente.');
  process.exit(1);
}
try {
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
} catch (error) {
  console.error('Credencial Firebase indisponível. Execute `source scripts/firebase-credencial-persistente.sh` e `sp_preparar_credencial_firebase "$PWD" scoreplace-app` antes de tentar.');
  process.exit(1);
}

(async function () {
  const ref = admin.firestore().collection('tournaments').doc(tournamentId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error('Torneio não encontrado: ' + tournamentId);
  const tournament = snap.data() || {};
  if (String(tournament.name || '').trim() !== expectedName) {
    throw new Error('Nome não confere. Esperado: "' + expectedName + '"; encontrado: "' + String(tournament.name || '') + '".');
  }
  await ref.update({
    allowPrePublicationRestore: true,
    prePublicationRestoreEnabledAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log('✓ restauração pré-publicação habilitada: ' + tournamentId + ' · ' + expectedName);
})().catch(function (error) {
  console.error('✗ não foi possível habilitar a restauração pré-publicação:', error.message || error);
  process.exit(1);
});
