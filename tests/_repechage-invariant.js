// GUARDRAIL da REPESCAGEM da Dupla Eliminatória (árvore mínima) — reproduz o auto-confronto
// SISTÊMICO (Time X vs Time X) que aparece quando um derrotado é RESSUSCITADO por repescagem
// e continua vivo noutro caminho (desce E é ressuscitado / avança E é ressuscitado / vence
// as duas chaves). Roda o playout completo de N=3..24 em vários padrões de vencedor, no
// sorteio FRESCO e com ENTRADA TARDIA, e checa 4 invariantes:
//   (1) nenhum jogo tem o MESMO time dos dois lados (auto-confronto);
//   (2) nenhum time está escalado em 2 jogos VIVOS ao mesmo tempo (double-book);
//   (3) nenhum jogo trava (fica sem vencedor com 2 lados reais);
//   (4) a grande final coroa 1 campeão.
// NÃO é uma suíte do gate (roda com `node tests/_repechage-invariant.js`) — é o sinal
// vermelho/verde do conserto sistêmico. [[project_lower_bracket_recursive_repechage]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const isEmpty = v => !v || v === 'TBD' || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];
function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'RI' + N, sport: 'Beach Tennis', fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function chegaTardio(t, off) { const p = mkPairs(1, off)[0]; p._lateJoin = true; t.waitlist.push(p); t.participants.push(p); t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; return p; }
function jogaPrimeiraSup(t) {
  const supR = Math.min.apply(null, all(t).filter(x => x.bracket === 'upper').map(x => x.round));
  all(t).filter(m => m.bracket === 'upper' && m.round === supR && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)).forEach((m, i) => {
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = i % 6; W._advanceWinner(t, m); if (W._resolveRepFills) W._resolveRepFills(t);
  });
}
function liveDoubleBook(t) {
  const slots = {};
  all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.bracket + 'r' + m.round); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}
function scan(t, pick) {
  let g = 0;
  while (g++ < 3000) {
    const sm = all(t).find(m => m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (sm) return 'SELF@' + sm.bracket + 'r' + sm.round;
    // (2) double-book DURANTE o playout: um time vivo em 2 slots ao mesmo tempo. É a
    // assinatura da integração tardia quebrada (o self-match literal só aparece quando os
    // dois caminhos vivos se cruzam num MESMO jogo — o double-book é o defeito ANTES disso).
    const db = liveDoubleBook(t);
    if (db) return 'DBLBOOK@' + db;
    const live = all(t).filter(m => !m.winner && !m.isBye && !m.isSitOut && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!live.length) break;
    const m = live[0]; m.winner = pick(m, g); m.scoreP1 = m.winner === m.p1 ? 6 : g % 5; m.scoreP2 = m.winner === m.p1 ? g % 5 : 6;
    try { W._advanceWinner(t, m); } catch (e) { return 'ERR:' + e.message; }
    if (W._resolveRepFills) W._resolveRepFills(t);
  }
  const sm = all(t).find(m => m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
  if (sm) return 'SELF@' + sm.bracket + 'r' + sm.round;
  const grand = all(t).filter(m => m.bracket === 'grand');
  const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  if (stuck.length) return 'STUCK';
  if (!(grand.length && grand[grand.length - 1].winner)) return 'NOCHAMP';
  return 'clean';
}
const PATTERNS = [['p1', m => m.p1], ['p2', m => m.p2], ['alt', (m, g) => g % 2 ? m.p1 : m.p2], ['alt2', (m, g) => g % 3 ? m.p2 : m.p1]];
const probs = [];
for (const mode of ['fresh', 'late']) {
  for (const pat of PATTERNS) {
    for (let N = 3; N <= 48; N++) {
      const t = mkT(N); W.AppStore.tournaments = [t];
      if (mode === 'late') { jogaPrimeiraSup(t); chegaTardio(t, 100); dc.integrateLateEntries(t, {}); }
      const db = liveDoubleBook(t);
      if (db) { probs.push(mode + '/N' + N + '/' + pat[0] + '=DBLBOOK:' + db); continue; }
      const r = scan(t, pat[1]);
      if (r !== 'clean') probs.push(mode + '/N' + N + '/' + pat[0] + '=' + r);
    }
  }
}
console.log(probs.length ? (probs.length + ' PROBLEMS:\n  ' + probs.join('\n  ')) : 'ALL CLEAN (fresh+late, N=3..48, 4 patterns)');
if (typeof process !== 'undefined') process.exitCode = probs.length ? 1 : 0;
