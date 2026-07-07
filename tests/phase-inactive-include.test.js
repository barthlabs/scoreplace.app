/* Inativos incluídos na transição de fase (v4.4.109) — dirige o MOTOR REAL
 * (buildPhaseBrackets). Regra: quando phaseCfg._includeInactive tem gente, eles formam
 * duplas entre si e entram no FIM da linha de BAIXO (pior semeadas). node tests/phase-inactive-include.test.js
 *
 * Cenário: 2 grupos Rei/Rainha de 4 → Ouro (upper) {1º,2º de cada grupo} + Prata (lower)
 * {3º,4º}. Sem inativos: Ouro=2 duplas, Prata=2 duplas. Com 4 inativos incluídos: Prata=4.
 */
var E = require('../js/views/phases-engine.js');

var pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// 2 grupos de 4 jogadores (individuais). computeStandings devolve os players na ordem dada
// (já "classificados" 1º..4º) — o motor forma {1,2}→upper, {3,4}→lower por grupo (performance).
function grp(letter, names) {
  return { name: 'Grupo ' + letter, groupIdx: names._gi || 0, players: names.map(function (n) { return { name: n, displayName: n }; }) };
}
function mkGroups() {
  return [
    { name: 'Grupo A', groupIdx: 0, players: ['A1', 'A2', 'A3', 'A4'].map(function (n) { return { name: n, displayName: n }; }) },
    { name: 'Grupo B', groupIdx: 1, players: ['B1', 'B2', 'B3', 'B4'].map(function (n) { return { name: n, displayName: n }; }) }
  ];
}
function cs(g) { return (g.players || []).map(function (p) { return { name: p.name, displayName: p.displayName }; }); }

function phaseCfg(extra) {
  return Object.assign({
    name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples',
    fixedPairs: true, pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: true, thirdPlace: false,
    source: { scope: 'per_group', rankingBasis: 'individual', mapping: [{ dest: 'upper', label: 'Ouro' }, { dest: 'lower', label: 'Prata' }] }
  }, extra || {});
}

// nomes de duplas presentes nos matches de uma dada linha (tierLabel).
function entrantsInLine(res, lineLabel) {
  var names = {};
  (res.matches || []).forEach(function (m) {
    if (m.tierLabel !== lineLabel) return;
    [m.p1, m.p2].forEach(function (nm) { if (nm && nm !== 'TBD' && nm !== 'BYE') names[nm] = 1; });
  });
  return Object.keys(names);
}

// ── 1. SEM inativos: Ouro e Prata com 2 duplas cada ──
(function () {
  var res = E.buildPhaseBrackets(mkGroups(), phaseCfg(), cs, 'ph1');
  var ouro = entrantsInLine(res, 'Ouro');
  var prata = entrantsInLine(res, 'Prata');
  ok(ouro.length === 2, 'sem inativos: Ouro tem 2 duplas [' + ouro.length + ': ' + ouro.join(', ') + ']');
  ok(prata.length === 2, 'sem inativos: Prata tem 2 duplas [' + prata.length + ': ' + prata.join(', ') + ']');
  // {1º,2º} juntos em cima, {3º,4º} embaixo (por grupo)
  ok(ouro.indexOf('A1 / A2') !== -1 && ouro.indexOf('B1 / B2') !== -1, 'Ouro = {1º,2º} de cada grupo');
  ok(prata.indexOf('A3 / A4') !== -1 && prata.indexOf('B3 / B4') !== -1, 'Prata = {3º,4º} de cada grupo');
  // nenhum inativo aparece
  ok(ouro.concat(prata).join('|').indexOf('INAT') === -1, 'sem inativos: nenhum nome de inativo nos jogos');
})();

// ── 2. COM 4 inativos incluídos: Prata cresce pra 4 duplas (2 originais + 2 de inativos) ──
(function () {
  var inativos = [
    { displayName: 'INAT1', name: 'INAT1', ligaActive: false },
    { displayName: 'INAT2', name: 'INAT2', ligaActive: false },
    { displayName: 'INAT3', name: 'INAT3', ligaActive: false },
    { displayName: 'INAT4', name: 'INAT4', ligaActive: false }
  ];
  var res = E.buildPhaseBrackets(mkGroups(), phaseCfg({ _includeInactive: inativos }), cs, 'ph2');
  var ouro = entrantsInLine(res, 'Ouro');
  var prata = entrantsInLine(res, 'Prata');
  ok(ouro.length === 2, 'com inativos: Ouro segue com 2 duplas (inalterado) [' + ouro.length + ']');
  ok(prata.length === 4, 'com inativos: Prata cresce pra 4 duplas [' + prata.length + ': ' + prata.join(', ') + ']');
  // inativos formam duplas entre si e estão em Prata (linha de baixo)
  var prataStr = prata.join('|');
  ok(prataStr.indexOf('INAT1 / INAT2') !== -1, 'inativos pareados: INAT1 / INAT2 em Prata');
  ok(prataStr.indexOf('INAT3 / INAT4') !== -1, 'inativos pareados: INAT3 / INAT4 em Prata');
  // NUNCA em Ouro
  ok(ouro.join('|').indexOf('INAT') === -1, 'inativos NÃO entram em Ouro (só na linha de baixo)');
})();

