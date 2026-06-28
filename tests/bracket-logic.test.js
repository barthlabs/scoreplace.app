/* Teste headless da lógica REAL de eliminatória — node tests/bracket-logic.test.js
 * Carrega js/views/bracket-logic.js de verdade (via tests/headless.js, contexto vm).
 * Cobre o caminho "criar → resultado → avançar → campeão":
 *   - _advanceWinner roteia o vencedor pro próximo jogo (nextSlot p1/p2 e slot livre)
 *   - _autoResolveBye resolve BYE e propaga
 *   - _getChampion só aponta campeão com a final decidida
 *   - _findMatch acha em t.matches
 */
const { window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

const BYE = W._t('bui.byeLabel'); // mesmo rótulo que o código usa internamente

// ── 1. Semifinais → Final via nextSlot explícito ────────────────────────────
(function () {
  const t = {
    format: 'Eliminatórias Simples',
    matches: [
      { id: 'sf1', round: 1, p1: 'A', p2: 'B', nextMatchId: 'f', nextSlot: 'p1' },
      { id: 'sf2', round: 1, p1: 'C', p2: 'D', nextMatchId: 'f', nextSlot: 'p2' },
      { id: 'f', round: 2, p1: 'TBD', p2: 'TBD' },
    ],
  };
  const sf1 = W._findMatch(t, 'sf1');
  ok(!!sf1, '_findMatch acha sf1 em t.matches');
  sf1.winner = 'A'; W._advanceWinner(t, sf1);
  const sf2 = W._findMatch(t, 'sf2');
  sf2.winner = 'C'; W._advanceWinner(t, sf2);
  const f = W._findMatch(t, 'f');
  eq(f.p1, 'A', 'vencedor de sf1 vai pro slot p1 da final');
  eq(f.p2, 'C', 'vencedor de sf2 vai pro slot p2 da final');

  eq(W._getChampion(t, [1, 2]), null, 'sem campeão enquanto a final não tem vencedor');
  f.winner = 'A';
  eq(W._getChampion(t, [1, 2]), 'A', 'campeão = vencedor da final');
})();

// ── 2. Avanço padrão (sem nextSlot) preenche o primeiro slot TBD ──────────────
(function () {
  const t = {
    format: 'Eliminatórias Simples',
    matches: [
      { id: 'm1', round: 1, p1: 'X', p2: 'Y', nextMatchId: 'fin' },
      { id: 'm2', round: 1, p1: 'Z', p2: 'W', nextMatchId: 'fin' },
      { id: 'fin', round: 2, p1: 'TBD', p2: 'TBD' },
    ],
  };
  const m1 = W._findMatch(t, 'm1'); m1.winner = 'Y'; W._advanceWinner(t, m1);
  const m2 = W._findMatch(t, 'm2'); m2.winner = 'Z'; W._advanceWinner(t, m2);
  const fin = W._findMatch(t, 'fin');
  eq(fin.p1, 'Y', 'primeiro vencedor cai no primeiro slot livre (p1)');
  eq(fin.p2, 'Z', 'segundo vencedor cai no próximo slot livre (p2)');
})();

// ── 3. BYE: jogo real vs BYE é auto-resolvido e propaga ──────────────────────
(function () {
  const t = {
    format: 'Eliminatórias Simples',
    matches: [
      { id: 'r1', round: 1, p1: 'A', p2: BYE, nextMatchId: 'r2', nextSlot: 'p1' },
      { id: 'r2', round: 2, p1: 'TBD', p2: 'B' },
    ],
  };
  // Auto-resolve direto do jogo com BYE
  W._autoResolveBye(t, W._findMatch(t, 'r1'));
  const r1 = W._findMatch(t, 'r1');
  eq(r1.winner, 'A', 'jogo real vs BYE resolve com o jogador real vencendo');
  ok(r1.isBye === true, 'jogo marcado isBye');
  const r2 = W._findMatch(t, 'r2');
  eq(r2.p1, 'A', 'vencedor do BYE avança pro próximo jogo');
  ok(r2.p1FromBye === true, 'slot marcado p1FromBye (tag BYE só nesta rodada)');
})();

console.log((fail === 0 ? '✅' : '❌') + ' bracket-logic: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
