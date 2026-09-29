/* Regressão: uma dupla é UMA entrada na subcoleção, embora siga contendo duas pessoas.
 * `node functions/test-split-parts-marker.js` */
'use strict';
const { gravar } = require('./split-parts.js');

let rootUpdate = null;
const writes = [];
const tx = {
  set: (ref, value) => writes.push(['set', ref.path, value]),
  delete: (ref) => writes.push(['delete', ref.path]),
  update: (_ref, value) => { rootUpdate = value; }
};
const ref = {
  collection: (name) => ({ doc: (key) => ({ path: name + '/' + key }) })
};
const before = {
  _nPartes: { matches: 0, participants: 3, opponentHistory: 0 },
  participants: [{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }],
  matches: [], opponentHistory: []
};
const afterPair = [
  { p1Uid: 'a', p2Uid: 'b', p1Name: 'Ana', p2Name: 'Bia' },
  { uid: 'c' }
];

gravar(tx, ref, before, { participants: afterPair });
if (!rootUpdate || !rootUpdate._nPartes || rootUpdate._nPartes.participants !== 2) {
  console.error('✗ marcador não acompanhou a formação de dupla', rootUpdate);
  process.exit(1);
}
if (!writes.some((w) => /^inscritos\/du/.test(w[1]))) {
  console.error('✗ entrada estrutural da dupla não foi planejada', writes);
  process.exit(1);
}
console.log('✓ marcador de participantes acompanha 3 pessoas-solo → 2 registros (dupla + solo)');
