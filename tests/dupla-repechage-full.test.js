// DUPLA ELIMINATÓRIA fora de pow2 — PLAY-IN CLÁSSICO e BYE (resolução automática, planilha do dono).
// Dirige o motor REAL: _duplaR1FromPool → _buildRepechageDoubleElim → simula TODOS os jogos até o
// fim, resolvendo via _advanceWinner. A árvore-mínima + repescagem-recursiva foram SUBSTITUÍDAS:
//   • PLAY-IN: reduz a P_lo (maior pow2 ≤ n) via `reps = n−P_lo` jogos preliminares (round 0,
//     isPlayIn) entre os piores; a superior fica pow2 LIMPA (halving, sem repFill ⇒ sem double-book);
//     os perdedores do play-in + os da R1 sup caem na inferior; ímpar → BYE (nunca repescagem).
//   • BYE: pad até a pow2 ACIMA com BYEs nos melhores; o BYE avança direto pra R2 sup.
// Invariantes (sem derivar contagem à mão): todos entram, ninguém trava, sem vaga morta, sem
// double-book, campeão único. Ver project_bye_rep_auto_resolution.
const { window, sandbox, load, E } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {} };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {} };
load('tournaments-draw.js');

function mkPool(n) { var a = []; for (var i = 0; i < n; i++) a.push({ displayName: 'D' + i, name: 'D' + i, uid: 'u' + i }); return a; }
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
const BYE = 'BYE (Avança Direto)';
const isEmpty = v => !v || v === 'TBD' || v === BYE || /^bye/i.test(String(v).trim()) || /a definir/i.test(String(v));
const pow2below = n => { let p = 1; while (p * 2 <= n) p *= 2; return p; };

function build(n, res) {
  const CAT = 'Misto Obrig.';
  const cfg = { format: 'Dupla Eliminatória', formatCode: 'elim_dupla', teamSize: 2, bracketResolution: res || 'playin', seedVip: true, thirdPlace: true, source: { type: 'enrollment' }, categories: [CAT] };
  const pool = mkPool(n).map(p => Object.assign({ categories: [CAT] }, p));
  const t = { id: 'T' + n, format: 'Dupla Eliminatória', teamSize: 2, matches: [], currentPhaseIndex: 0 };
  const built = E.generatePhase(pool, cfg, { idPrefix: 'gp', ordered: true, t, isVip: () => false, catOf: e => (e.categories && e.categories[0]) || '' });
  const r = E.storePhase(t, 0, built);
  if (!r || !r.ok) { fail++; console.error('  ✗ n=' + n + ': storePhase abortou (' + (r && r.error) + ')'); return t; }
  if (built.needsRepechageDoubleElim && window._buildRepechageDoubleElim) {
    (built.repMetaByCat && built.repMetaByCat.length ? built.repMetaByCat : [built.repMeta]).forEach(mm => window._buildRepechageDoubleElim(t, mm));
  } else if (built.needsDoubleElim && window._buildDoubleElimBracket) window._buildDoubleElimBracket(t);
  return t;
}
// double-book VIVO: um time em 2 slots vivos ao mesmo tempo (assinatura do bug antigo).
function liveDouble(t) {
  const slots = {};
  window._collectAllMatches(t).filter(m => m && !m.winner).forEach(m => ['p1', 'p2'].forEach(s => { const v = m[s]; if (v && !isEmpty(v)) (slots[v] = slots[v] || []).push(m.id); }));
  return Object.keys(slots).find(v => slots[v].length > 1);
}
function simulate(t) {
  let guard = 0;
  while (guard++ < 800) {
    const self = window._collectAllMatches(t).find(m => m && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && String(m.p1) === String(m.p2));
    if (self) return { self: self.bracket + 'R' + self.round };
    const db = liveDouble(t); if (db) return { db };
    const playable = window._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
    if (!playable.length) break;
    const m = playable[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 7);
    window._advanceWinner(t, m);
  }
  return {};
}
function enterOK(t, n) {
  // todos os n entram: aparecem em ALGUM jogo do sorteio inicial (play-in R0 OU R1 sup OU R1 bye).
  const teams = new Set();
  window._collectAllMatches(t).forEach(m => { if (m && (m.round === 0 || m.round === 1) && (m.bracket === 'upper' || !m.bracket)) [m.p1, m.p2].forEach(x => { if (x && !isEmpty(x)) teams.add(x); }); });
  return teams.size === n;
}
function invariantes(t, n, rot) {
  ok(enterOK(t, n), rot + ': todos os ' + n + ' inscritos entram');
  const sim = simulate(t);
  ok(!sim.self, rot + ': nenhum auto-confronto' + (sim.self ? ' (' + sim.self + ')' : ''));
  ok(!sim.db, rot + ': nenhum double-book' + (sim.db ? ' (' + sim.db + ')' : ''));
  const after = window._collectAllMatches(t);
  const stuck = after.filter(m => !m.winner && !m.isBye && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2));
  ok(stuck.length === 0, rot + ': nenhum jogo travado (got ' + stuck.length + ')');
  const grand = after.filter(m => m.bracket === 'grand');
  ok(grand.length >= 1 && grand[grand.length - 1].winner, rot + ': campeão único');
}

