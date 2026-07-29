// Entrada tardia na Dupla Elim SEM re-sortear, cobrindo os casos que o dono reportou:
//  (A) 2 duplas formadas sem bye → JOGAM entre si num jogo novo (cresce a chave).
//  (B) byes ESGOTADOS + 1 tardio sozinho → NÃO ganha bye de graça ("passou de bye" era o bug):
//      devolve um bye ao seed e JOGA contra o tardio deslocado.
// Invariantes sempre: confrontos REAIS da 1ª rodada intactos, sem auto-confronto, sem double-book,
// playout completa num campeão. Ver project_late_dupla_fills_awaiting_slot.
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const isBye = v => v === BYE || /^bye/i.test(String(v || '').trim());
const all = t => W._collectAllMatches(t) || [];
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
function solo(u, nm) { return { uid: u, displayName: nm, name: nm, ligaActive: true }; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'PG' + N, sport: 'Beach Tennis', fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
function nBye(t) { return all(t).filter(m => (m.bracket === 'upper' || !m.bracket) && !isEmpty(m.p1) && isEmpty(m.p2)).length; }
function r1real(t) { const sup = all(t).filter(m => m.bracket === 'upper' || !m.bracket); const minR = Math.min.apply(null, sup.map(m => m.round)); return sup.filter(m => m.round === minR && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => [m.p1, m.p2].sort().join(' vs ')).sort(); }
function liveDouble(t) { const s = {}; all(t).filter(m => !m.winner).forEach(m => ['p1', 'p2'].forEach(sl => { const v = m[sl]; if (v && !isEmpty(v)) (s[v] = s[v] || []).push(m.id); })); return Object.keys(s).find(v => s[v].length > 1); }
function addLate(t, i) { const p = { p1Uid: 'l' + i + 'a', p1Name: 'L' + i + 'a', p2Uid: 'l' + i + 'b', p2Name: 'L' + i + 'b', displayName: 'L' + i + 'a / L' + i + 'b', name: 'L' + i + 'a / L' + i + 'b', _lateJoin: true }; t.waitlist.push(p); t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; dc.integrateLateEntries(t, {}); return p.displayName; }
function playout(t) { let g = 0; while (g++ < 5000) { const self = all(t).find(m => m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2)); if (self) return 'SELF:' + self.p1; const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)); if (!p.length) break; const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5; W._advanceWinner(t, m); if (W._resolveRepFills) try { W._resolveRepFills(t); } catch (e) {} } const stuck = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)); const grand = all(t).filter(m => m.bracket === 'grand'); return stuck.length ? 'STUCK' + stuck.length : (grand.length && grand[grand.length - 1].winner ? 'CAMPEÃO' : 'NOCHAMP'); }

let fail = 0;
function ck(cond, msg) { if (!cond) { fail++; console.log('  ❌ ' + msg); } }

// ── (A) 2 duplas formadas, N pow2 e não-pow2 → ambas entram (bye ou jogam entre si) ──────────
console.log('== (A) 2 duplas formadas ==');
[4, 5, 6, 8, 9, 16].forEach(N => {
  const t = mkT(N); W.AppStore.tournaments = [t];
  const antes = r1real(t);
  t.waitlist = [solo('s1', 'X1'), solo('s2', 'X2'), solo('s3', 'Y1'), solo('s4', 'Y2')];
  ['s1', 's2', 's3', 's4'].forEach(u => t.checkedIn[u] = 1);
  dc.formLatePairCore(t, { key1: 's1', key2: 's2', nowTs: 1 });
  dc.formLatePairCore(t, { key1: 's3', key2: 's4', nowTs: 2 });
  const labels = new Set(); all(t).forEach(m => [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) labels.add(String(x)); }));
  const inX = [...labels].some(l => /X1/.test(l) && /X2/.test(l));
  const inY = [...labels].some(l => /Y1/.test(l) && /Y2/.test(l));
  const r1ok = antes.filter(x => r1real(t).indexOf(x) < 0).length === 0;
  const po = playout(t);
  const ok = inX && inY && r1ok && !liveDouble(t) && po === 'CAMPEÃO';
  ck(ok, `N=${N}: X=${inX} Y=${inY} R1ok=${r1ok} double=${liveDouble(t)||'não'} playout=${po}`);
  console.log(`  N=${N} ${[4,8,16].includes(N)?'(pow2)':''}  ${ok?'✅':'FALHA'}`);
});

// ── (B) tardio NUNCA ganha folga de graça; esgotadas as folgas, ele ESPERA PAR ────────────────
//
// A intenção original deste bloco continua valendo: quem chega depois não pode ser premiado com
// uma folga enquanto os outros jogam. O que mudou (dono, 25/jul/2026) é o que acontece quando as
// folgas ACABAM. Antes se esperava que o extra ganhasse um jogo assim mesmo; agora a chave está
// CHEIA e um tardio sozinho não entra — espera par, e aí os dois entram juntos num jogo novo,
// sem tocar em nenhum confronto publicado. Ver tests/late-entry-never-redraws e
// tests/growth-frozen-prefix.
//
// Então o que se afirma aqui é o par de regras: TODO tardio que ENTROU está num jogo de verdade
// (nunca numa folga), e no máximo UM fica de fora — o ímpar, esperando parceiro.
console.log('== (B) tardio joga de verdade; sem par sobrando, espera ==');
[6, 7, 10, 12].forEach(N => {
  const t = mkT(N); W.AppStore.tournaments = [t];
  const byes = nBye(t);
  const antes = r1real(t);
  // folgas + 2: garante passar do ponto em que a chave enche, já com par disponível
  const nomes = []; for (let i = 1; i <= byes + 2; i++) nomes.push(addLate(t, i));

  const jogoDe = (nm) => all(t).find(m => m.p1 === nm || m.p2 === nm);
  const deFolga = nomes.filter(nm => {
    const m = jogoDe(nm);
    if (!m) return false;                                   // não entrou: é o caso "espera par"
    const opp = m.p1 === nm ? m.p2 : m.p1;
    return isBye(opp) || m.isBye;                           // entrou POR FOLGA — proibido
  });
  const foraDaChave = nomes.filter(nm => !jogoDe(nm));

  const r1ok = antes.filter(x => r1real(t).indexOf(x) < 0).length === 0;
  const po = playout(t);
  const ok = deFolga.length === 0 && foraDaChave.length <= 1 && r1ok && !liveDouble(t) && po === 'CAMPEÃO';
  ck(ok, `N=${N}: porFolga=${deFolga.length} fora=${foraDaChave.length} R1ok=${r1ok} double=${liveDouble(t)||'não'} playout=${po}`);
  console.log(`  N=${N} folgas=${byes}  tardios=${nomes.length}  entraram=${nomes.length - foraDaChave.length}  esperando=${foraDaChave.length}  ${ok?'✅':'FALHA'}`);
});

console.log('\n' + (fail === 0 ? '✅ TODOS OK' : '❌ ' + fail + ' FALHA(S)'));
process.exit(fail ? 1 : 0);
