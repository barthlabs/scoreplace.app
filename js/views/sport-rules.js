/* ════════════════════════════════════════════════════════════════════════════
 * FONTE ÚNICA DAS REGRAS DAS MODALIDADES — window.SPORT_RULES
 *
 * Mudou (ou estava errada) a regra de uma modalidade? Mude AQUI, num lugar só, e
 * propaga pra TODO o app: defaults de TORNEIO (_sportScoringDefaults, create-tournament.js),
 * defaults de CASUAL (_casualDefaults, bracket-ui.js), derivação de vantagem
 * (_gsmGetAdvantageForSport) e tamanho de time (_sportTeamDefaults).
 *
 * Cada conceito é SEPARADO (não confundir):
 *   • advantageRule (deuce/AD): vantagem no GAME a 40-40 — regra de TÊNIS (só ele).
 *   • twoPointAdvantage: ganhar o SET por 2 (nos pontos/games) — vale pra todas as raquetes/redes.
 *   • tiebreakMargin: ganhar o TIEBREAK por 2.
 *   • tieRule (casual): o que fazer no empate de games — 'tiebreak' | 'extend'(prorroga) | 'ask'.
 *   • countingType: 'tennis' (15-30-40) | 'numeric' (1-2-3, rally).
 *
 * Fontes (jun/2026): ITF (Tênis/Beach Tennis), USAP (Pickleball), ITTF (Tênis de Mesa),
 * FIP/Premier Padel (Padel — golden point), FIVB (Vôlei de Praia), FIFV (Futevôlei).
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  var RULES = {
    // teamSize = jogadores por lado (default). Tênis/Tênis de Mesa = individual; resto = dupla.
    // Beach Tennis: TORNEIO = tiebreak no 6-6 (ITF oficial). CASUAL = flexível ('ask'): set único,
    // no 5-5 costuma-se PRORROGAR (vai a 7/8/9… com 2 de vantagem) ou ir pro tiebreak — decidido no
    // jogo conforme espera de quadra/disposição. Por isso `casualOverride` (só vale na projeção casual).
    'Beach Tennis':  { teamSize: 2, type: 'sets', setsToWin: 1, gamesPerSet: 6,  countingType: 'tennis',  advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: true,  tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, tieRule: 'ask', casualOverride: { tiebreakEnabled: false } },
    'Pickleball':    { teamSize: 2, type: 'sets', setsToWin: 1, gamesPerSet: 11, countingType: 'numeric', advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, tieRule: 'extend' },
    'Tênis':         { teamSize: 1, type: 'sets', setsToWin: 2, gamesPerSet: 6,  countingType: 'tennis',  advantageRule: true,  twoPointAdvantage: true, tiebreakEnabled: true,  tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true,  superTiebreakPoints: 10, tieRule: 'tiebreak' },
    'Tênis de Mesa': { teamSize: 1, type: 'sets', setsToWin: 3, gamesPerSet: 11, countingType: 'numeric', advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, tieRule: 'extend' },
    'Padel':         { teamSize: 2, type: 'sets', setsToWin: 2, gamesPerSet: 6,  countingType: 'tennis',  advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: true,  tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true,  superTiebreakPoints: 10, tieRule: 'tiebreak' }, // golden point (no-ad)
    'Vôlei de Praia':{ teamSize: 2, type: 'sets', setsToWin: 2, gamesPerSet: 21, countingType: 'numeric', advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true,  superTiebreakPoints: 15, tieRule: 'extend' }, // 3º set a 15
    'Futevôlei':     { teamSize: 2, type: 'sets', setsToWin: 2, gamesPerSet: 18, countingType: 'numeric', advantageRule: false, twoPointAdvantage: true, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: true,  superTiebreakPoints: 15, tieRule: 'extend' }  // 3º set a 15
  };

  // Fallback p/ modalidade desconhecida (placar livre simples) — espelha o legado.
  var DEFAULT_TOURNAMENT = { type: 'simple', setsToWin: 1, gamesPerSet: 1, tiebreakEnabled: false, tiebreakPoints: 7, tiebreakMargin: 2, superTiebreak: false, superTiebreakPoints: 10, countingType: 'numeric', advantageRule: false };

  window.SPORT_RULES = RULES;
  window.SPORT_LIST = Object.keys(RULES);

  // ── Projeções (cada consumidor pega o formato que precisa) ──────────────────
  // Forma TORNEIO (create-tournament.js _sportScoringDefaults): usa advantageRule.
  function tournamentShape(r) {
    return {
      type: r.type, setsToWin: r.setsToWin, gamesPerSet: r.gamesPerSet,
      tiebreakEnabled: r.tiebreakEnabled, tiebreakPoints: r.tiebreakPoints, tiebreakMargin: r.tiebreakMargin,
      superTiebreak: r.superTiebreak, superTiebreakPoints: r.superTiebreakPoints,
      countingType: r.countingType, advantageRule: r.advantageRule
    };
  }
  // Forma CASUAL (bracket-ui.js _casualDefaults): advantageRule vira deuceRule + tieRule + twoPointAdvantage.
  // `casualOverride` permite divergência LEGÍTIMA casual≠torneio por modalidade (ex.: Beach Tennis
  // tiebreakEnabled:false no casual). Só campos de comportamento de empate; scoring permanece o mesmo.
  function casualShape(r) {
    var s = {
      type: r.type, setsToWin: r.setsToWin, gamesPerSet: r.gamesPerSet,
      tiebreakEnabled: r.tiebreakEnabled, tiebreakPoints: r.tiebreakPoints, tiebreakMargin: r.tiebreakMargin,
      superTiebreak: r.superTiebreak, superTiebreakPoints: r.superTiebreakPoints,
      countingType: r.countingType, deuceRule: r.advantageRule, twoPointAdvantage: r.twoPointAdvantage, tieRule: r.tieRule
    };
    if (r.casualOverride) { for (var k in r.casualOverride) { if (Object.prototype.hasOwnProperty.call(r.casualOverride, k)) s[k] = r.casualOverride[k]; } }
    return s;
  }

  // Mapa { sport: formaTorneio } + '_default' — consumido por create-tournament.js.
  window._sportScoringDefaultsMap = function () {
    var out = {};
    Object.keys(RULES).forEach(function (s) { out[s] = tournamentShape(RULES[s]); });
    out['_default'] = DEFAULT_TOURNAMENT;
    return out;
  };
  // Mapa { sport: formaCasual } — consumido por bracket-ui.js.
  window._casualScoringDefaultsMap = function () {
    var out = {};
    Object.keys(RULES).forEach(function (s) { out[s] = casualShape(RULES[s]); });
    return out;
  };

  // Helpers diretos (derivação canônica).
  window._sportHasAdvantage = function (sport) { return !!(RULES[sport] && RULES[sport].advantageRule); };
  window._sportTeamSize = function (sport) { return (RULES[sport] && RULES[sport].teamSize) || 2; };
  window._sportTeamDefaultsMap = function () {
    var out = {}; Object.keys(RULES).forEach(function (s) { out[s] = RULES[s].teamSize; }); return out;
  };
  // Compat com a derivação de vantagem (create-tournament.js): mapas derivados da fonte única.
  window._gsmAdvantageDefaultMap = function () {
    var out = {}; Object.keys(RULES).forEach(function (s) { if (RULES[s].advantageRule) out[s] = true; }); return out;
  };
  window._gsmNoAdLockedMap = function () {
    var out = {}; Object.keys(RULES).forEach(function (s) { if (!RULES[s].advantageRule) out[s] = true; }); return out;
  };
})();
