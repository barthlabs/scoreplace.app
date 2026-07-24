// ENTRADA TARDIA com a chave em ANDAMENTO (Dupla Eliminatória, estrutura nova).
//
// Modelo ANTIGO (removido): "Tier 2" — 2 duplas formadas na espera entravam como jogo NOVO na R1
// inferior, com toda a máquina de repescagem/satout da árvore-mínima. A resolução automática
// (play-in/bye) SUBSTITUIU isso. Modelo NOVO (dono, 2026-07-24): a chave FRESCA re-semeia pro N+1;
// DEPOIS de jogar, o tardio preenche um BYE materializado (ou fica na espera se não houver) — SEM
// re-sortear jogo já disputado. Este teste tranca o cenário "1ª rodada jogada + 2ª iniciada + 2
// tardias": (a) os jogos REAIS já disputados ficam intocados; (b) sem double-book; (c) a chave
// fecha num campeão. Ver project_bye_rep_auto_resolution / project_late_entry_door_upper_then_lower.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'T2_' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function liveDouble(t) {
  const slots = {};
  all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.id); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}
function playOne(t, filterFn, g) {
  const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && (!filterFn || filterFn(m)));
  if (!p.length) return null;
  const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (g % 5); W._advanceWinner(t, m); return m;
}

function run(n) {
  console.log('\n== chave em andamento · n=' + n + ' duplas + 2 tardias ==');
  const t = mkT(n); W.AppStore.tournaments = [t];
  const supMin = Math.min.apply(null, all(t).filter(m => m.bracket === 'upper' || !m.bracket).map(m => (typeof m.round === 'number') ? m.round : 1));
  // joga a 1ª rodada REAL inteira + inicia a seguinte (1 jogo) — a chave está em ANDAMENTO
  let g = 1;
  while (playOne(t, m => (m.bracket === 'upper' || !m.bracket) && ((typeof m.round === 'number') ? m.round : 1) === supMin, g++)) {}
  const upR2 = playOne(t, m => (m.bracket === 'upper' || !m.bracket) && ((typeof m.round === 'number') ? m.round : 1) === supMin + 1, g++);
  // assinatura dos jogos REAIS disputados (id+placar) — têm de sobreviver
  const reaisAntes = all(t).filter(m => m.winner && !m.isBye && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => m.id + '|' + m.winner + '|' + m.scoreP1 + '-' + m.scoreP2).sort();

  // 2 duplas tardias presentes na espera
  t.standbyParticipants = [
    { p1Name: 'LA', p2Name: 'LB', p1Uid: 'lla', p2Uid: 'llb', displayName: 'LA / LB', _lateJoin: true },
    { p1Name: 'LC', p2Name: 'LD', p1Uid: 'llc', p2Uid: 'lld', displayName: 'LC / LD', _lateJoin: true }
  ];
  t.checkedIn['lla'] = 1; t.checkedIn['llb'] = 1; t.checkedIn['llc'] = 1; t.checkedIn['lld'] = 1;
  dc.integrateLateEntries(t, {});

  // (a) jogos REAIS disputados INTOCADOS
  const reaisDepois = all(t).filter(m => m.winner && !m.isBye && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => m.id + '|' + m.winner + '|' + m.scoreP1 + '-' + m.scoreP2).sort();
  const sumiram = reaisAntes.filter(x => reaisDepois.indexOf(x) < 0);
  ok(sumiram.length === 0, 'nenhum jogo REAL disputado mudou (sumiram ' + sumiram.length + ')');
  // (b) sem double-book
  ok(!liveDouble(t), 'sem double-book' + (liveDouble(t) ? ' (' + liveDouble(t) + ')' : ''));

  // (c) playout completo → campeão único, sem travar
  let h = 1;
  while (h++ < 4000) {
    const self = all(t).find(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) { ok(false, 'auto-confronto em ' + self.bracket + 'R' + self.round); break; }
    if (!playOne(t, null, h)) break;
    if (W._resolveRepFills) try { W._resolveRepFills(t); } catch (e) {}
  }
  const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(stuck.length === 0, 'nenhum jogo travado no fim (got ' + stuck.length + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'grande final resolvida num campeão');
}

[6, 15, 10, 12, 9, 13].forEach(run);

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
