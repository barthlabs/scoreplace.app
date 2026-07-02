/* phase-generators.js — Motor de Fases CANÔNICO (camada única)
 *
 * VISÃO (dono, 25-jun-2026): um torneio é uma PILHA de fases (t.phases[], 1..N).
 * CADA fase roda com O MESMO motor, num de 3 FORMATOS canônicos:
 *   'elim'   — Eliminatória (Simples/Dupla)
 *   'groups' — Fase de Grupos (round-robin)  [Rei/Rainha = groups + cfg.reiRainha]
 *   'league' — Pontos Corridos / Liga (e Suíço)
 * Entre fases há uma TRANSIÇÃO simples (quem classifica + como entra na próxima).
 * Fase única = pilha de 1 (NÃO é caso especial). Modo de sorteio (simples/rei-rainha/
 * dupla-formada), categorias, GSM e pontos avançados são módulos ORTOGONAIS que se
 * aplicam a qualquer fase/formato.
 *
 * Este módulo concentra a LÓGICA PURA, pool-based (não escreve em `t`, não vai pro
 * vendor do autoDraw). NÃO substitui o engessamento de uma vez — está sendo
 * introduzido em increments (ver plano). NESTE primeiro increment (andaime) os
 * geradores DELEGAM nos buildPhase* existentes de phases-engine.js — ZERO mudança
 * de comportamento; ninguém chama este módulo ainda. As funções novas e puras
 * (classifyPhaseFormat / normalizePhases / selectQualifiers) já são as canônicas.
 */
