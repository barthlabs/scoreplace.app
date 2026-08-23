// Dupla Eliminatória ÍMPAR + 1 dupla formada na espera → a dupla ENTRA na competição.
//
// Modelo ANTIGO (removido): a dupla ímpar ficava num repGame "real VS A definir" e a tardia
// preenchia esse slot. A árvore-mínima/repescagem foi SUBSTITUÍDA pela resolução automática
// (play-in/bye) — não existe mais repGame. Modelo NOVO (dono, 2026-07-24): numa chave FRESCA
// (nada jogado), a tardia presente re-semeia a chave pro N+1 (via integrateLateEntries) e joga de
// verdade. Este teste tranca: a dupla presente ENTRA, sai da espera, sem double-book, campeão único.
// Ver project_bye_rep_auto_resolution.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
// ⏱️ Presença tem CARIMBO DE HORA e caduca em 24h ([[project_presenca_caduca_em_24h]]).
// Produção grava sempre Date.now() (medido: 317/317 valores); o `1` daqui era atalho —
// e atalho que não existe no dado real vira teste que passa sobre código quebrado.
const _AGORA = Date.now();
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const all = t => W._collectAllMatches(t) || [];

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'RGF' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = _AGORA; t.checkedIn[p.p2Uid] = _AGORA; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function liveDouble(t) {
  const slots = {};
  all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.id); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}

function r1real(t) { const sup = all(t).filter(m => m.bracket === 'upper' || !m.bracket); const minR = Math.min.apply(null, sup.map(m => m.round)); return sup.filter(m => m.round === minR && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => [m.p1, m.p2].sort().join(' vs ')).sort(); }
function run(n) {
  console.log('\n== dupla n=' + n + ' (bye-mode) + 1 tardia → preenche um BYE, R1 intacta ==');
  const t = mkT(n); W.AppStore.tournaments = [t];
  const antesR1 = r1real(t);
  const NM = 'LA / LB';
  t.standbyParticipants = [{ p1Name: 'LA', p2Name: 'LB', p1Uid: 'lla', p2Uid: 'llb', displayName: NM, name: NM, _lateJoin: true }];
  t.checkedIn['lla'] = _AGORA; t.checkedIn['llb'] = _AGORA;

  const ret = dc.integrateLateEntries(t, {});
  ok(ret && ret.changed, 'integração AGIU (não ficou no limbo) [' + JSON.stringify(ret) + ']');
  ok(all(t).some(m => m && (m.p1 === NM || m.p2 === NM)), 'a dupla tardia ENTROU na chave (preencheu um bye)');
  ok(!(t.standbyParticipants || []).some(p => p.displayName === NM), 'saiu da lista de espera');
  ok(!ret.redrawnFresh, 'NÃO re-semeou a chave');
  ok(antesR1.filter(x => r1real(t).indexOf(x) < 0).length === 0, 'confrontos REAIS da 1ª rodada INTACTOS (nada re-sorteado)');
  ok(!liveDouble(t), 'sem double-book' + (liveDouble(t) ? ' (' + liveDouble(t) + ')' : ''));
  // todos os n+1 (originais + tardia) estão na chave
  const labels = new Set(); all(t).forEach(m => [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.add(String(x)); }));
  let origIn = true; for (let i = 1; i <= n; i++) if (!labels.has('A' + i + ' / B' + i)) origIn = false;
  ok(origIn && labels.has(NM), 'todos os ' + (n + 1) + ' competidores (originais + tardia) na chave');

  // playout completo → campeão, sem travar
  let g = 0;
  while (g++ < 4000) {
    const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    W._advanceWinner(t, m); if (W._resolveRepFills) try { W._resolveRepFills(t); } catch (e) {}
  }
  const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(stuck.length === 0, 'playout: nenhum jogo travado (got ' + stuck.length + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, 'playout: grande final num campeão');
}

run(12); run(13); run(15);   // bye-mode: há byes pra preencher (play-in/pow2 não têm — o tardio espera)

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