// ── 3. número ÍMPAR de inativos (3) → 1 dupla + 1 individual, ainda na linha de baixo ──
(function () {
  var inativos = [
    { displayName: 'X1', name: 'X1', ligaActive: false },
    { displayName: 'X2', name: 'X2', ligaActive: false },
    { displayName: 'X3', name: 'X3', ligaActive: false }
  ];
  var res = E.buildPhaseBrackets(mkGroups(), phaseCfg({ _includeInactive: inativos }), cs, 'ph3');
  var prata = entrantsInLine(res, 'Prata');
  var prataStr = prata.join('|');
  ok(prataStr.indexOf('X1 / X2') !== -1, '3 inativos: X1 / X2 formam dupla');
  ok(prataStr.indexOf('X3') !== -1, '3 inativos: X3 entra (sozinho) na linha de baixo');
})();

// ── 4. ESCOPO GERAL: inativo COM pontos sobe pra linha de CIMA; inativo 0 pts fica embaixo ──
// Regra do dono: colocação POR CLASSIFICAÇÃO, nunca hardcoded na linha de baixo. Num
// formato de classificação geral (multi-rodada), um inativo que somou pontos antes de
// desativar pode ter classificação suficiente pra Ouro.
(function () {
  // Classificação global (por nome). HERO é inativo mas somou 3 (jogou antes de desativar);
  // ZERO é inativo sem pontos. Ativos: P1..P6.
  var SCORE = { P1: 5, P2: 4, HERO: 3, P3: 2, P4: 1, P5: 0, P6: 0, ZERO: 0 };
  function csOverall(g) {
    return (g.players || []).map(function (p) {
      var n = (typeof p === 'string') ? p : (p.name || p.displayName);
      return { name: n, displayName: n, wins: SCORE[n] || 0, setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 };
    }).sort(function (a, b) { return (b.wins || 0) - (a.wins || 0); });
  }
  var groups = [{ name: 'Geral', groupIdx: 0, players: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(function (n) { return { name: n, displayName: n }; }) }];
  var cfgOverall = {
    name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples',
    fixedPairs: false, pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: true, thirdPlace: false,
    source: { scope: 'overall', rankingBasis: 'individual', mapping: [{ dest: 'upper', label: 'Ouro' }, { dest: 'lower', label: 'Prata' }] },
    _includeInactive: [
      { displayName: 'HERO', name: 'HERO', ligaActive: false },
      { displayName: 'ZERO', name: 'ZERO', ligaActive: false }
    ]
  };
  var res = E.buildPhaseBrackets(groups, cfgOverall, csOverall, 'ovr');
  var ouro = entrantsInLine(res, 'Ouro');
  var prata = entrantsInLine(res, 'Prata');
  // ranking: P1(5) P2(4) HERO(3) P3(2) | P4(1) P5(0) P6(0) ZERO(0) → 4 em cima, 4 embaixo
  ok(ouro.indexOf('HERO') !== -1, 'GERAL: inativo COM pontos (HERO) sobe pra Ouro [ouro=' + ouro.join(',') + ']');
  ok(ouro.indexOf('ZERO') === -1 && prata.indexOf('ZERO') !== -1, 'GERAL: inativo 0 pts (ZERO) fica na Prata [prata=' + prata.join(',') + ']');
  // não é hardcoded: HERO NÃO está na linha de baixo
  ok(prata.indexOf('HERO') === -1, 'GERAL: HERO NÃO foi jogado direto na linha de baixo (fim do hardcoded)');
})();

// ── 5. ESCOPO GERAL single-round: inativo 0 pts cai embaixo (por classificação, não regra) ──
(function () {
  function cs0(g) {
    return (g.players || []).map(function (p) {
      var n = (typeof p === 'string') ? p : (p.name || p.displayName);
      // ativos com 1 win; inativo (Z) com 0 → último
      return { name: n, displayName: n, wins: (n === 'Z' ? 0 : 1), setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, pointsFor: 0, pointsAgainst: 0 };
    }).sort(function (a, b) { return (b.wins || 0) - (a.wins || 0); });
  }
  var groups = [{ name: 'Geral', groupIdx: 0, players: ['Q1', 'Q2', 'Q3'].map(function (n) { return { name: n, displayName: n }; }) }];
  var cfg = {
    name: 'Eliminatória', fixedPairs: false, pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: true, thirdPlace: false,
    source: { scope: 'overall', rankingBasis: 'individual', mapping: [{ dest: 'upper', label: 'Ouro' }, { dest: 'lower', label: 'Prata' }] },
    _includeInactive: [{ displayName: 'Z', name: 'Z', ligaActive: false }]
  };
  var res = E.buildPhaseBrackets(groups, cfg, cs0, 'sr');
  var prata = entrantsInLine(res, 'Prata');
  ok(prata.indexOf('Z') !== -1, 'GERAL single-round: inativo 0 pts (Z) cai na Prata por classificação [prata=' + prata.join(',') + ']');
})();

console.log((fail === 0 ? '✅' : '❌') + ' phase-inactive-include: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
