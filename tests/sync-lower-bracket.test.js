// ENTRADA TARDIA depois de jogar a 1ª superior (Dupla Eliminatória, estrutura nova).
//
// Modelo ANTIGO (removido): a máquina `_syncLowerBracket` era a dona única da 1ª inferior na
// árvore-mínima (jogo-7 = tardio vs melhor derrotado, satout deslocado, repescado devolvido). A
// resolução automática (play-in/bye) SUBSTITUIU tudo isso — não há mais repescagem-recursiva nem
// satout. Modelo NOVO (dono, 2026-07-24): jogada a 1ª superior, o tardio preenche um BYE
// materializado (bye→jogo real, door-aware); sem bye, fica na espera. NUNCA re-sorteia jogo já
// disputado, NUNCA duplica um competidor. Este teste tranca o fluxo "1ª sup jogada + 1/2 tardios":
// jogos REAIS disputados intactos, ZERO double-book, campeão único. Ver project_bye_rep_auto_resolution.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'SLB' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function chegaTardio(t, off) {
  const p = mkPairs(1, off)[0]; p._lateJoin = true;
  t.waitlist.push(p); t.participants.push(p);
  t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1;
  return p;
}
function jogaPrimeiraSup(t) {
  const supR = Math.min.apply(null, all(t).filter(x => x.bracket === 'upper').map(x => x.round));
  all(t).filter(m => m.bracket === 'upper' && m.round === supR && !m.winner && !m.isBye &&
    m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)).forEach((m, i) => {
      m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i % 6;
      W._advanceWinner(t, m);
      if (W._resolveRepFills) W._resolveRepFills(t);
    });
  return supR;
}
function reaisSig(t) {
  return all(t).filter(m => m.winner && !m.isBye && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => m.id + '|' + m.winner + '|' + m.scoreP1 + '-' + m.scoreP2).sort();
}
function liveDouble(t) {
  const slots = {};
  all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.id); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}
function playout(t) {
  let guard = 0;
  while (guard++ < 3000) {
    const self = all(t).find(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) return 'self@' + self.bracket + 'r' + self.round;
    const p = all(t).filter(m => m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = guard % 5;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance: ' + e.message; }
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e) {} }
  }
  return null;
}

// ── CENÁRIO DO DONO: 12 duplas, 1ª sup jogada, +1 e +2 tardios ──
console.log('── CENÁRIO DO DONO: 12 duplas, 1ª sup jogada, +1 e +2 tardios ──');
(function () {
  const t = mkT(12); W.AppStore.tournaments = [t];
  jogaPrimeiraSup(t);
  const sig0 = reaisSig(t);
  chegaTardio(t, 100); dc.integrateLateEntries(t, {});
  ok(reaisSig(t).filter(x => sig0.indexOf(x) < 0).length === 0, '+1 tardio: jogos REAIS disputados intactos');
  ok(!liveDouble(t), '+1 tardio: nenhum competidor duplicado (double-book)');
  const sig1 = reaisSig(t);
  chegaTardio(t, 200); dc.integrateLateEntries(t, {});
  ok(reaisSig(t).filter(x => sig1.indexOf(x) < 0).length === 0, '+2º tardio: jogos REAIS disputados intactos');
  ok(!liveDouble(t), '+2º tardio: nenhum competidor duplicado (double-book)');
  const err = playout(t);
  ok(!err, '+2 tardios: playout sem erro/auto-confronto (' + (err || 'ok') + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, '+2 tardios: campeão único');
})();

// ── VARREDURA do mesmo fluxo: N=3..20 × 0/1/2 tardios ──
console.log('\n── VARREDURA: N=3..20 × 0/1/2 tardios (1ª sup jogada antes) ──');
for (let N = 3; N <= 20; N++) {
  [0, 1, 2].forEach(function (q) {
    const t = mkT(N); W.AppStore.tournaments = [t];
    jogaPrimeiraSup(t);
    const sig0 = reaisSig(t);
    for (let i = 0; i < q; i++) { chegaTardio(t, 100 + i * 10); dc.integrateLateEntries(t, {}); }
    ok(reaisSig(t).filter(x => sig0.indexOf(x) < 0).length === 0, 'N=' + N + '+' + q + ': jogos REAIS disputados intactos');
    ok(!liveDouble(t), 'N=' + N + '+' + q + ': sem double-book');
    const err = playout(t);
    ok(!err, 'N=' + N + '+' + q + ': playout sem erro/auto-confronto (' + (err || 'ok') + ')');
    const grand = all(t).filter(m => m.bracket === 'grand');
    ok(grand.length >= 1 && grand[grand.length - 1].winner, 'N=' + N + '+' + q + ': campeão único');
  });
}

console.log('\n' + (fail === 0 ? '✅ sync-lower-bracket: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 30).forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
