// Dupla Eliminatória fora de potência de 2 — RESOLUÇÃO AUTOMÁTICA (planilha do dono, jul/2026).
// A árvore-mínima (⌈E/2⌉ por rodada + repescado no ímpar) foi SUBSTITUÍDA: a resolução escolhe
// automaticamente a de MENOS intervenções — BYE (pad até a pow2 ACIMA) ou PLAY-IN (reduz até a
// pow2 ABAIXO). A chave SUPERIOR fica sempre pow2 LIMPA (halving sem rodada ímpar ⇒ SEM repFill/
// ressurreição ⇒ SEM double-book). A inferior usa BYE no ímpar. Ver project_bye_rep_auto_resolution.
//
// 12 duplas: byes = 16−12 = 4, reps = 12−8 = 4 → EMPATE → BYE (pad até 16). Superior = 8/4/2/1
// (4 byes na R1). NENHUM repescado (repFill) em lugar nenhum — byes, não repescagem.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'MIN' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'closed' };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
// rodadas por chave: a 1ª rodada existente de cada chave vira índice 0
function estrutura(t) {
  const ms = (W._collectAllMatches(t) || []).filter(m => m && !m.isThirdPlace);
  const por = {};
  ms.forEach(m => {
    const b = m.bracket || 'upper';
    (por[b] = por[b] || {});
    const r = (typeof m.round === 'number') ? m.round : 1;
    (por[b][r] = por[b][r] || []).push(m);
  });
  const out = {};
  Object.keys(por).forEach(b => {
    const rs = Object.keys(por[b]).map(Number).sort((x, y) => x - y);
    out[b] = rs.map(r => {
      const lista = por[b][r];
      const reps = lista.reduce((s, m) => s + ((m.repFill || []).length), 0);
      return { jogos: lista.length, repescados: reps };
    });
  });
  return out;
}
const isEmpty = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

console.log('── Dupla Eliminatória 12 duplas: resolução AUTOMÁTICA (bye, superior pow2 limpa) ──');

(function () {
  const t = mkT(12);
  const r = dc.drawInitial(t, {});
  ok(!!(r && r.ok), 'sorteio de 12 duplas roda: ' + ((r && r.reason) || 'ok'));
  ok(/dupla/i.test(t.format), 'o mock compilou como DUPLA ELIMINATÓRIA (não Simples): ' + t.format);

  const e = estrutura(t);
  const sup = e.upper || [];
  const inf = e.lower || [];

  // ── chave SUPERIOR: pow2 LIMPA (16) → 8 → 4 → 2 → 1 (12 duplas, 4 byes na R1)
  ok(sup.length === 4, 'superior tem 4 rodadas (8/4/2/1), tem ' + sup.length);
  ok(sup[0] && sup[0].jogos === 8, '1ª sup = 8 jogos (pow2 16, 12 duplas + 4 byes), veio ' + (sup[0] && sup[0].jogos));
  ok(sup[1] && sup[1].jogos === 4, '2ª sup = 4 jogos (halving), veio ' + (sup[1] && sup[1].jogos));
  ok(sup[2] && sup[2].jogos === 2, '3ª sup = 2 jogos, veio ' + (sup[2] && sup[2].jogos));
  ok(sup[3] && sup[3].jogos === 1, '4ª sup = 1 jogo (final da superior), veio ' + (sup[3] && sup[3].jogos));

  // ── ZERO repescado (repFill) na chave inteira: a estrutura nova usa BYE, não repescagem
  const totalRep = Object.keys(e).reduce((s, b) => s + e[b].reduce((x, r) => x + r.repescados, 0), 0);
  ok(totalRep === 0, 'NENHUM repescado (byes, não repescagem) na chave inteira, veio ' + totalRep);

  // ── inferior existe e reduz a 1 (motor único), com a superior alimentando os merges
  ok(inf.length >= 1 && inf[inf.length - 1].jogos === 1, 'inferior fecha em 1 jogo (campeão da inferior)');

  // ── PLAYOUT completo: sem travar, com 1 campeão na grande final
  let g = 0;
  while (g++ < 4000) {
    const p = all(t).filter(m => m && !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    try { W._advanceWinner(t, m); } catch (e2) {}
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e2) {} }
  }
  const travados = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(travados.length === 0, 'nenhum jogo travado no fim (' + travados.length + ')');
  const gf = all(t).filter(m => m.bracket === 'grand');
  ok(gf.length >= 1 && gf[gf.length - 1].winner, 'grande final coroou um campeão');

  if (fail) {
    console.log('\nESTRUTURA MEDIDA:');
    Object.keys(e).sort().forEach(b => console.log('  ' + b + ': ' + e[b].map((r, i) => 'R' + (i + 1) + '=' + r.jogos + 'j/' + r.repescados + 'rep').join('  ')));
  }
})();

console.log('\n' + (fail === 0 ? '✅ dupla-elim-minimal-tree: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
