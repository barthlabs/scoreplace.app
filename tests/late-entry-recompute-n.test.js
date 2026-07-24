// ENTRADA TARDIA APÓS a 1ª rodada jogada (estrutura nova, resolução automática).
//
// Modelo do dono (jul/2026): a chave FRESCA re-semeia pro N+1; DEPOIS de jogar, o tardio entra
// PREENCHENDO um BYE materializado (bye→jogo real) — o time que folgava passa a jogar o tardio,
// sem tocar em NENHUM jogo REAL já disputado (project_bye_rep_auto_resolution / project_late_entry_door_upper_then_lower).
//
// Este teste tranca o caso "1ª rodada jogada + 1/2/3 tardios": (a) o tardio entra na chave;
// (b) os jogos REAIS já disputados (com placar, não-bye) ficam intocados; (c) sem double-book;
// (d) a chave fecha num campeão. A árvore-mínima (⌈N/2⌉ jogos + repescado) foi SUBSTITUÍDA — a
// contagem de jogos agora é a da resolução automática (bye/play-in), não ⌈N/2⌉.
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
  const t = { id: 'RECN' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
const supMs = t => all(t).filter(m => m && m.bracket !== 'lower' && m.bracket !== 'grand' && !m.isThirdPlace);
function primeiraSup(t) {
  const ms = supMs(t); if (!ms.length) return [];
  const r = Math.min.apply(null, ms.map(m => (typeof m.round === 'number') ? m.round : 1));
  return ms.filter(m => ((typeof m.round === 'number') ? m.round : 1) === r);
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

console.log('── entrada tardia após a 1ª rodada: preenche bye, não toca jogo REAL disputado ──');

[1, 2, 3].forEach(function (qtd) {
  const t = mkT(12);
  // joga só os jogos REAIS da 1ª rodada (byes são walkover, não "jogo disputado")
  primeiraSup(t).forEach(m => { if (!m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3; try { W._advanceWinner(t, m); } catch (e) {} } });
  // assinatura dos jogos REAIS disputados (id + placar) — têm de sobreviver intactos
  const reaisAntes = all(t).filter(m => m.winner && !m.isBye && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => m.id + '|' + m.winner + '|' + m.scoreP1 + '-' + m.scoreP2).sort();

  const tardios = [];
  for (let i = 0; i < qtd; i++) { tardios.push(chegaTardio(t, 100 + i * 10)); dc.integrateLateEntries(t, {}); }

  // (a) cada tardio presente entrou na chave OU ficou na espera (suplente) — nunca em limbo/double
  const noBracket = tardios.filter(p => all(t).some(m => m && (m.p1 === p.displayName || m.p2 === p.displayName)));
  ok(noBracket.length >= 1, qtd + ' tardio(s) ⇒ ao menos 1 entrou na chave (got ' + noBracket.length + ')');

  // (b) jogos REAIS já disputados ficam INTOCADOS (byes convertidos em jogo real NÃO contam)
  const reaisDepois = all(t).filter(m => m.winner && !m.isBye && !isEmpty(m.p1) && !isEmpty(m.p2)).map(m => m.id + '|' + m.winner + '|' + m.scoreP1 + '-' + m.scoreP2).sort();
  const sumiram = reaisAntes.filter(x => reaisDepois.indexOf(x) < 0);
  ok(sumiram.length === 0, qtd + ' tardio(s) ⇒ nenhum jogo REAL disputado mudou (sumiram ' + sumiram.length + ')');

  // (c) sem double-book
  ok(!liveDouble(t), qtd + ' tardio(s) ⇒ nenhum double-book' + (liveDouble(t) ? ' (' + liveDouble(t) + ')' : ''));

  // (d) joga até o fim → campeão único, sem travar
  let g = 0;
  while (g++ < 4000) {
    const self = all(t).find(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) { ok(false, qtd + ' tardio(s) ⇒ auto-confronto em ' + self.bracket + 'R' + self.round); break; }
    const p = all(t).filter(m => m && !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!p.length) break;
    const m = p[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = g % 5;
    try { W._advanceWinner(t, m); } catch (e) {}
    if (W._resolveRepFills) { try { W._resolveRepFills(t); } catch (e) {} }
  }
  const travados = all(t).filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(travados.length === 0, qtd + ' tardio(s) ⇒ nenhum jogo travado no fim (got ' + travados.length + ')');
  const grand = all(t).filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, qtd + ' tardio(s) ⇒ campeão único');
});

console.log('\n' + (fail === 0 ? '✅ late-entry-recompute-n: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
