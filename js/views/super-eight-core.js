/* Oito pessoas, sete rodadas: cada parceria aparece uma vez. A combinação
 * dos pares em jogos minimiza reencontros como adversários no ciclo inteiro. */
(function (root) {
  'use strict';
  function build(ids) {
    if (!Array.isArray(ids) || ids.length !== 8 || new Set(ids.map(String)).size !== 8) {
      throw new Error('O ciclo individual exige oito atletas distintos.');
    }
    var ring = [0, 1, 2, 3, 4, 5, 6, 7], rounds = [];
    for (var r = 0; r < 7; r++) {
      var pairs = [];
      for (var i = 0; i < 4; i++) pairs.push([ring[i], ring[7 - i]]);
      rounds.push(pairs);
      ring.splice(1, 0, ring.pop());
    }
    var layouts = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
    var best = null, bestScore = Infinity, bestMax = Infinity;
    for (var code = 0; code < 2187; code++) {
      var digits = [], x = code, opponents = Array(28).fill(0);
      for (var ri = 0; ri < 7; ri++) {
        var choice = x % 3; x = Math.floor(x / 3); digits.push(choice);
        layouts[choice].forEach(function (duel) {
          rounds[ri][duel[0]].forEach(function (a) { rounds[ri][duel[1]].forEach(function (b) {
            var lo = Math.min(a, b), hi = Math.max(a, b);
            opponents[lo * (15 - lo) / 2 + hi - lo - 1]++;
          }); });
        });
      }
      var score = opponents.reduce(function (sum, count) { return sum + (count - 2) * (count - 2); }, 0);
      var max = Math.max.apply(null, opponents);
      if (score < bestScore || (score === bestScore && max < bestMax)) {
        best = digits; bestScore = score; bestMax = max;
      }
    }
    return { rounds: rounds.map(function (pairs, ri) {
      return layouts[best[ri]].map(function (duel) {
        return duel.map(function (pi) { return pairs[pi].map(function (i) { return ids[i]; }); });
      });
    }), opponentRepeatScore: bestScore, maxOpponents: bestMax };
  }
  var api = { build: build };
  root.ScoreplaceSuperEight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
