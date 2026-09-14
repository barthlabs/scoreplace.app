/*
 * Ponte de compatibilidade para o contrato tipado de classificação.
 *
 * A regra de desempate não fica mais duplicada neste adaptador: a fonte única é
 * src/domain/standings.ts, compilada para js/domain/standings.js. O arquivo preserva
 * os nomes globais e CommonJS que navegador, motor de sorteio e testes já consomem.
 */
(function () {
  'use strict';

  function domain() {
    if (typeof window !== 'undefined' && window.ScoreplaceStandings) return window.ScoreplaceStandings;
    if (typeof require === 'function') {
      try { return require('../domain/standings.js'); } catch (e) {}
      try { return require('./standings.js'); } catch (e2) {}
    }
    return null;
  }
  function contract() {
    var value = domain();
    if (!value) throw new Error('[classificação] domínio tipado não carregado');
    return value;
  }
  function winnerSide(match) {
    var reader = (typeof window !== 'undefined' && typeof window._matchWinnerSide === 'function')
      ? window._matchWinnerSide : null;
    if (!reader && typeof require === 'function') {
      try { reader = require('./bracket-model.js').matchWinnerSide; } catch (e) { reader = null; }
    }
    if (!reader) throw new Error('[quem venceu] bracket-model.js nao carregado — a regra unica sumiu');
    return reader(match);
  }
  function readTiebreak(set) {
    var reader = (typeof window !== 'undefined' && typeof window._setTiebreak === 'function') ? window._setTiebreak : null;
    return reader ? reader(set) : null;
  }

  function standingsCompare(a, b, adv) { return contract().standingsCompare(a, b, adv); }
  function standingsCompareConfig(a, b, opts) { return contract().standingsCompareConfig(a, b, opts || {}); }
  function buildH2H(matches, slotKeys) { return contract().buildH2H(matches, slotKeys, winnerSide); }
  function buildOrdemChave(matches, slotKeys) { return contract().buildOrdemChave(matches, slotKeys); }
  function explainTiebreakers(lines, opts) { return contract().explainTiebreakers(lines, opts || {}); }
  function tiebreakPointsOfMatch(match) { return contract().tiebreakPointsOfMatch(match, readTiebreak); }
  var CRITERIOS = contract().CRITERIOS;

  if (typeof window !== 'undefined') {
    window._standingsCompare = standingsCompare;
    window._standingsCompareConfig = standingsCompareConfig;
    window._standingsBuildH2H = buildH2H;
    window._standingsOrdemChave = buildOrdemChave;
    window._standingsExplain = explainTiebreakers;
    window._standingsTbPoints = tiebreakPointsOfMatch;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      standingsCompare: standingsCompare,
      standingsCompareConfig: standingsCompareConfig,
      buildH2H: buildH2H,
      buildOrdemChave: buildOrdemChave,
      explainTiebreakers: explainTiebreakers,
      tiebreakPointsOfMatch: tiebreakPointsOfMatch,
      CRITERIOS: CRITERIOS
    };
  }
})();
