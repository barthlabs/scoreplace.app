/* Fase de Grupos + Eliminatórias — saída OBSERVÁVEL (grupos round-robin, standings por grupo
 * renderizados). Sorteado pelo motor canônico (generateDrawFunction REAL); render por
 * renderGroupStage REAL. Grupos de N com todos-contra-todos 1v1 (p1/p2), depois classificados
 * avançam à eliminatória.
 */
const H = require('./render-harness');
const W = H.window, buildViaDraw = H.buildViaDraw, hydrateGroups = H.hydrateGroups, simulate = H.simulate;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Fase de Grupos — saída observável ==');

function groupMatches(t) { return (t.matches || []).filter(function (m) { return m.bracket === 'group' || (m.groupIdx != null && !m.isMonarch); }); }
function pairKey(a, b) { return [a, b].sort().join(' x '); }

// ---------- 1. ESTRUTURA: grupos de 4, round-robin (cada dupla joga 1x = 6 jogos/grupo) ----------
(function () {
  const t = buildViaDraw('Fase de Grupos + Eliminatórias', 16);
  ok(t._canonicalDraw === true, 'sorteado pelo motor canônico');
  const gm = groupMatches(t);
  ok(gm.length === 24, '16 jogadores → 24 jogos de grupo (4 grupos × 6 round-robin) — got ' + gm.length);
  const groups = {};
  gm.forEach(function (m) { var g = m.groupIdx; (groups[g] = groups[g] || []).push(m); });
  const gk = Object.keys(groups);
  ok(gk.length === 4, '4 grupos (got ' + gk.length + ')');
  let rrOk = true, sizeOk = true;
  gk.forEach(function (g) {
    const arr = groups[g];
    if (arr.length !== 6) sizeOk = false;
    const players = {}; arr.forEach(function (m) { players[m.p1] = 1; players[m.p2] = 1; });
    if (Object.keys(players).length !== 4) sizeOk = false;
    // round-robin: os 6 confrontos são todos os pares distintos (C(4,2)=6), cada um 1x
    const seen = {}; arr.forEach(function (m) { seen[pairKey(m.p1, m.p2)] = (seen[pairKey(m.p1, m.p2)] || 0) + 1; });
    if (Object.keys(seen).length !== 6 || Object.keys(seen).some(function (k) { return seen[k] !== 1; })) rrOk = false;
  });
  ok(sizeOk, 'cada grupo: 4 jogadores, 6 jogos');
  ok(rrOk, 'ROUND-ROBIN: os 6 confrontos de cada grupo são todos os pares distintos, cada um 1x');
})();

// ---------- 2. RENDER: uma tabela de classificação por grupo ----------
(function () {
  const t = hydrateGroups(buildViaDraw('Fase de Grupos + Eliminatórias', 16));
  t.currentStage = 'groups';
  const html = W.renderGroupStage(t, false, false) || '';
  ok(html.length > 100, 'renderGroupStage produz HTML');
  ok(/<table/.test(html), 'render tem tabela(s) de classificação');
  // 4 grupos → 4 títulos "Grupo"
  const nGrupo = (html.match(/Grupo [A-D0-9]/g) || []).length;
  ok(nGrupo >= 4, 'render mostra os 4 grupos (got ' + nGrupo + ' menções)');
})();

// ---------- 3. STANDINGS por grupo: quem venceu todos lidera ----------
(function () {
  const t = hydrateGroups(buildViaDraw('Fase de Grupos + Eliminatórias', 16));
  simulate(t); // winner=p1 sempre
  const g0 = t.groups[0];
  const st = (typeof W._computeStandings === 'function')
    ? W._computeStandings({ format: 'Fase de Grupos + Eliminatórias', matches: g0.matches, participants: g0.players.map(function (n) { return { displayName: n, name: n }; }) })
    : [];
  ok(Array.isArray(st) && st.length === 4, 'standings do grupo = 4 (got ' + (st && st.length) + ')');
  if (st.length) ok(st[0].points >= st[st.length - 1].points, 'líder do grupo tem >= pontos que o último');
})();

// ---------- 4. VARREDURA: 8/12/16 → grupos round-robin sem sobra ----------
(function () {
  let sweepFail = 0;
  [8, 12, 16].forEach(function (n) {
    const t = buildViaDraw('Fase de Grupos + Eliminatórias', n);
    const gm = groupMatches(t);
    const groups = {}; gm.forEach(function (m) { (groups[m.groupIdx] = groups[m.groupIdx] || []).push(m); });
    Object.keys(groups).forEach(function (g) {
      const players = {}; groups[g].forEach(function (m) { players[m.p1] = 1; players[m.p2] = 1; });
      const np = Object.keys(players).length, expected = np * (np - 1) / 2; // round-robin C(np,2)
      if (groups[g].length !== expected) { sweepFail++; console.log('    n=' + n + ' grupo ' + g + ': ' + groups[g].length + ' jogos, esperado ' + expected + ' (round-robin de ' + np + ')'); }
    });
  });
  ok(sweepFail === 0, 'varredura 8/12/16: cada grupo é round-robin completo (C(n,2) jogos)');
})();

console.log(pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
