/* GRANDE FINAL × Nº DE LINHAS + 3º LUGAR (sempre on) — node tests/grandfinal-lines.test.js
 *
 * Congela a convergência de uma Eliminatória de 1, 2 ou 4 LINHAS (buildPhaseBrackets REAL,
 * phases-engine.js via headless) e a regra "disputa de 3º/4º SEMPRE gerada":
 *   • 1 linha  → sem convergência (campeão da linha) + 3º POR LINHA (chave ≥4).
 *   • 2 linhas + grande final → campeão A × campeão B (bracket 'grandfinal') + 3º na CONVERGÊNCIA
 *     (perdedores das finais) → 3º por-linha SUPRIMIDO.
 *   • 4 linhas + grande final → 2 SEMIS + final + 3º; pareamento das semis pela ESTRATÉGIA:
 *     'top'=(L1×L4),(L2×L3); 'balanced'=(L1×L3),(L2×L4).
 *   • grande final OFF (2 linhas) → linhas INDEPENDENTES (sem convergência) + 3º por linha.
 *
 * Nota: o 3º lugar é SEMPRE ON no produto (o toggle off foi removido faz tempo —
 * memória project_third_place_always). Por isso só testamos o caminho default (3º presente);
 * o caminho thirdPlace:false não é testado de propósito (não existe mais na UI).
 */
const { E } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const cs = (g) => g.standings;
function grp(n) {
  const st = []; for (let j = 0; j < n; j++) st.push({ name: 'P' + j, displayName: 'P' + j, wins: n - j });
  return [{ standings: st }];
}
function cfg(dests, extra) {
  return Object.assign({
    source: { mapping: dests.map((d) => ({ dest: d, rankFrom: 1, rankTo: 999 })), scope: 'per_group', rankingBasis: 'individual' },
    fixedPairs: false, pairingStrategy: 'top',
  }, extra || {});
}
const thirdCount = (r) => r.matches.filter((m) => m.isThirdPlace).length;
// a "final" de uma linha (bracket bk) é o match cujo nextMatchId aponta pro alvo de convergência
const lineFinalTo = (r, bk, targetId) => r.matches.filter((m) => m.bracket === bk && m.nextMatchId === targetId);

// ── A. 1 LINHA → sem convergência + 3º por linha ──────────────────────────
(function () {
  const r = E.buildPhaseBrackets(grp(4), cfg(['main']), cs, 'A');
  ok(r.converge === null, '[1 linha] sem convergência (converge=null)');
  ok(thirdCount(r) === 1, '[1 linha] 3º lugar gerado (sempre on) — 1 jogo por-linha');
  ok([...new Set(r.matches.map((m) => m.bracket))].join(',') === 'main', '[1 linha] só a chave main');
})();

// ── B. 2 LINHAS + GRANDE FINAL (default) → convergência + 3º na convergência ─
(function () {
  const r = E.buildPhaseBrackets(grp(8), cfg(['upper', 'lower']), cs, 'B');
  const gf = r.converge && r.converge.gf, th = r.converge && r.converge.third;
  ok(gf && gf.bracket === 'grandfinal', '[2 linhas] grande final gerada (bracket grandfinal)');
  ok(th && th.bracket === 'thirdplace', '[2 linhas] 3º/4º gerado na convergência (sempre on)');
  ok(thirdCount(r) === 0, '[2 linhas] 3º por-linha SUPRIMIDO sob convergência');
  const goldF = lineFinalTo(r, 'gold', gf.id), silverF = lineFinalTo(r, 'silver', gf.id);
  ok(goldF.length === 1 && silverF.length === 1, '[2 linhas] cada linha tem 1 final ligada à grande final');
  ok(goldF[0].nextSlot === 'p1' && silverF[0].nextSlot === 'p2', '[2 linhas] campeão linha1→GF p1, linha2→GF p2');
  ok(goldF[0].loserNextMatchId === th.id && silverF[0].loserNextMatchId === th.id, '[2 linhas] perdedores das finais → disputa de 3º');
})();

// ── C. 4 LINHAS + GRANDE FINAL → 2 semis + final + 3º; pareamento por estratégia ─
function fourLines(strat, expRoute, tag) {
  const D = ['upper', 'lower', 'line3', 'line4'];
  const r = E.buildPhaseBrackets(grp(16), cfg(D, { pairingStrategy: strat }), cs, 'C' + strat);
  const semis = r.matches.filter((m) => m.bracket === 'semifinal');
  const gf = r.converge && r.converge.gf, th = r.converge && r.converge.third;
  ok(semis.length === 2, tag + ' 2 semifinais');
  ok(gf && gf.bracket === 'grandfinal', tag + ' grande final');
  ok(th && th.bracket === 'thirdplace', tag + ' 3º/4º na convergência (sempre on)');
  ok(semis.every((s) => s.nextMatchId === gf.id), tag + ' semis → grande final');
  ok(semis.every((s) => s.loserNextMatchId === th.id), tag + ' perdedores das semis → 3º/4º');
  const route = {};
  ['gold', 'silver', 'line3', 'line4'].forEach((bk) => {
    const fm = r.matches.filter((m) => m.bracket === bk).find((m) => m.nextMatchId === semis[0].id || m.nextMatchId === semis[1].id);
    route[bk] = fm ? (fm.nextMatchId === semis[0].id ? 'semi1' : 'semi2') : '?';
  });
  ok(JSON.stringify(route) === JSON.stringify(expRoute), tag + ' pareamento das semis = ' + JSON.stringify(expRoute) + ' (veio ' + JSON.stringify(route) + ')');
}
fourLines('top', { gold: 'semi1', silver: 'semi2', line3: 'semi2', line4: 'semi1' }, "[4 linhas/'top']");
fourLines('balanced', { gold: 'semi1', silver: 'semi2', line3: 'semi1', line4: 'semi2' }, "[4 linhas/'balanced']");

// ── D. GRANDE FINAL OFF (2 linhas) → independentes, 3º por linha ───────────
(function () {
  const r = E.buildPhaseBrackets(grp(8), cfg(['upper', 'lower'], { grandFinal: false }), cs, 'D');
  ok(r.converge === null, '[GF off] linhas independentes (sem convergência)');
  ok(thirdCount(r) === 2, '[GF off] 3º por linha gerado em CADA linha (2 jogos)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' grandfinal-lines: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
