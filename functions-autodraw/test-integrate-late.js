// test-integrate-late.js — INTEGRAÇÃO DE TARDIOS no SERVIDOR (draw-core.integrateLateEntries).
//
// O cliente rodava _createExtraGamesFromWaitlist / _integrateLateDuplas / _expandMonarch-
// FromWaitlist em bracket.js ao abrir o bracket. A v1.2.57 move a sistemática pro servidor:
// draw-core.integrateLateEntries roda as MESMAS funções vendoradas sobre o doc. Este teste
// dirige a entrada do servidor direto (como test-drawinitial dirige drawInitial):
//   • Eliminatória Simples de DUPLAS + 2 duplas pré-formadas tardias → changed=true, 1 jogo novo;
//   • sem tardio → changed=false (idempotente, a CF não grava).
//
// node functions-autodraw/test-integrate-late.js

const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + got + ')' : '')); }
}

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b };
}
function latePair(a, b) { return Object.assign(pair(a, b), { _lateJoin: true }); }

// Eliminatória Simples de DUPLAS: 4 duplas iniciais → R1 (2 jogos) + final TBD.
function mkSingleElim() {
  const A = pair('A1', 'A2'), B = pair('B1', 'B2'), C = pair('C1', 'C2'), D = pair('D1', 'D2');
  return {
    id: 'SE-cf', name: 'T', format: 'Eliminatórias Simples', teamSize: 2, enrollmentMode: 'teams',
    lateEnrollment: 'expand', currentPhaseIndex: 0, status: 'active',
    creatorUid: 'uOrg', organizerEmail: 'org@x.com',
    participants: [A, B, C, D],
    standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
    matches: [
      { id: 'm1', round: 1, p1: A.displayName, p2: B.displayName, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: 'mf', nextSlot: 'p1' },
      { id: 'm2', round: 1, p1: C.displayName, p2: D.displayName, winner: null, bracket: 'main', phaseIndex: 0, nextMatchId: 'mf', nextSlot: 'p2' },
      { id: 'mf', round: 2, p1: 'TBD', p2: 'TBD', winner: null, bracket: 'main', phaseIndex: 0 },
    ],
  };
}
const R1 = (t) => (t.matches || []).filter((m) => m && m.round === 1);

// ── 2 duplas pré-formadas tardias → integra no servidor ─────────────────────
(function () {
  const t = mkSingleElim();
  t.standbyParticipants = [latePair('LA', 'LB'), latePair('LC', 'LD')];
  t.checkedIn = { 'LA / LB': 1, 'LC / LD': 1 }; // mesmo-dia no servidor → precisa presença
  const before = R1(t).length;

  const res = core.integrateLateEntries(t, {});
  ok('res.ok', !!(res && res.ok), res && res.reason);
  ok('changed=true (integrou)', res && res.changed === true, res && res.changed);
  ok('extra=1 jogo novo', res && res.extra === 1, res && res.extra);
  ok('R1 cresceu +1', R1(t).length === before + 1, before + '→' + R1(t).length);
  const newG = R1(t).some((m) => m.isExtra &&
    ((m.p1 === 'LA / LB' && m.p2 === 'LC / LD') || (m.p1 === 'LC / LD' && m.p2 === 'LA / LB')));
  ok('jogo novo tem as 2 duplas tardias', newG);
  const inParts = (dn) => (t.participants || []).some((p) => (p && (p.displayName || p.name)) === dn);
  ok('duplas viraram inscritas', inParts('LA / LB') && inParts('LC / LD'));
  ok('repescagem ligada (3 jogos R1)', t.hasRepechage === true, t.hasRepechage);
})();

// ── idempotente: sem tardio → changed=false (a CF não grava) ─────────────────
(function () {
  const t = mkSingleElim();
  const res = core.integrateLateEntries(t, {});
  ok('sem tardio: ok', !!(res && res.ok));
  ok('sem tardio: changed=false', res && res.changed === false, res && res.changed);
  ok('sem tardio: R1 intacta (2 jogos)', R1(t).length === 2, R1(t).length);
})();

// ── sem chave ainda → recusa (no-bracket) ───────────────────────────────────
(function () {
  const t = mkSingleElim(); t.matches = [];
  const res = core.integrateLateEntries(t, {});
  ok('sem chave: ok=false reason=no-bracket', res && res.ok === false && res.reason === 'no-bracket', res && res.reason);
})();

console.log('\n════════════════════════════════════════');
console.log((fail === 0 ? '✅' : '❌') + ` integrateLateEntries: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);
