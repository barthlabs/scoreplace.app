/* Oito pessoas, sete rodadas: cada parceria aparece uma vez. A combinação
 * dos pares em jogos minimiza reencontros como adversários no ciclo inteiro. */
(function (root) {
  'use strict';
  function identity(value) {
    if (value && typeof value === 'object') return String(value.uid || (value.manualParticipantId && 'manual:'+value.manualParticipantId) || value.id || value.displayName || value.name || '');
    return String(value);
  }
  function build(ids, roundsCount) {
    if (!Array.isArray(ids) || ids.length !== 8 || new Set(ids.map(identity)).size !== 8 || ids.some(function (id) { return !identity(id); })) {
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
    var totalRounds = Math.max(1, Math.min(7, Math.floor(Number(roundsCount) || 7)));
    return { rounds: rounds.slice(0, totalRounds).map(function (pairs, ri) {
      return layouts[best[ri]].map(function (duel) {
        return duel.map(function (pi) { return pairs[pi].map(function (i) { return ids[i]; }); });
      });
    }), roundsCount: totalRounds, opponentRepeatScore: bestScore, maxOpponents: bestMax };
  }
  function buildWithRepeats(ids, roundsCount, random) {
    if (!Array.isArray(ids) || ids.length !== 8 || new Set(ids.map(identity)).size !== 8 || ids.some(function (id) { return !identity(id); })) {
      throw new Error('O rodízio exige oito atletas distintos.');
    }
    if (!Number.isInteger(roundsCount) || roundsCount < 1 || roundsCount > 128) throw new Error('Quantidade de jogos por atleta inválida.');
    random = random || Math.random;
    var rounds = [];
    for (var round = 0; round < roundsCount; round++) {
      var order = ids.slice();
      for (var i = order.length - 1; i > 0; i--) {
        var j = Math.floor(random() * (i + 1));
        var player = order[i]; order[i] = order[j]; order[j] = player;
      }
      rounds.push([[order.slice(0, 2), order.slice(2, 4)], [order.slice(4, 6), order.slice(6, 8)]]);
    }
    return { rounds:rounds, roundsCount:roundsCount };
  }
  function rotationRoster(t) {
    var rows = [];
    Object.values(t.participants || {}).forEach(function (entry) {
      if (!entry || entry.ligaActive === false) return;
      var categories = entry.categories?.length ? entry.categories : entry.category ? [entry.category] : [];
      var players = entry.participants;
      if (!Array.isArray(players) || !players.length) {
        players = (entry.p1Uid || entry.p1ManualId || entry.p1Name) && (entry.p2Uid || entry.p2ManualId || entry.p2Name) ? [1,2].map(function (side) {
          return {uid:entry['p'+side+'Uid'] || null, manualParticipantId:entry['p'+side+'ManualId'] || null, displayName:entry['p'+side+'Name'] || entry['p'+side+'Uid']};
        }) : [entry];
      }
      players.forEach(function (member) {
        if (!member || member.ligaActive === false) return;
        var player = typeof member === 'string' ? {displayName:member} : Object.assign({}, member);
        player.displayName = player.displayName || player.name || player.uid || '';
        if (!player.categories?.length) player.categories = player.category ? [player.category] : categories;
        rows.push(player);
      });
    });
    return rows;
  }
  function categoryPopulation(t, category) {
    var actual = rotationRoster(t).filter(function (player) {
      return !category || player.categories[0] === category || !player.categories.length && t.combinedCategories?.length === 1;
    }).length;
    return actual || Number(t.maxParticipantsByCategory?.[category] || t.maxParticipantsPerCategory || 0);
  }
  function groupError(n, games, repeat) {
    if (!Number.isSafeInteger(games) || games < 1 || games > 128) return 'Escolha de 1 a 128 jogos por jogador.';
    if (n < 4) return 'Cada grupo precisa de pelo menos quatro pessoas.';
    if (!repeat && games >= n) return 'Um grupo de ' + n + ' pessoas oferece ' + (n - 1) + ' parceiros diferentes. Reduza os jogos ou permita repetir parceiro.';
    if (n * games % 4) return 'Com ' + n + ' pessoas e ' + games + ' jogos por jogador não se formam partidas completas de quatro pessoas.';
    return '';
  }
  function formationError(rule, people) {
    var formation = rule.groupFormation;
    if (!people) return formation.mode === 'size' && !rule.allowRepeatPartners && rule.rounds >= formation.value
      ? 'O tamanho escolhido oferece no máximo ' + (formation.value - 1) + ' parceiros diferentes.' : '';
    var count = formation.mode === 'count' ? formation.value : Math.ceil(people / formation.value);
    var low = Math.floor(people / count);
    return groupError(low, rule.rounds, rule.allowRepeatPartners) ||
      (people % count ? groupError(low+1, rule.rounds, rule.allowRepeatPartners) : '');
  }
  function buildGroups(players, games, repeat, random) {
    var n = players.length;
    var error = groupError(n, games, repeat);
    if (error) throw new Error(error);
    if (new Set(players.map(identity)).size !== n || players.some(function (p) { return !identity(p); })) throw new Error('Há identidades repetidas ou ausentes no grupo.');
    if (n === 8) return repeat ? buildWithRepeats(players, games, random) : build(players, games);
    if (n === 4 && games === 3 && !repeat) {
      var a = players[0], b = players[1], c = players[2], d = players[3];
      return { series:true, rounds:[[[[a,b],[c,d]], [[a,c],[b,d]], [[a,d],[b,c]]]] };
    }
    var rounds = [];
    if (n % 2) {
      var distances = (n - 1) / 2;
      // Cada aresta de Z/n tem um único centro. Cada distância dá grau 2.
      for (var center = 0; center < n; center++) {
        var pending = [], occupied = new Set();
        for (var k = 0; k < games / 2; k += 2) {
          var left = 1 + k % distances, right = 1 + (k + 1) % distances;
          var four = [center - left, center + left, center - right, center + right].map(function (v) { return (v + n) % n; });
          if (four.some(function (v) { return occupied.has(v); })) { rounds.push(pending); pending = []; occupied.clear(); }
          four.forEach(function (v) { occupied.add(v); });
          pending.push([[players[four[0]],players[four[1]]],[players[four[2]],players[four[3]]]]);
        }
        if (pending.length) rounds.push(pending);
      }
    } else {
      var ring = players.slice();
      function matching() {
        var edges = [];
        for (var i = 0; i < n / 2; i++) edges.push([ring[i], ring[n-1-i]]);
        ring.splice(1, 0, ring.pop());
        return edges;
      }
      function play(edges) {
        var round = [];
        for (var i = 0; i < edges.length; i += 2) round.push([edges[i],edges[i + 1]]);
        if (round.length) rounds.push(round);
      }
      for (var g = 0; g < games;) {
        var edges = matching(); g++;
        if (n % 4 === 0) { play(edges); continue; }
        var next = matching(); g++;
        var first = edges.pop();
        var at = next.findIndex(function (edge) { return !edge.some(function (v) { return first.includes(v); }); });
        var second = next.splice(at, 1)[0];
        play(edges); play(next); rounds.push([[first,second]]);
      }
    }
    return { rounds:rounds };
  }
  function gamesRate(row) {
    var won=Number(row && row.gamesWon),lost=Number(row && row.gamesLost);
    if(!Number.isFinite(won) || won<0) won=0;
    if(!Number.isFinite(lost) || lost<0) lost=0;
    return won+lost>0?won/(won+lost):0;
  }
  var api = { gamesRate:gamesRate, rotationRoster:rotationRoster, categoryPopulation:categoryPopulation, build:build, buildWithRepeats:buildWithRepeats, groupError:groupError, formationError:formationError, buildGroups:buildGroups };
  root.ScoreplaceSuperEight = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
