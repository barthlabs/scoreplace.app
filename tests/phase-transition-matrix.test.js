/* Matriz combinatória de transição entre fases — node tests/phase-transition-matrix.test.js
 *
 * Filosofia: o espaço de configs é grande demais pra escrever a saída esperada de cada
 * combinação à mão. Então geramos a matriz por código e afirmamos INVARIANTES que TÊM que
 * valer pra QUALQUER config válida de transição:
 *   (I1) Conservação: todo classificado que o mapeamento manda avançar aparece — e só 1x.
 *   (I2) Sem duplicata: ninguém entra duas vezes.
 *   (I3) Forma: fixedPairs=true → toda entrada é DUPLA (2 membros); false → INDIVÍDUO (1).
 *   (I4) Contagem: nº de entradas bate (total/2 em duplas, total em indivíduos).
 *   (I5) Ordem de pareamento (grupo único, determinístico): 'top'=1º+2º; 'balanced'=1º+último.
 *
 * Cobre as variáveis que o dono citou: classificar por grupo vs geral; dupla fixa por
 * performance ('top') / equilíbrio ('balanced') / sorteio ('draw_among') / sem dupla.
 * Testa a lógica REAL (js/views/phases-engine.js) via tests/headless.js.
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => g.standings;                         // computeStandings: standings já ordenadas
const sortedEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());

function membersOf(e) {
  if (e.p2Name) return [e.p1Name, e.p2Name];
  const dn = e.displayName || e.name || '';
  if (dn.indexOf(' / ') !== -1) return dn.split(' / ').map((s) => s.trim());
  return [dn];
}
function makeGroups(nG, gs) {
  const prev = [], all = [];
  for (let i = 0; i < nG; i++) {
    const st = [];
    for (let j = 0; j < gs; j++) { const nm = 'G' + i + 'P' + j; st.push({ name: nm, wins: gs - j }); all.push(nm); }
    prev.push({ standings: st });
  }
  return { prev, all };
}

// ── Sweep combinatório de invariantes ────────────────────────────────────────
const SCOPES = ['per_group', 'overall'];
const FIXED = [true, false];
const STRAT = ['top', 'balanced', 'draw_among'];
const NGROUPS = [1, 2];
const SIZES = [4, 8];
let combos = 0;

SCOPES.forEach((scope) => FIXED.forEach((fixedPairs) => STRAT.forEach((strat) =>
  NGROUPS.forEach((nG) => SIZES.forEach((gs) => {
    combos++;
    const tag = `[scope=${scope} fixed=${fixedPairs} strat=${strat} grupos=${nG} tam=${gs}]`;
    const { prev, all } = makeGroups(nG, gs);
    const mapping = [{ dest: 'main', rankFrom: 1, rankTo: 999 }]; // todos avançam
    const opts = { scope, rankingBasis: 'individual' };
    if (strat === 'draw_among') opts.shuffle = (a) => a; // determinístico p/ o teste

    let res;
    try { res = E.buildEntrantsByDest(prev, mapping, fixedPairs, cs, strat, opts); }
    catch (e) { ok(false, tag + ' lançou: ' + e.message); return; }

    const entries = (res && res.main) || [];
    const members = entries.reduce((acc, e) => acc.concat(membersOf(e)), []);

    ok(sortedEq(members, all), tag + ' I1 conservação (todos avançam 1x) — veio [' + members.sort().join(',') + ']');
    ok(new Set(members).size === members.length, tag + ' I2 sem duplicata');
    if (fixedPairs) {
      ok(entries.every((e) => membersOf(e).length === 2), tag + ' I3 toda entrada é dupla');
      ok(entries.length === all.length / 2, tag + ' I4 nº de duplas = total/2');
    } else {
      ok(entries.every((e) => membersOf(e).length === 1), tag + ' I3 toda entrada é indivíduo');
      ok(entries.length === all.length, tag + ' I4 nº de indivíduos = total');
    }
  })))));

// ── I5: ordem de pareamento determinística (1 grupo, dupla fixa) ──────────────
(function () {
  const { prev } = makeGroups(1, 4); // G0P0..G0P3 ordenados (P0 = 1º)
  const mp = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  const top = E.buildEntrantsByDest(prev, mp, true, cs, 'top').main.map((e) => membersOf(e));
  const bal = E.buildEntrantsByDest(prev, mp, true, cs, 'balanced').main.map((e) => membersOf(e));
  ok(JSON.stringify(top) === JSON.stringify([['G0P0', 'G0P1'], ['G0P2', 'G0P3']]), "I5 'top' (performance) = 1º+2º · 3º+4º");
  ok(JSON.stringify(bal) === JSON.stringify([['G0P0', 'G0P3'], ['G0P1', 'G0P2']]), "I5 'balanced' (equilíbrio) = 1º+último · 2º+3º");
})();

// ── Caso documentado: 'overall' + 2 linhas + 2 grupos DEGENERA p/ per_group ──
(function () {
  const { prev, all } = makeGroups(2, 4);
  const mp = [{ dest: 'gold', rankFrom: 1, rankTo: 2 }, { dest: 'silver', rankFrom: 3, rankTo: 4 }];
  let res;
  try { res = E.buildEntrantsByDest(prev, mp, false, cs, 'top', { scope: 'overall' }); }
  catch (e) { ok(false, 'degeneração lançou: ' + e.message); return; }
  const members = [].concat(res.gold || [], res.silver || []).reduce((a, e) => a.concat(membersOf(e)), []);
  ok(sortedEq(members, all), 'degeneração overall+2linhas+2grupos conserva (8 distribuídos em gold+silver)');
  ok(new Set(members).size === members.length, 'degeneração sem duplicata');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-transition-matrix: ' + combos + ' combos, ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
