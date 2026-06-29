/* CATEGORIAS NA TRANSIÇÃO (split de Eliminatória por categoria) — node tests/category-transition.test.js
 *
 * Congela o EIXO categoria do gerador canônico `generatePhase` (phases-engine.js REAL via headless):
 * uma Eliminatória com `cfg.categories` + `ctx.catOf` vira N CHAVES INDEPENDENTES (1 por categoria),
 * cada match tagueado com sua categoria, SEM pareamento cruzado entre categorias, e seeding 1×N
 * DENTRO de cada categoria. Cobre: categorias pares, categorias DESIGUAIS (tamanhos diferentes),
 * 3º lugar por categoria (sempre on), e o caso SEM categorias (1 chave única).
 *
 * Obs: `materializeNextPhase` (Fase N) NÃO separa por categoria — quem separa o pool por categoria
 * é o CHAMADOR (comentário do motor, phases-engine.js ~714) chamando generatePhase 1× por categoria.
 * Por isso o teste exercita generatePhase diretamente (a unidade onde o split mora).
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const isReal = (x) => x && !/BYE|TBD/.test(String(x));
function r1RealsOfCat(b, cat) {
  const s = [];
  b.matches.filter((m) => m.round === 1 && m.category === cat).forEach((m) => {
    [m.p1, m.p2].forEach((x) => { if (isReal(x)) s.push(x); });
  });
  return s.sort();
}
function r1PairsOfCat(b, cat) {
  return b.matches.filter((m) => m.round === 1 && m.category === cat).map((m) => [m.p1, m.p2]);
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function poolOf(spec) {
  // spec = { Fem: n, Masc: n } → [{displayName, cat}]
  const out = [];
  Object.keys(spec).forEach((cat) => { for (let i = 1; i <= spec[cat]; i++) out.push({ displayName: cat[0] + i, cat: cat }); });
  return out;
}
const ctxOf = (id) => ({ idPrefix: id, ordered: true, catOf: (e) => e.cat });

// ── A. 2 categorias × 4 — chaves independentes, seeding 1×N por categoria ──
(function () {
  const cfg = { formatCode: 'elim_simples', categories: ['Fem', 'Masc'], fixedPairs: false, source: { type: 'previous_phase' } };
  const b = E.generatePhase(poolOf({ Fem: 4, Masc: 4 }), cfg, ctxOf('A'));
  ok(b.matches.length === 8, '[2×4] 8 jogos no total (4 por categoria: semis+final+3º)');
  ok(b.matches.every((m) => m.category === 'Fem' || m.category === 'Masc'), '[2×4] todo match tagueado por categoria');
  ok(eq(r1RealsOfCat(b, 'Fem'), ['F1', 'F2', 'F3', 'F4']), '[2×4] conservação Fem');
  ok(eq(r1RealsOfCat(b, 'Masc'), ['M1', 'M2', 'M3', 'M4']), '[2×4] conservação Masc');
  ok(eq(r1PairsOfCat(b, 'Fem'), [['F1', 'F4'], ['F2', 'F3']]), '[2×4] seeding 1×N na Fem (F1×F4, F2×F3)');
  ok(eq(r1PairsOfCat(b, 'Masc'), [['M1', 'M4'], ['M2', 'M3']]), '[2×4] seeding 1×N na Masc (M1×M4, M2×M3)');
  // sem pareamento cruzado: nenhum jogo mistura Fem com Masc
  const cross = b.matches.some((m) => isReal(m.p1) && isReal(m.p2) && m.p1[0] !== m.p2[0]);
  ok(!cross, '[2×4] nenhum pareamento cruzado entre categorias');
  // 3º lugar por categoria (sempre on)
  ok(b.matches.filter((m) => m.isThirdPlace && m.category === 'Fem').length === 1, '[2×4] 3º lugar gerado na Fem');
  ok(b.matches.filter((m) => m.isThirdPlace && m.category === 'Masc').length === 1, '[2×4] 3º lugar gerado na Masc');
})();

// ── B. categorias DESIGUAIS (Fem 4, Masc 2) — cada uma sua chave própria ───
(function () {
  const cfg = { formatCode: 'elim_simples', categories: ['Fem', 'Masc'], fixedPairs: false, source: { type: 'previous_phase' } };
  const b = E.generatePhase(poolOf({ Fem: 4, Masc: 2 }), cfg, ctxOf('B'));
  const fem = b.matches.filter((m) => m.category === 'Fem');
  const masc = b.matches.filter((m) => m.category === 'Masc');
  ok(fem.length === 4, '[4/2] Fem = 4 jogos (chave de 4 + 3º)');
  ok(masc.length === 1, '[4/2] Masc = 1 jogo (final direta, 2 jogadores, sem 3º)');
  ok(eq(r1RealsOfCat(b, 'Fem'), ['F1', 'F2', 'F3', 'F4']), '[4/2] conservação Fem');
  ok(eq(r1RealsOfCat(b, 'Masc'), ['M1', 'M2']), '[4/2] conservação Masc');
  ok(masc.every((m) => !m.isThirdPlace), '[4/2] Masc sem 3º (só 2 → sem semifinais)');
})();

// ── C. SEM categorias → 1 chave única ──────────────────────────────────────
(function () {
  const cfg = { formatCode: 'elim_simples', fixedPairs: false, source: { type: 'previous_phase' } };
  const b = E.generatePhase(poolOf({ Open: 8 }).map((e) => ({ displayName: e.displayName })), cfg, { idPrefix: 'C', ordered: true });
  ok(b.matches.length === 8, '[sem cat] chave única de 8 = 7 jogos + 3º = 8');
  ok(b.matches.every((m) => m.category == null), '[sem cat] nenhum match tem categoria');
  ok(b.matches.filter((m) => m.isThirdPlace).length === 1, '[sem cat] 1 jogo de 3º (única chave)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' category-transition: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
