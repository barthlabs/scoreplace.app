'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const { sandbox } = require('./render-harness');
const root = path.join(__dirname, '..');
vm.runInContext(fs.readFileSync(path.join(root, 'js/views/wo-log.js'), 'utf8'), sandbox, { filename: 'wo-log.js' });
const W = sandbox;
let n = 0;
function ok(v, m) { assert.ok(v, m); n++; console.log('  ✓ ' + m); }

const t = {
  absent: {
    u_marcos: { name: 'Marcos Alvarez', at: '2026-09-15T19:18:26.990Z', matchId: 'm157' },
    u_flavia: { name: 'Flavia Cocozza', at: '2026-09-15T19:19:00.000Z', matchId: 'm157' },
    u_outra: { name: 'Outra ausência', at: '2026-09-15T19:20:00.000Z' }
  },
  woHistory: {
    u_marcos: { name: 'Marcos Alvarez', replacedBy: 'Adriana Rosa', matchId: 'm157' },
    u_flavia: { name: 'Flavia Cocozza', replacedBy: 'Eliane Cinelli', matchId: 'm157' }
  },
  woClaims: [
    { status: 'applied', absentUids: ['u_marcos'], absentName: 'Marcos Alvarez', substituteName: 'Adriana Rosa' },
    { status: 'applied', absentUids: ['u_flavia'], absentName: 'Flavia Cocozza', substituteName: 'Eliane Cinelli' }
  ]
};
const legacy = [{ id: 'legacy-1', isSitOut: true, sitOutReason: 'wo', p1: 'Marcos Alvarez', p1Uid: 'u_marcos', team1Uids: ['u_marcos'] }];
const list = W._activeWoList(t, legacy);
const byUid = Object.fromEntries(list.map(x => [x.p1Uid, x]));
ok(list.length === 2, '① W.O. de jogo substituído entra na lista e o marcador legado não duplica');
ok(byUid.u_marcos && byUid.u_marcos.p1 === 'Marcos Alvarez', '② Marcos permanece visível no W.O. após Adriana assumir o jogo');
ok(byUid.u_flavia && byUid.u_flavia.p1 === 'Flavia Cocozza', '③ Flávia permanece visível no W.O. após Eliane assumir o jogo');
ok(!byUid.u_outra, '④ ausência sem histórico ou claim aplicado não vira W.O. por suposição');
const reverted = W._activeWoList({ absent: { u_x: { name: 'X' } }, woClaims: [{ status: 'reverted', absentUids: ['u_x'], absentName: 'X' }] }, []);
ok(reverted.length === 0, '⑤ claim revertido não ressuscita W.O. na lista');
console.log('✅ ' + n + ' asserções — lista ativa de W.O. lê o estado canônico da substituição');
