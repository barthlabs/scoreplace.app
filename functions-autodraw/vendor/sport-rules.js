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

  // ══ DURAÇÃO DA PARTIDA — o valor configurado é POR SET ═══════════════════════
  // 25/ago/2026, o dono corrigindo a própria especificação: "é tempo por set e o
  // rei/rainha é 3x o tempo atual; eu disse lá atrás partida quando deveria ter
  // dito set". `gameDuration` SEMPRE significou minutos por SET — o app é que o
  // somava como se fosse a partida inteira, dando a set único e a melhor de 3 o
  // mesmo tempo. ⛔ Não derivar `gameDuration ÷ sets` para "não mexer nos torneios
  // que já existem": isso congelaria o número errado. O valor gravado já é por set.
  //
  // Mora AQUI, e não nos 9 lugares que calculam horário/previsão, porque formato
  // de partida tem fonte única e a regra é POR FASE.

  // Sets esperados de um "melhor de (2k−1)". Números do dono: 1 set → 1,0 ·
  // melhor de 3 → 2,5 · melhor de 5 → 4,5. Entre jogadores iguais a média teórica
  // do melhor de 5 é ~4,1; 4,5 é conservador de propósito — previsão que erra pra
  // menos faz o organizador estourar o horário da quadra.
  function setsEsperadosDe(setsToWin) {
    var k = parseInt(setsToWin, 10);
    if (!(k > 0)) return null;
    return k === 1 ? 1 : (2 * k - 1) - 0.5;
  }
  window._setsEsperadosDe = setsEsperadosDe;

  // ⛔🔴 REI/RAINHA NÃO É "3 SETS" AQUI — e essa é a pegadinha da regra inteira.
  // O dono pediu "Rei/Rainha = 3× o tempo atual", e ele está certo sobre o GRUPO:
  // um grupo de 4 ocupa a quadra por 3 sets. Mas o motor não guarda um jogo de 3
  // sets — ele guarda TRÊS JOGOS de 1 set (as três combinações de dupla).
  // MEDIDO no Confra ao vivo (25/ago/2026): 34 grupos × 3 jogos = os 112 jogos da
  // rodada, e todo jogo disputado tem `sets` de tamanho 1 (ex.: 3×6 em um set só).
  // Multiplicar a PARTIDA por 3 triplicaria um total que já está triplicado.
  // Por isso não existe caso especial: `setsToWin` (da fase, senão da modalidade)
  // responde certo pros dois — Rei/Rainha cai em 1 set porque É 1 set.
  window._setsEsperadosDaFase = function (t, fase) {
    t = t || {};
    var n = (fase && fase.scoring) ? setsEsperadosDe(fase.scoring.setsToWin) : null;
    if (n != null) return n;
    // Fase sem `scoring` — metade dos torneios da base. Cai na modalidade.
    return setsEsperadosDe(RULES[t.sport] && RULES[t.sport].setsToWin) || 1;
  };

  // Minutos de UMA partida da fase. Chamada e aquecimento são POR PARTIDA
  // (acontecem uma vez); só o tempo de jogo multiplica pelos sets.
  window._minutosDaPartida = function (t, fase) {
    t = t || {};
    return (parseInt(t.gameDuration, 10) || 30) * window._setsEsperadosDaFase(t, fase)
      + (parseInt(t.callTime, 10) || 0)
      + (parseInt(t.warmupTime, 10) || 0);
  };

  // A fase de índice i, ou `null` (torneio sem `phases` → a modalidade decide).
  window._faseDoTorneio = function (t, i) {
    var fs = (t && Array.isArray(t.phases)) ? t.phases : [];
    return fs[i || 0] || null;
  };
})();
