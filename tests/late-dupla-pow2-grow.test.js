// Dupla Elim SEM bye (pow2: 4/8/16) + 2 duplas formadas na espera → PAREAM num jogo novo
// (cresce a chave) e ENTRAM; não-pow2 preenche bye. R1 intacta, sem double-book, playout campeão.
// Trava o "formou dupla e não entrou" em chave pow2. Ver project_late_dupla_fills_awaiting_slot.
// (era _probe_form) formar dupla(s) na espera numa Dupla Elim FRESCA, N pow2 e não-pow2.
// Verifica que a dupla SEMPRE entra (bye→jogo se houver bye; senão jogo novo crescendo a chave),
// e que com 2 duplas elas jogam entre si + playout completa num campeão.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function solo(u, nm) { return { uid: u, displayName: nm, name: nm, ligaActive: true }; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'FRM' + N, sport: 'Beach Tennis', fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  return t;
}
function liveDouble(t) { const s = {}; all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(sl => { const v = m[sl]; if (v && !isEmpty(v)) (s[v] = s[v] || []).push(m.id); })); return Object.keys(s).find(v => s[v].length > 1); }
function r1real(t) { const sup = all(t).filter(m => m.bracket === 'upper' || !m.bracket); const minR = Math.min.apply(null, sup.map(m => m.round)); return sup.filter(m => m.round === minR && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => [m.p1, m.p2].sort().join(' vs ')).sort(); }
function playout(t) { let g = 0; while (g++ < 4000) { const self = all(t).find(m => m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2)); if (self) return 'SELF'; const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)); if (!p.length) break; const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5; W._advanceWinner(t, m); if (W._resolveRepFills) try { W._resolveRepFills(t); } catch (e) {} } const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)); const grand = all(t).filter(m => m.bracket === 'grand'); return stuck.length ? 'STUCK(' + stuck.length + ')' : (grand.length && grand[grand.length - 1].winner ? 'CAMPEÃO' : 'NOCHAMP'); }

let fail = 0;
[4, 5, 6, 8, 9, 16].forEach(N => {
  const t = mkT(N); W.AppStore.tournaments = [t];
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  const antesR1 = r1real(t);
  // 4 solos → forma 2 duplas
  t.waitlist = [solo('s1', 'X1'), solo('s2', 'X2'), solo('s3', 'Y1'), solo('s4', 'Y2')];
  ['s1', 's2', 's3', 's4'].forEach(u => t.checkedIn[u] = 1);
  dc.formLatePairCore(t, { key1: 's1', key2: 's2', nowTs: 1 });   // X1/X2
  dc.formLatePairCore(t, { key1: 's3', key2: 's4', nowTs: 2 });   // Y1/Y2
  const labels = new Set(); all(t).forEach(m => [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.add(String(x)); }));
  const inX = [...labels].some(l => /X1/.test(l) && /X2/.test(l));
  const inY = [...labels].some(l => /Y1/.test(l) && /Y2/.test(l));
  const r1ok = antesR1.filter(x => r1real(t).indexOf(x) < 0).length === 0;   // R1 real intacta
  const db = liveDouble(t);
  const po = playout(t);
  const ok = inX && inY && r1ok && !db && po === 'CAMPEÃO';
  if (!ok) fail++;
  console.log(`N=${N} ${[4, 8, 16].includes(N) ? '(pow2)' : ''}  X entrou=${inX?'✅':'❌'}  Y entrou=${inY?'✅':'❌'}  R1_intacta=${r1ok?'✅':'❌'}  double-book=${db||'não'}  playout=${po}  ${ok?'':'  ⟵ FALHA'}`);
});
// ── UMA dupla ausente → presença → ENTRA sozinha (vs BYE), mesmo sem bye na chave ──────────
// (é o bug reportado: "deu presença pra um ausente, não entrou se não tem bye")
[4, 6, 8].forEach(N => {
  const t = mkT(N); W.AppStore.tournaments = [t];
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  const antesR1 = r1real(t);
  const NM = 'Z1 / Z2';
  // uma dupla na espera (ausente que recebeu presença), SOZINHA
  t.waitlist = [{ p1Uid: 'z1', p1Name: 'Z1', p2Uid: 'z2', p2Name: 'Z2', displayName: NM, name: NM, _lateJoin: true }];
  t.checkedIn['z1'] = 1; t.checkedIn['z2'] = 1;
  dc.integrateLateEntries(t, {});
  const labels = new Set(); all(t).forEach(m => [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.add(String(x)); }));
  const entrou = labels.has(NM);
  const r1ok = antesR1.filter(x => r1real(t).indexOf(x) < 0).length === 0;
  const db = liveDouble(t);
  const po = playout(t);
  const ok = entrou && r1ok && !db && po === 'CAMPEÃO';
  if (!ok) fail++;
  console.log(`SOZINHA N=${N} ${[4, 8].includes(N) ? '(pow2)' : ''}  entrou=${entrou?'✅':'❌'}  R1_intacta=${r1ok?'✅':'❌'}  double-book=${db||'não'}  playout=${po}  ${ok?'':'  ⟵ FALHA'}`);
});

console.log('\n' + (fail === 0 ? '✅ TODOS OK' : '❌ ' + fail + ' FALHA(S)'));
process.exit(fail ? 1 : 0);
