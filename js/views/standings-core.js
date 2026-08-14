/* standings-core.js — QUEM ESTÁ NA FRENTE (extraído do bracket-logic.js em ago/2026)
 *
 * ORDEM DO DONO (14/ago/2026): "sem rodar coisas diferentes para o que deveria ser uma coisa
 * só: fase classificatória."
 *
 * O QUE ERA: havia DUAS respostas pra mesma pergunta.
 *   • a TABELA que a pessoa vê (bracket-logic._computeMonarchStandings) — cadeia longa;
 *   • a ordem de QUEM SOBE pra eliminatória (phases-engine._globalStandings) — cadeia CURTA,
 *     que parava em saldo de pontos e, empatando ali, devolvia 0: mantinha a ordem em que os
 *     grupos foram varridos.
 * MEDIDO no sandbox do Confra com a R1 completa: 132 classificados e **80 posições** em que
 * as duas ordens discordavam. Naquele placar a 1ª divergência caía na 40ª posição — o corte
 * do Confra não teria mudado —, mas isso é sorte do dado. A tabela dizer uma ordem e a chave
 * usar outra não se defende.
 *
 * POR QUE VIVE NUM ARQUIVO PRÓPRIO — mesma razão do waitlist-core.js e do identity-core.js.
 * A primeira versão deixou a regra no bracket-logic.js e o phases-engine a lia por
 * `window._standingsCompare`. No navegador e no vendor da CF (`g.window = g`) isso funciona,
 * mas o bracket-logic.js NÃO é `require`-ável em Node — então, em qualquer contexto que
 * carregue só o phases-engine, a chamada caía num fallback e a ordenação sumia EM SILÊNCIO.
 * Dois testes existentes acusaram na hora. Regra que decide classificação não pode depender
 * de quem carregou o quê: aqui ela é `require`-ável em Node e global no browser.
 *
 * ⚠️ ISTO NÃO É A REGRA DE DESEMPATE CONFIGURÁVEL. Fase de Grupos usa os critérios que o
 * ORGANIZADOR escolhe (confronto direto, buchholz, sonneborn-berger…), em
 * phases-engine._groupTeamStandings — e isso é feature, não divergência. O que mora aqui é
 * a cadeia PADRÃO, usada quando não há critério configurado.
 */
(function () {
  'use strict';

  // `adv` = pontuação avançada ligada (aí `points` manda antes de tudo).
  // Tiebreakers (desc, salvo nota):
  // 0. PONTOS AVANÇADOS (quando ligado)  1. wins  2. saldo de sets  3. sets vencidos
  // 4. saldo de games  5. games vencidos  6. saldo de tie-breaks  7. tie-breaks vencidos
  // 8. saldo de pontos  9. pontos a favor  10. aproveitamento  11. jogos disputados (asc)
  function standingsCompare(a, b, adv) {
    var n = function (v) { return v || 0; };
    if (adv && n(b.points) !== n(a.points)) return n(b.points) - n(a.points);
    if (n(b.wins) !== n(a.wins)) return n(b.wins) - n(a.wins);
    var aSetD = n(a.setsWon) - n(a.setsLost), bSetD = n(b.setsWon) - n(b.setsLost);
    if (bSetD !== aSetD) return bSetD - aSetD;
    if (n(b.setsWon) !== n(a.setsWon)) return n(b.setsWon) - n(a.setsWon);
    var aGD = n(a.gamesWon) - n(a.gamesLost), bGD = n(b.gamesWon) - n(b.gamesLost);
    if (bGD !== aGD) return bGD - aGD;
    if (n(b.gamesWon) !== n(a.gamesWon)) return n(b.gamesWon) - n(a.gamesWon);
    var aTBD = n(a.tiebreaksWon) - n(a.tiebreaksLost), bTBD = n(b.tiebreaksWon) - n(b.tiebreaksLost);
    if (bTBD !== aTBD) return bTBD - aTBD;
    if (n(b.tiebreaksWon) !== n(a.tiebreaksWon)) return n(b.tiebreaksWon) - n(a.tiebreaksWon);
    var aDiff = n(a.pointsFor) - n(a.pointsAgainst), bDiff = n(b.pointsFor) - n(b.pointsAgainst);
    if (bDiff !== aDiff) return bDiff - aDiff;
    if (n(b.pointsFor) !== n(a.pointsFor)) return n(b.pointsFor) - n(a.pointsFor);
    if (n(b.winRate) !== n(a.winRate)) return n(b.winRate) - n(a.winRate);
    return n(a.played) - n(b.played);
  }

  // browser + vendor da CF (que faz `window = globalThis`)
  if (typeof window !== 'undefined') window._standingsCompare = standingsCompare;
  // Node (teste headless e qualquer módulo que carregue só o phases-engine)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { standingsCompare: standingsCompare };
  }
})();
