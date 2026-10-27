'use strict';
const assert = require('assert');
const { ORIGINAL, assertNeonEmulatorTarget } = require('./neon-sandbox-guard');
const safe = {
  projectId: 'demo-scoreplace', firestoreHost: '127.0.0.1:8093',
  authHost: '127.0.0.1:9092', functionsHost: '127.0.0.1:5011',
  tournamentId: 'sb_' + ORIGINAL + '_1793070000000', sandbox: true
};
assert.strictEqual(assertNeonEmulatorTarget(safe), true);
for (const change of [
  { tournamentId: ORIGINAL }, { projectId: 'scoreplace-app' },
  { firestoreHost: '' }, { functionsHost: '' }, { sandbox: false }
]) {
  assert.throws(() => assertNeonEmulatorTarget({ ...safe, ...change }));
}
console.log('Guarda Neon: emulador válido e cinco destinos inseguros recusados.');