// ── PLAY-IN: play-in R0 = reps jogos; superior pow2 LIMPA de P_lo ──────────────────────────────
console.log('\n== PLAY-IN — estrutura + invariantes ==');
function runPlayin(n) {
  const t = build(n, 'playin');
  const P_lo = pow2below(n), reps = n - P_lo;
  const all0 = window._collectAllMatches(t);
  const playin = all0.filter(m => m.isPlayIn && m.round === 0 && (m.bracket === 'upper' || !m.bracket));
  const r1sup = all0.filter(m => m.round === 1 && (m.bracket === 'upper' || !m.bracket));
  ok(playin.length === reps, 'play-in n=' + n + ': ' + reps + ' jogos de play-in (round 0), got ' + playin.length);
  ok(r1sup.length === P_lo / 2, 'play-in n=' + n + ': R1 sup = ' + (P_lo / 2) + ' jogos (pow2 limpa P_lo=' + P_lo + '), got ' + r1sup.length);
  // superior é pow2 LIMPA ⇒ NENHUM repFill (repescagem) em lugar nenhum
  const anyRep = all0.some(m => Array.isArray(m.repFill) && m.repFill.length);
  ok(!anyRep, 'play-in n=' + n + ': ZERO repFill (pow2 limpa, sem repescagem)');
  invariantes(t, n, 'play-in n=' + n);
}
[5, 6, 9, 10, 11, 17, 18, 21, 22, 23, 33, 40, 47].forEach(runPlayin);

// ── BYE: pad até pow2 ACIMA, byes nos melhores; BYE avança direto pra R2 sup ───────────────────
console.log('\n== BYE — estrutura + invariantes ==');
function runBye(n) {
  const t = build(n, 'bye');
  const powB = (() => { let p = 1; while (p < n) p *= 2; return p; })();
  const r1 = window._collectAllMatches(t).filter(m => m.round === 1 && (m.bracket === 'upper' || !m.bracket));
  const byeGames = r1.filter(m => m.isBye);
  ok(byeGames.length === powB - n, 'bye n=' + n + ': ' + (powB - n) + ' BYE(s) na R1 sup, got ' + byeGames.length);
  const r2 = window._collectAllMatches(t).filter(m => m.round === 2 && (m.bracket === 'upper' || !m.bracket));
  ok(byeGames.every(bg => r2.some(m => m.p1 === bg.winner || m.p2 === bg.winner)), 'bye n=' + n + ': dupla(s) com BYE já na R2 sup');
  invariantes(t, n, 'bye n=' + n);
}
[5, 6, 7, 12, 13, 14, 15, 24, 30, 31].forEach(runBye);

// ── VARREDURA n=5..40 (ambos os modos, exceto pow2): só invariantes ────────────────────────────
console.log('\n== VARREDURA n=5..40 (play-in E bye) ==');
for (let n = 5; n <= 40; n++) {
  if ((n & (n - 1)) === 0) continue;   // pow2 = dupla-elim padrão
  invariantes(build(n, 'playin'), n, 'sweep-playin n=' + n);
  invariantes(build(n, 'bye'), n, 'sweep-bye n=' + n);
}

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
