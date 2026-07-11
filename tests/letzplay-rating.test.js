/**
 * scoreplace.app — testes do motor de rating/veredito (letzplay-rating.js)
 * Run: node tests/letzplay-rating.test.js
 * Lógica pura, sem DOM/Firebase. Reproduz os cenários validados no PoC:
 *  - Glicko básico, incerteza (veterano vs novato), bandas derivadas,
 *  - veredito rule-aware (caso Kelly), dupla com rating próprio.
 */
global.window = {};
require('../js/views/letzplay-rating.js');
var R = window._spRating;

var passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}
function seq(n, scoreFn, startR, startRd) {
  var ms = [];
  for (var i = 0; i < n; i++) ms.push({ oppRating: 1500, oppRd: 60, score: scoreFn(i) });
  return R.ratingFromMatches(ms, { startR: startR, startRd: startRd });
}

// ─── Glicko básico ───
console.log('\n📋 Glicko básico');
var win = R.glicko(1500, 200, 1500, 60, 1);
var loss = R.glicko(1500, 200, 1500, 60, 0);
assert(win.r > 1500, 'vitória vs igual sobe o rating');
assert(loss.r < 1500, 'derrota vs igual desce o rating');
assert(win.rd < 200, 'incerteza cai após um jogo');

// ─── Forma recente (tendência) ───
console.log('\n📋 Forma');
var subindo = seq(10, function (i) { return i >= 5 ? 1 : 0; }); // perdendo cedo, ganhando no fim
assert(subindo.form > 0, 'ganhar os jogos recentes dá forma positiva');

// ─── Incerteza: veterano vs novato (mesmo tropeço) ───
console.log('\n📋 Incerteza protege (veterano vs novato)');
var vSeason = seq(44, function (i) { return i % 2 ? 1 : 0; }); // ~50%, estabelece rating
var vAfter = seq(3, function () { return 0; }, vSeason.rating, vSeason.rd); // 3 derrotas
var vDelta = vAfter.rating - vSeason.rating;
var nAfter = seq(3, function () { return 0; }, 1500, 350); // novato, mesmas 3 derrotas
var nDelta = nAfter.rating - 1500;
assert(vSeason.rd < 100, 'veterano (44 jogos) tem incerteza baixa');
assert(nAfter.rd > R.RD_UNSURE, 'novato (3 jogos) continua com incerteza alta');
assert(Math.abs(nDelta) > 5 * Math.abs(vDelta), 'novato move >5x mais que o veterano no mesmo tropeço (' +
  Math.abs(nDelta).toFixed(0) + ' vs ' + Math.abs(vDelta).toFixed(0) + ')');

// ─── Bandas derivadas ───
console.log('\n📋 Bandas derivadas');
assert(R.bandForRating('beach-masc-2024', 1450) === 'D', '1450 -> D (masc 2024)');
assert(R.bandForRating('beach-masc-2024', 1600) === 'C', '1600 -> C (masc 2024)');
assert(R.bandForRating('beach-masc-2025', 1500) === 'D+/C-', '1500 -> D+/C- (masc 2025, faixa sobreposta)');
assert(R.bandForRating('beach-fem-2025', 1450) === 'D', 'Fem D é escada separada (mesmo rating, régua própria)');

// ─── Veredito: 5 estados ───
console.log('\n📋 Veredito (tem que subir / deve subir / coerente / abaixo / sem dados)');
var low = { rating: 1600, rd: 50, targetBand: 'D', ladder: 'beach-masc-2024' };

var vGato = R.verdict(Object.assign({}, low, { rule: 'open' }));
assert(vGato.code === 'tem_que_subir' && vGato.color === '🔴', 'C jogando D (livre) -> 🔴 tem que subir');

var vKelly = R.verdict(Object.assign({}, low, { rule: 'achievement', hasWonCategory: false }));
assert(vKelly.code === 'deve_subir' && vKelly.color === '🟡',
  'acima da D mas não venceu (regra conquista) -> 🟡 deve subir (caso Kelly, NÃO é gato)');

var vVenceu = R.verdict(Object.assign({}, low, { rule: 'achievement', hasWonCategory: true }));
assert(vVenceu.code === 'tem_que_subir', 'já venceu a D (conquista) -> 🔴 tem que subir');

var vOk = R.verdict({ rating: 1450, rd: 50, targetBand: 'D', ladder: 'beach-masc-2024', rule: 'open' });
assert(vOk.code === 'coerente' && vOk.color === '🟢', 'rating dentro da banda -> 🟢 coerente');

var vDown = R.verdict({ rating: 1300, rd: 50, targetBand: 'D', ladder: 'beach-masc-2024', rule: 'open' });
assert(vDown.code === 'abaixo' && vDown.color === '🔵', 'claramente abaixo -> 🔵 abaixo');

var vUnsure = R.verdict({ rating: 1600, rd: 200, targetBand: 'D', ladder: 'beach-masc-2024', rule: 'open' });
assert(vUnsure.code === 'sem_dados' && vUnsure.color === '⚪', 'incerteza alta -> ⚪ sem dados (não acusa)');

var vBorder = R.verdict({ rating: 1540, rd: 60, targetBand: 'D', ladder: 'beach-masc-2024', rule: 'open' });
assert(vBorder.code === 'deve_subir', 'pouco acima (dentro da incerteza) -> 🟡 deve subir (não crava 🔴)');

// ─── Dupla tem rating próprio (não é a média dos dois) ───
console.log('\n📋 Dupla com rating próprio');
var indivA = seq(20, function () { return 1; }); // A ganha sozinho -> forte
var indivB = seq(20, function () { return 1; }); // B ganha sozinho -> forte
var pair = R.pairRatingFromMatches(
  (function () { var ms = []; for (var i = 0; i < 20; i++) ms.push({ oppRating: 1500, oppRd: 60, score: 0 }); return ms; })()
); // a DUPLA perde junto -> rating próprio menor
var avgIndiv = (indivA.rating + indivB.rating) / 2;
assert(pair.rating < avgIndiv, 'rating da dupla que perde junto < média dos dois fortes (' +
  pair.rating.toFixed(0) + ' < ' + avgIndiv.toFixed(0) + ')');

// ─── Summary ───
console.log('\n' + '─'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(40));
process.exit(failed > 0 ? 1 : 0);
