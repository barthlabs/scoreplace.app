// ENTRADA TARDIA numa chave FRESCA (Dupla Eliminatória, estrutura nova).
//
// Modelo ANTIGO (removido): o tardio nascia num jogo IRMÃO da 1ª superior, com a inferior
// reorganizada por ⌈derrotados/2⌉ + repescagem (árvore-mínima). Modelo NOVO (dono, 2026-07-24): a
// chave FRESCA (nada jogado) é RE-SEMEADA pro N+1 — o tardio joga de verdade, todos os originais
// seguem na chave, sem double-book, campeão único. (A árvore-mínima e a repescagem-recursiva
// saíram; a contagem de jogos agora é a da resolução automática bye/play-in.) Jogo com PLACAR
// nunca é tocado, mas numa chave fresca não há placar. Ver project_bye_rep_auto_resolution.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'GROW' + N, sport: 'Beach Tennis',
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
function liveDouble(t) {
  const slots = {};
  all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.id); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}
function playoutCampeao(t) {
  let g = 0;
  while (g++ < 4000) {
    const self = all(t).find(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) return { self: self.bracket + 'R' + self.round };
    const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    W._advanceWinner(t, m); if (W._resolveRepFills) try { W._resolveRepFills(t); } catch (e) {}
  }
  const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  const grand = all(t).filter(m => m.bracket === 'grand');
  return { stuck: stuck.length, champ: !!(grand.length && grand[grand.length - 1].winner) };
}

console.log('── tardio na chave FRESCA → re-semeia pro N+1, todos entram, campeão ──');

// caso do dono (12 + 1) e varredura de N com 1 e 2 tardios
[[12, 1], [12, 2], [13, 1], [15, 1], [11, 2], [7, 1]].forEach(function (cfg) {
  const N = cfg[0], qtd = cfg[1];
  const t = mkT(N); W.AppStore.tournaments = [t];
  const nomes = [];
  for (let i = 0; i < qtd; i++) { const p = chegaTardio(t, 100 + i * 10); nomes.push(p.displayName); dc.integrateLateEntries(t, {}); }

  const labels = new Set(); all(t).forEach(m => [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.add(String(x)); }));
  let origIn = true; for (let i = 1; i <= N; i++) if (!labels.has('A' + i + ' / B' + i)) origIn = false;
  ok(origIn, 'N=' + N + '+' + qtd + ': todos os ' + N + ' originais seguem na chave (nada re-sorteado)');
  // cada tardia ENTRA preenchendo um BYE; sem bye (play-in), fica na ESPERA — nunca some.
  nomes.forEach(nm => {
    const inB = labels.has(nm);
    const inW = t.waitlist.some(p => p.displayName === nm) || (t.standbyParticipants || []).some(p => p.displayName === nm);
    ok(inB || inW, 'N=' + N + '+' + qtd + ': "' + nm + '" entrou (bye) OU ficou na espera (não sumiu)');
    ok(!(inB && inW), 'N=' + N + '+' + qtd + ': "' + nm + '" não está na chave E na espera');
  });
  ok(!liveDouble(t), 'N=' + N + '+' + qtd + ': sem double-book' + (liveDouble(t) ? ' (' + liveDouble(t) + ')' : ''));
  const r = playoutCampeao(t);
  ok(!r.self, 'N=' + N + '+' + qtd + ': sem auto-confronto' + (r.self ? ' (' + r.self + ')' : ''));
  ok(r.stuck === 0, 'N=' + N + '+' + qtd + ': nenhum jogo travado (got ' + r.stuck + ')');
  ok(r.champ, 'N=' + N + '+' + qtd + ': campeão único');
});

console.log('\n' + (fail === 0 ? '✅ late-entry-upper-grows-lower: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
