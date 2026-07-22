/* Repescagem (playin) SINGLE-ELIM fora de pow2 — bug do dono: 25 equipes com
 * repescagem escolhida mostravam 9 jogos + BYEs (era 'bye'). node tests/phase-repechage-lines.test.js
 *
 * Regra: com N, alvo T = maior pow2 ≤ N. R1 = floor(N/2) jogos, NINGUÉM por BYE; sobra
 * (N ímpar) disputa 1 jogo de repescagem; oitavas (T) = vencedores R1 + melhores
 * derrotados (repFill). Ex. 25: T=16, 12 jogos R1 + 1 repescagem, 8 oitavas, 0 BYE.
 */
var E = require('../js/views/phases-engine.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function pool(n, pfx) { var a = []; for (var i = 1; i <= n; i++) a.push({ displayName: (pfx || 'P') + i, name: (pfx || 'P') + i }); return a; }

// ── 1. NÚCLEO: genTierBracket(25, 'playin') → 12 R1 + 1 repescagem + 8 oitavas, 0 BYE ──
(function () {
  var r = E.genTierBracket(pool(25), 'gold', 'g', 'playin', true);
  var ms = r.matches || [];
  var r1 = ms.filter(function (m) { return m.round === 0 && m.isPhaseRepR1; });
  var repGame = ms.filter(function (m) { return m.round === 0 && m.isPhaseRepGame; });
  var oitavas = ms.filter(function (m) { return m.round === 1; });
  ok(r1.length === 12, '25/playin: 12 jogos de R1 (floor(25/2)) [' + r1.length + ']');
  ok(repGame.length === 1, '25/playin: 1 jogo de repescagem (sobra × 4º melhor derrotado) [' + repGame.length + ']');
  // v1.3.77: FÓRMULA MÍNIMA (⌈E/2⌉ por rodada). 13 vencedores da 1ª rodada (12 reais + jogo do
  // satout) → 7 jogos na rodada seguinte (não 8/pow2). 1 repescado na R1 (13 ímpar; o satout já
  // pegou o rank 0, este pega o rank 1). NÃO reintroduz todos os derrotados. Ver feedback_draw_is_cf_only.
  ok(oitavas.length === 7, '25/playin: 7 jogos na 2ª rodada (⌈13/2⌉, mínimo) [' + oitavas.length + ']');
  ok(!ms.some(function (m) { return m.isBye; }), '25/playin: ZERO BYE (é repescagem, não bye)');
  var repFillSlots = oitavas.reduce(function (a, m) { return a + ((m.repFill && m.repFill.length) || 0); }, 0);
  ok(repFillSlots === 1, '25/playin: 1 repescado na 2ª rodada (13 ímpar → 1 vaga) [' + repFillSlots + ']');
})();

// ── 2. CONTRAPROVA: genTierBracket(25, 'bye') → gera BYEs (9 jogos reais de 16 slots) ──
(function () {
  var r = E.genTierBracket(pool(25), 'gold', 'g', 'bye', true);
  var ms = r.matches || [];
  var r1 = ms.filter(function (m) { return m.round === 1; });
  var byes = r1.filter(function (m) { return m.isBye; });
  var reais = r1.filter(function (m) { return !m.isBye; });
  ok(r1.length === 16, '25/bye: R1 tem 16 slots (chave de 32) [' + r1.length + ']');
  ok(byes.length === 7, '25/bye: 7 BYEs (32-25) [' + byes.length + ']');
  ok(reais.length === 9, '25/bye: só 9 jogos reais — EXATAMENTE o sintoma reportado [' + reais.length + ']');
})();

// ── 3. buildPhaseBrackets PROPAGA a resolução da fase pra CADA linha ──────────
// (2 linhas Ouro/Prata; a resolução 'playin' vale pra ambas — nenhuma por BYE.)
(function () {
  // fase anterior: 1 grupo com 16 classificados → 2 linhas de 8 via estratégia 'top'
  var prev = [{ name: 'G', players: pool(16, 'C').map(function (e) { return e.displayName; }),
    standings: pool(16, 'C').map(function (e) { return { displayName: e.displayName, name: e.displayName }; }) }];
  var csId = function (g) { return g.standings || []; };
  function build(res) {
    var cfg = { name: 'Elim', formatCode: 'elim_simples', grandFinal: true, thirdPlace: true,
      pairingStrategy: 'top', fixedPairs: false,
      source: { scope: 'overall', mapping: [
        { dest: 'upper', label: 'Ouro', rankFrom: 1, rankTo: 16 },
        { dest: 'lower', label: 'Prata', rankFrom: 1, rankTo: 16 } ] } };
    if (res) cfg.bracketResolution = res;
    return E.buildPhaseBrackets(prev, cfg, csId, 'ph1');
  }
  // 8 por linha = pow2 → sem byes de qualquer jeito; o que importa é a resolução CHEGAR.
  // Testa com um caso não-pow2: 1 grupo de 14 → 2 linhas de 7.
  var prev7 = [{ name: 'G', players: pool(14, 'D').map(function (e) { return e.displayName; }),
    standings: pool(14, 'D').map(function (e) { return { displayName: e.displayName, name: e.displayName }; }) }];
  function build7(res) {
    var cfg = { name: 'Elim', formatCode: 'elim_simples', grandFinal: true, thirdPlace: true,
      pairingStrategy: 'top', fixedPairs: false,
      source: { scope: 'overall', mapping: [
        { dest: 'upper', label: 'Ouro', rankFrom: 1, rankTo: 14 },
        { dest: 'lower', label: 'Prata', rankFrom: 1, rankTo: 14 } ] } };
    if (res) cfg.bracketResolution = res;
    return E.buildPhaseBrackets(prev7, cfg, csId, 'ph1');
  }
  var playin = build7('playin');
  var pms = playin.matches || [];
  var goldPlayin = pms.filter(function (m) { return m.bracket === 'gold'; });
  var silverPlayin = pms.filter(function (m) { return m.bracket === 'silver'; });
  ok(goldPlayin.length > 0 && silverPlayin.length > 0, 'buildPhaseBrackets: 2 linhas (gold/silver) geradas');
  ok(!goldPlayin.some(function (m) { return m.isBye; }) && !silverPlayin.some(function (m) { return m.isBye; }),
    'playin: NENHUMA linha por BYE (repescagem chega em ambas)');
  ok(goldPlayin.some(function (m) { return m.isPhaseRepR1; }) && silverPlayin.some(function (m) { return m.isPhaseRepR1; }),
    'playin: as duas linhas têm R1 de repescagem (isPhaseRepR1)');
  // contraprova bye
  var bye = build7('bye');
  var goldBye = (bye.matches || []).filter(function (m) { return m.bracket === 'gold'; });
  ok(goldBye.some(function (m) { return m.isBye; }), 'bye: linha gold tem BYE (contraste com playin)');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase-repechage-lines: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
