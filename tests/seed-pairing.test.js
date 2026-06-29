/* CABEÇAS DE CHAVE (pairingStrategy='seed') — node tests/seed-pairing.test.js
 *
 * Congela a estratégia de pareamento 'seed' (cabeças de chave) na transição entre fases,
 * que faltava na matriz (top/balanced/draw_among já cobertos em phase-transition-matrix).
 * Invariante central do 'seed' (buildEntrantsByDest, phases-engine.js REAL via headless):
 *   as N MELHORES entradas (N = nº de linhas/destinos) são espalhadas 1 POR LINHA, no TOPO
 *   de cada linha (cabeças só se cruzam tarde); o RESTO é sorteado e distribuído em ordem.
 * Determinismo do teste: injeta `opts.shuffle = identidade` (mesma técnica do draw_among).
 * Cobre: indivíduos (sem dupla) e dupla fixa (fixedPairs), conservação + sem-duplicata + forma.
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => g.standings;
const ident = (a) => a;
const sortedEq = (a, b) => JSON.stringify(a.slice().sort()) === JSON.stringify(b.slice().sort());
function membersOf(e) {
  if (e.p2Name) return [e.p1Name, e.p2Name];
  const dn = e.displayName || e.name || '';
  if (dn.indexOf(' / ') !== -1) return dn.split(' / ').map((s) => s.trim());
  return [dn];
}
// 1 grupo, n indivíduos ranqueados P0(melhor)..P{n-1}
function group(n) {
  const st = []; for (let j = 0; j < n; j++) st.push({ name: 'P' + j, wins: n - j });
  return [{ standings: st }];
}
const twoLines = [{ dest: 'gold', rankFrom: 1, rankTo: 999 }, { dest: 'silver', rankFrom: 1, rankTo: 999 }];

// ── seed com INDIVÍDUOS (sem dupla) — 6 jogadores, 2 linhas ────────────────
(function () {
  const res = E.buildEntrantsByDest(group(6), twoLines, false, cs, 'seed',
    { scope: 'per_group', rankingBasis: 'individual', shuffle: ident });
  const gold = (res.gold || []).map(membersOf);
  const silver = (res.silver || []).map(membersOf);
  const all = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5'];
  const members = [].concat(gold, silver).reduce((a, e) => a.concat(e), []);
  ok(sortedEq(members, all), '[seed/ind] conservação: todos os 6 entram 1x [' + members.slice().sort().join(',') + ']');
  ok(new Set(members).size === members.length, '[seed/ind] sem duplicata');
  ok(gold.every((e) => e.length === 1) && silver.every((e) => e.length === 1), '[seed/ind] toda entrada é indivíduo');
  // invariante seed: as 2 cabeças (P0,P1) no TOPO de linhas DISTINTAS
  ok(gold[0][0] === 'P0', '[seed/ind] cabeça #1 (P0, melhor) no topo da linha 1');
  ok(silver[0][0] === 'P1', '[seed/ind] cabeça #2 (P1) no topo da linha 2');
  ok(gold[0][0] !== silver[0][0], '[seed/ind] cabeças em linhas distintas');
})();

// ── seed com DUPLA FIXA — 8 jogadores, 2 linhas ───────────────────────────
(function () {
  const res = E.buildEntrantsByDest(group(8), twoLines, true, cs, 'seed',
    { scope: 'per_group', rankingBasis: 'individual', shuffle: ident });
  const gold = (res.gold || []).map(membersOf);
  const silver = (res.silver || []).map(membersOf);
  const members = [].concat(gold, silver).reduce((a, e) => a.concat(e), []);
  ok(sortedEq(members, ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']),
    '[seed/dupla] conservação: 8 jogadores entram 1x [' + members.slice().sort().join(',') + ']');
  ok(new Set(members).size === members.length, '[seed/dupla] sem duplicata');
  ok(gold.every((e) => e.length === 2) && silver.every((e) => e.length === 2), '[seed/dupla] toda entrada é dupla (2 membros)');
  ok(gold.length === 2 && silver.length === 2, '[seed/dupla] 4 duplas distribuídas 2+2');
  // cabeça #1 (P0) lidera a dupla-topo da linha 1; cabeça #2 (P1) a da linha 2
  ok(gold[0].indexOf('P0') !== -1, '[seed/dupla] cabeça #1 (P0) na dupla-topo da linha 1');
  ok(silver[0].indexOf('P1') !== -1, '[seed/dupla] cabeça #2 (P1) na dupla-topo da linha 2');
  ok(gold[0].indexOf('P1') === -1 && silver[0].indexOf('P0') === -1, '[seed/dupla] cabeças não caem na mesma dupla/linha');
})();

// ── seed em LINHA ÚNICA = todos numa fila, cabeça no topo ──────────────────
(function () {
  const oneLine = [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
  const res = E.buildEntrantsByDest(group(5), oneLine, false, cs, 'seed',
    { scope: 'per_group', rankingBasis: 'individual', shuffle: ident });
  const main = (res.main || []).map(membersOf);
  const members = main.reduce((a, e) => a.concat(e), []);
  ok(sortedEq(members, ['P0', 'P1', 'P2', 'P3', 'P4']), '[seed/1linha] conservação dos 5');
  ok(main[0][0] === 'P0', '[seed/1linha] cabeça #1 (P0) no topo');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' seed-pairing: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