(function () {
  'use strict';

  // Motor base (browser: window._phasesEngine; node: require).
  var E = (typeof window !== 'undefined' && window._phasesEngine)
    ? window._phasesEngine
    : (typeof require !== 'undefined' ? require('./phases-engine.js') : null);

  // ── classifyPhaseFormat / isMonarchDraw — FONTE ÚNICA no phases-engine ──────
  // (Definidas no motor base; aqui só reexportadas pra não duplicar lógica.)
  // Rei/Rainha NÃO é um 4º formato: é modo de sorteio, ortogonal ao formato.
  var classifyPhaseFormat = (E && E.classifyPhaseFormat) || function (cfg) {
    if (!cfg) return 'elim';
    var f = String(cfg.format || cfg.formatCode || '').toLowerCase();
    if (cfg.formatCode === 'grupos_mata' || /grupo/.test(f)) return 'groups';
    if (cfg.formatCode === 'liga' || /\bliga\b|pontos corridos|ranking|su[ií]ç?o|swiss/.test(f)) return 'league';
    return 'elim';
  };
  var isMonarchDraw = (E && E.isMonarchDraw) || function (cfg) {
    return !!(cfg && (cfg.reiRainha === true || cfg.drawMode === 'rei_rainha' || /rei|rainha|monarch/i.test(String(cfg.format || cfg.formatCode || ''))));
  };

  // ── normalizePhases — t.phases uniforme em RUNTIME (nunca persiste) ─────────
  // cfg0 = t.phases[0] se existir; senão sintetizado dos campos top-level
  // (fase única = pilha de 1). Única porta de cfg pro motor: ninguém deve ler
  // t.format cru depois disto. Idempotente e puro → seguro nos torneios live.
  function _codeFromFormat(fmt) {
    var f = String(fmt || '').toLowerCase();
    if (/grupo/.test(f)) return 'grupos_mata';
    if (/\bliga\b|ranking|pontos corridos|su[ií]ç?o/.test(f)) return 'liga';
    if (/dupla/.test(f)) return 'elim_dupla';
    return 'elim_simples';
  }
  function synthCfg0(t) {
    var isRei = (t.drawMode === 'rei_rainha' || t.ligaRoundFormat === 'rei_rainha');
    return {
      name: (t.phase1Name || (Array.isArray(t.phases) && t.phases[0] && t.phases[0].name)) || 'Fase 1',
      format: t.format,
      formatCode: _codeFromFormat(t.format),
      drawMode: t.drawMode || (isRei ? 'rei_rainha' : 'sorteio'),
      reiRainha: isRei,
      rounds: (Array.isArray(t.rounds) ? t.rounds.length : 0) || 1,
      scoring: t.scoring || null,
      advancedScoring: t.advancedScoring || null,
      source: { type: 'enrollment' }
    };
  }
  function normalizePhases(t) {
    if (!t) return [];
    if (Array.isArray(t.phases) && t.phases.length) {
      return t.phases.map(function (p) { return p || {}; });
    }
    return [synthCfg0(t)];
  }

  // ── selectQualifiers — a TRANSIÇÃO (quem classifica + como entra) ───────────
  // FONTE ÚNICA no phases-engine; aqui só reexportada (fallback se ausente).
  var selectQualifiers = (E && E.selectQualifiers) || function (prevGroups, cfg, ctx) {
    ctx = ctx || {};
    var src = (cfg && cfg.source) || {};
    var mapping = (src.mapping && src.mapping.length) ? src.mapping : [{ dest: 'main', rankFrom: 1, rankTo: 999 }];
    var fixedPairs = cfg ? (cfg.fixedPairs !== false) : true;
    var pairingStrategy = (cfg && cfg.pairingStrategy) || 'top';
    return E.buildEntrantsByDest(prevGroups, mapping, fixedPairs, ctx.computeStandings, pairingStrategy,
      { scope: src.scope || 'per_group', rankingBasis: src.rankingBasis || 'individual' });
  };

  // ── Geradores por formato (ANDAIME: delegam nos buildPhase* existentes) ─────
  // Assinatura canônica-alvo: (prevGroups, cfg, ctx{computeStandings, idPrefix}).
  // Nos próximos increments os núcleos viram pool-based de verdade e os buildPhase*
  // passam a ser chamadores finos destes.
  function genElimPhase(prevGroups, cfg, ctx) {
    return E.buildPhaseBrackets(prevGroups, cfg, (ctx && ctx.computeStandings), (ctx && ctx.idPrefix));
  }
  function genGroupsPhase(prevGroups, cfg, ctx) {
    return E.buildPhaseGroupStage(prevGroups, cfg, (ctx && ctx.computeStandings), (ctx && ctx.idPrefix));
  }
  function genLeaguePhase(prevGroups, cfg, ctx) {
    return E.buildPhaseLeagueStage(prevGroups, cfg, (ctx && ctx.computeStandings), (ctx && ctx.idPrefix));
  }
  // Despacho único. O MODO DE SORTEIO Rei/Rainha (ortogonal ao formato) tem
  // precedência e roda SEMPRE no motor league INCREMENTAL (pool → rodadas geradas por
  // _phaseGenNextLeagueRound com ligaRoundFormat='rei_rainha'; fixedPairs=false pois o
  // parceiro é ROTATIVO — pool de PESSOAS). O gerador monarch de rodada única foi
  // removido (campanha project_kill_monarch_format_campaign). Senão, despacha pelo
  // formato canônico.
  function generatePhase(prevGroups, cfg, ctx) {
    if (isMonarchDraw(cfg)) {
      return genLeaguePhase(prevGroups, Object.assign({}, cfg, { fixedPairs: false, ligaCadence: 'incremental' }), ctx);
    }
    switch (classifyPhaseFormat(cfg)) {
      case 'groups': return genGroupsPhase(prevGroups, cfg, ctx);
      case 'league': return genLeaguePhase(prevGroups, cfg, ctx);
      default: return genElimPhase(prevGroups, cfg, ctx);
    }
  }

  var api = {
    classifyPhaseFormat: classifyPhaseFormat,
    isMonarchDraw: isMonarchDraw,
    normalizePhases: normalizePhases,
    synthCfg0: synthCfg0,
    selectQualifiers: selectQualifiers,
    genElimPhase: genElimPhase,
    genGroupsPhase: genGroupsPhase,
    genLeaguePhase: genLeaguePhase,
    generatePhase: generatePhase
  };
  if (typeof window !== 'undefined') window._phaseGen = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
