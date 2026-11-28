'use strict';
// Um eco do documento magro ou um resumo duplicado não pode devolver o detalhe
// ao carregamento depois de a callable já ter confirmado o elenco.
const assert = require('node:assert/strict');
const W = require('./render-harness').sandbox;

const migration = { fingerprint: 'f48', registrationCount: 48 };
const verified = {
  id: 't', canonicalRegistrationMigration: migration,
  participants: [{ name: 'Atleta confirmado' }],
  _canonicalRosterReceipt: 'f48:48'
};
const originalSplit = W._tSplit;
W._tSplit = { partesDe: () => [] };

const echo = W._preservaPartesMontadas({
  id: 't', canonicalRegistrationMigration: { ...migration },
  participants: [{ name: 'Espelho antigo' }]
}, verified, true);
assert.strictEqual(echo.participants, verified.participants);
assert.equal(echo._canonicalRosterReceipt, 'f48:48');
assert.equal(W._elencoCanonicoAtual(echo), true);

const changed = W._preservaPartesMontadas({
  id: 't', canonicalRegistrationMigration: { fingerprint: 'novo', registrationCount: 49 },
  participants: []
}, verified, true);
assert.equal(changed._canonicalRosterReceipt, undefined);
assert.equal(W._elencoCanonicoAtual(changed), false);

W.AppStore.tournaments = [{ id: 't', canonicalRegistrationMigration: migration, participants: [] }];
W.AppStore.publicDiscovery = [echo];
assert.strictEqual(W._findTournamentById('t'), echo);
W._tSplit = originalSplit;
console.log('✓ eco magro preserva elenco conferido; fingerprint novo exige nova leitura; busca escolhe cópia confirmada');
