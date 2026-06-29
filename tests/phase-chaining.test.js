/* ENCADEAMENTO cur>0 (feed-forward via bracketPhaseGroups) — node tests/phase-chaining.test.js
 *
 * Congela o caminho de materialização da Fase N→N+1 quando a ORIGEM é uma fase JÁ JOGADA
 * (cur>0): materializeNextPhase usa `bracketPhaseGroups(t, cur)` (resultado da fase anterior
 * vira "grupos com classificação") + cs=identidade. Testa o código REAL (phases-engine.js)
 * num torneio de 3 fases, jogando a fase intermediária e materializando a seguinte:
 *   • Grupos → Grupos → Elim (todos avançam): conservação através de 2 saltos de fase.
 *   • Grupos → Grupos → Elim (TOP-2 por grupo): qualificação PARCIAL no encadeamento.
 *   • Grupos → Pontos Corridos → Elim: liga vira 1 grupo (classificação geral) no feed-forward.
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => (g.players || []).map((p) => (typeof p === 'string' ? { name: p } : { name: p.name || p.displayName }));
function names(n) { const a = []; for (let i = 1; i <= n; i++) a.push('P' + i); return a; }
const isReal = (x) => x && x !== 'TBD' && !/BYE/.test(String(x));
function origin(n, midCfg, finalCfg) {
  const nm = names(n);
  return {
    id: 'ch' + n + JSON.stringify(midCfg).length, currentPhaseIndex: 0, matches: [],
    groups: [{ players: nm.map((x) => ({ name: x, displayName: x })), matches: [{ p1: nm[0], p2: nm[1], winner: nm[0] }] }],
    phases: [
      { name: 'P0', formatCode: 'grupos_mata', source: { type: 'enrollment' } },
      Object.assign({ name: 'P1', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } }, midCfg),
      Object.assign({ name: 'P2', source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 999 }] } }, finalCfg),
    ],
  };
}
function playPhase(t, idx) {
  t.matches.filter((m) => (m.phaseIndex || 0) === idx && isReal(m.p1) && isReal(m.p2) && !m.winner).forEach((m) => { m.winner = m.p1; });
}
function elimEntrants(t, idx) {
  const pm = t.matches.filter((m) => (m.phaseIndex || 0) === idx);
  if (!pm.length) return [];
  const minR = Math.min.apply(null, pm.map((m) => Number(m.round)));
  const s = [];
  pm.filter((m) => Number(m.round) === minR).forEach((m) => [m.p1, m.p2].forEach((x) => { if (isReal(x)) s.push(x); }));
  return s;
}
const distinct = (a) => [...new Set(a)];

// ── A. Grupos → Grupos → Elim (todos avançam) ──────────────────────────────
(function () {
  const t = origin(8, { formatCode: 'grupos_mata', gruposCount: 2 }, { formatCode: 'elim_simples', fixedPairs: false });
  ok(E.materializeNextPhase(t, cs, 'a1').ok, '[G→G→E] fase 1 (grupos) materializa');
  playPhase(t, 1);
  t.currentPhaseIndex = 1;
  // feed-forward: resultado da fase 1 vira 2 grupos com classificação
  const ff = E.bracketPhaseGroups(t, 1);
  ok(ff.length === 2, '[G→G→E] feed-forward devolve 2 grupos da fase 1');
  const ffNames = ff.reduce((a, g) => a.concat(g.standings.map((s) => s.displayName || s.name)), []);
  ok(JSON.stringify(distinct(ffNames).sort()) === JSON.stringify(names(8)), '[G→G→E] grupos da fase 1 contêm os 8');
  ok(E.materializeNextPhase(t, cs, 'a2').ok, '[G→G→E] fase 2 (elim) materializa do cur>0');
  const ent = elimEntrants(t, 2);
  ok(JSON.stringify(distinct(ent).sort()) === JSON.stringify(names(8)), '[G→G→E] conservação: 8 chegam na elim final');
  ok(distinct(ent).length === ent.length, '[G→G→E] sem duplicata na elim');
})();

// ── B. Grupos → Grupos → Elim (TOP-2 por grupo) — qualificação parcial ─────
(function () {
  const t = origin(8, { formatCode: 'grupos_mata', gruposCount: 2 },
    { formatCode: 'elim_simples', fixedPairs: false, source: { type: 'previous_phase', mapping: [{ dest: 'main', rankFrom: 1, rankTo: 2 }] } });
  E.materializeNextPhase(t, cs, 'b1');
  playPhase(t, 1);
  t.currentPhaseIndex = 1;
  ok(E.materializeNextPhase(t, cs, 'b2').ok, '[top-2] fase 2 materializa');
  const ent = distinct(elimEntrants(t, 2));
  ok(ent.length === 4, '[top-2] só os 2 melhores de cada grupo (4) avançam — got ' + ent.length);
  ok(ent.every((x) => names(8).indexOf(x) !== -1), '[top-2] entrantes são jogadores reais da fase 1');
})();

// ── C. Grupos → Pontos Corridos → Elim (liga vira 1 grupo geral) ───────────
(function () {
  const t = origin(8, { formatCode: 'liga' }, { formatCode: 'elim_simples', fixedPairs: false });
  ok(E.materializeNextPhase(t, cs, 'c1').ok, '[G→Liga→E] fase 1 (liga) materializa');
  playPhase(t, 1);
  t.currentPhaseIndex = 1;
  const ff = E.bracketPhaseGroups(t, 1);
  ok(ff.length === 1, '[G→Liga→E] liga vira 1 grupo (classificação geral)');
  ok(ff[0].standings.length === 8, '[G→Liga→E] classificação geral tem os 8');
  ok(E.materializeNextPhase(t, cs, 'c2').ok, '[G→Liga→E] fase 2 (elim) materializa do cur>0');
  const ent = distinct(elimEntrants(t, 2));
  ok(JSON.stringify(ent.sort()) === JSON.stringify(names(8)), '[G→Liga→E] conservação: 8 chegam na elim final');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-chaining: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
