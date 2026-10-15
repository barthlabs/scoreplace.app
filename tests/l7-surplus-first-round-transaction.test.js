'use strict';

const assert = require('assert');
const draw = require('../functions-autodraw/draw-core.js');
const H = require('./headless.js');
H.load('bracket-policy.js');
const { E } = H;
const policy = require('../js/views/bracket-policy.js');

function roster(n) {
  return Array.from({ length: n }, (_, i) => ({ uid: 'u' + (i + 1),
    displayName: 'P' + (i + 1), name: 'P' + (i + 1) }));
}

for (const n of [5, 7]) {
  const t = { id: 'l7-initial-' + n, name: 'Teste', status: 'open',
    format: 'Eliminatórias Simples', politicaDaChave: 'sobra_unica', participants: roster(n) };
  const res = draw.drawInitial(t, { idStamp: 1710000000000 });
  assert.strictEqual(res.ok, true);
  const receipts = Object.values(t.sobraUnicaDecisoesV1 || {});
  assert.strictEqual(receipts.length, 1, 'sorteio R1 grava uma decisão para N=' + n);
  const picked = receipts[0];
  assert.strictEqual(picked.schema, 1);
  assert.strictEqual(picked.sourceIds.length, n);
  const bye = t.matches.find(m => m.isBye && m.round === 1);
  assert(bye && bye.winner, 'sobra escolhida entra na chave publicada');
  assert.strictEqual(policy.surplusEntryIdentity(bye.team1Obj), picked.recipientIdentity,
    'a identidade publicada coincide com o recibo');
}

// O re-sorteio reutiliza o reset canônico do servidor. A decisão antiga pertence
// à chave apagada e não pode ser reaproveitada para um elenco em outra ordem.
{
  const t = { id: 'l7-redraw', name: 'Re-sorteio', status: 'open',
    format: 'Eliminatórias Simples', politicaDaChave: 'sobra_unica', participants: roster(5) };
  assert.strictEqual(draw.drawInitial(t, { idStamp: 1710000000000 }).ok, true);
  assert.strictEqual(Object.keys(t.sobraUnicaDecisoesV1 || {}).length, 1);
  draw._window._clearTournamentDraw(t);
  assert.strictEqual(t.sobraUnicaDecisoesV1, null,
    'reset invalida o recibo antigo mesmo na gravação merge-safe');
  t.participants.reverse();
  const again = draw.drawInitial(t, { idStamp: 1710000001000 });
  assert.strictEqual(again.ok, true, 're-sorteio com ordem diferente não herda o recibo anterior');
  const newReceipt = Object.values(t.sobraUnicaDecisoesV1 || {})[0];
  const newBye = t.matches.find(m => m.isBye && m.round === 1);
  assert(newReceipt && newBye && newBye.winner);
  assert.strictEqual(policy.surplusEntryIdentity(newBye.team1Obj), newReceipt.recipientIdentity,
    'a nova chave e o novo recibo concordam depois do reset');
}

// A segunda porta da R1 é o avanço Grupos → Eliminatória. Usa o mesmo
// preparador transacional antes de materializar a fase, inclusive com duas linhas.
for (const n of [5, 7]) {
  const participants = roster(n * 2);
  const t = { id: 'l7-phase-' + n, name: 'Teste', currentPhaseIndex: 0,
    participants, matches: [], groups: [{ name: 'A', players: participants,
      matches: [{ p1: participants[0].name, p2: participants[1].name,
        winner: participants[0].name }] }], phases: [
      { name: 'Grupos', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      { name: 'Mata-mata', formatCode: 'elim_simples', politicaDaChave: 'sobra_unica',
        fixedPairs: false, grandFinal: true,
        source: { type: 'previous_phase', mapping: [
          { dest: 'upper', rankFrom: 1, rankTo: n * 2 },
          { dest: 'lower', rankFrom: 1, rankTo: n * 2 }
        ] } }
    ] };
  const standings = () => participants.map(p => ({ uid: p.uid, name: p.name, displayName: p.name }));
  const result = E.materializeNextPhase(t, standings, 'phase-l7-' + n,
    { ts: 1710000000000, rnd: () => 0.5, agoraIso: '2026-10-14T00:00:00Z' });
  assert.strictEqual(result.ok, true, 'avanço materializa fase para N por linha=' + n);
  const entries = Object.entries(t.sobraUnicaDecisoesV1 || {});
  assert.strictEqual(entries.length, 2, 'cada linha tem decisão própria');
  for (const [key, receipt] of entries) {
    const scope = JSON.parse(key);
    assert.strictEqual(scope[0], 1, 'fase do recibo é a fase ativa');
    assert.strictEqual(scope[4], 1, 'decisão pertence à R1');
    assert.strictEqual(receipt.sourceIds.length, n);
  }
}

console.log('✓ duas portas da R1 gravam recibo antes de publicar a chave');
