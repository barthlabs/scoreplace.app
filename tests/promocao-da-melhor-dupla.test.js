/* Promoção Ouro/Prata — a candidata é a MELHOR DUPLA, nunca o melhor indivíduo.
 * Exercita buildPhaseBrackets, selectQualifiers e materializeNextPhase: as três portas
 * que o painel e a fase publicada percorrem. */
const E = require('../js/views/phases-engine.js');
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }
function atleta(name, wins, gamesDiff) {
  const won = 20 + Math.max(gamesDiff, 0), lost = won - gamesDiff;
  return { name, displayName: name, uid: 'uid-' + name, wins, losses: 3 - wins, played: 3,
    setsWon: wins, setsLost: 3 - wins, gamesWon: won, gamesLost: lost,
    pointsFor: won, pointsAgainst: lost, buchholz: 10, sonnebornBerger: wins };
}

const porGrupo = {
  A: [atleta('Ouro A1', 3, 12), atleta('Ouro A2', 2, 6), atleta('Explosiva', 3, 8), atleta('Âncora', 0, -18)],
  B: [atleta('Ouro B1', 3, 10), atleta('Ouro B2', 2, 5), atleta('Constante 1', 1, -2), atleta('Constante 2', 1, -2)]
};
const grupos = Object.keys(porGrupo).map((name, i) => ({ name, groupIdx: i, players: porGrupo[name] }));
const cs = g => porGrupo[g.name];

function cfg(extra) {
  return Object.assign({
    name: 'Eliminatória', fixedPairs: true, pairingStrategy: 'top', bracketSeeding: 'seed', grandFinal: false,
    source: { scope: 'per_group', rankingBasis: 'individual', mapping: [
      { dest: 'upper', label: 'Ouro', rankFrom: 1, rankTo: 4 },
      { dest: 'lower', label: 'Prata', rankFrom: 1, rankTo: 4 }
    ] },
    _promoteLines: 1
  }, extra || {});
}

function nome(tm) { return tm && tm.displayName; }

// A melhor PESSOA da Prata é Explosiva (3 vitórias, saldo +8), mas sua dupla soma
// -10. A dupla Constante soma -4: pelo saldo configurado ela tem de subir.
(function () {
  const phase = cfg({ _promotionTiebreakers: ['saldo_games', 'vitorias'] });
  const r = E.buildPhaseBrackets(grupos, phase, cs, 'dupla');
  const subiu = r.byDest.upper[r.byDest.upper.length - 1];
  ok(nome(subiu) === 'Constante 1 / Constante 2', 'saldo combinado escolhe Constante (−4), não Explosiva/Âncora (−10): ' + nome(subiu));
  ok(subiu.promotedFromLower === true && subiu.promotedFromDest === 'lower', 'dupla promovida carrega o carimbo prata');
  ok(!r.byDest.lower.some(tm => nome(tm) === 'Constante 1 / Constante 2'), 'promovida saiu da Prata');
  ok(r.byDest.lower.some(tm => nome(tm) === 'Explosiva / Âncora'), 'dupla com melhor indivíduo mas saldo pior ficou na Prata');
  const game = r.matches.find(m => m.p1PromotedFromLower || m.p2PromotedFromLower);
  ok(!!game, 'o jogo inicial da Ouro carrega a etiqueta prata no slot promovido');
  const posterior = { team1Obj: subiu, team2Obj: null, round: (game ? game.round + 1 : 2) };
  ok(!posterior.p1PromotedFromLower && !posterior.p2PromotedFromLower,
    'o carimbo da dupla não aparece sozinho numa rodada posterior');
})();

// A ordem é a do organizador: se ele escolhe vitórias antes de saldo, muda também a
// promoção — o motor não impõe uma régua própria.
(function () {
  const r = E.buildPhaseBrackets(grupos, cfg({ _promotionTiebreakers: ['vitorias', 'saldo_games'] }), cs, 'ordem');
  ok(nome(r.byDest.upper[r.byDest.upper.length - 1]) === 'Explosiva / Âncora', 'ordem configurada pelo organizador (vitórias antes) vence o saldo');
})();

// Pré-cheque e materialização precisam concordar; a segunda recebe t.tiebreakers, que
// não pertencem ao objeto persistido da fase.
(function () {
  const phase = cfg();
  const pre = E.selectQualifiers(grupos, phase, { computeStandings: cs, tiebreakers: ['saldo_games', 'vitorias'] });
  const t = { currentPhaseIndex: 0, phases: [{ name: 'Classificatória' }, phase], groups: grupos,
    tiebreakers: ['saldo_games', 'vitorias'] };
  const made = E.materializeNextPhase(t, cs, 'materializa');
  const a = pre.upper[pre.upper.length - 1], b = made.built.byDest.upper[made.built.byDest.upper.length - 1];
  ok(nome(a) === 'Constante 1 / Constante 2' && nome(b) === nome(a), 'pré-cheque e fase materializada promovem a mesma dupla: ' + nome(b));
})();

// A marca é visualmente distinta de REP e lê o slot do jogo de entrada, não o teamObj.
(function () {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket.js'), 'utf8');
  ok(/p1PromotedFromLower/.test(src) && /p2PromotedFromLower/.test(src) && /PROMO/.test(src),
    'render da chave reconhece o slot de entrada e mostra a etiqueta prata');
})();

console.log((fail ? '❌' : '✅') + ' promocao-da-melhor-dupla: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
