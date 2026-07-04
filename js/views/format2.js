// ─────────────────────────────────────────────────────────────────────────────
// format2.js — CONFIGURADOR ÚNICO de formato (reescrita v4.4.x)
//
// Substitui o "motor de empilhamento de N fases" por UM modelo configurável:
// round-robin com slider "nº de grupos" (1 = Pontos Corridos, classif. GERAL;
// N = Fase de Grupos, classif. POR GRUPO) + eliminatória opcional.
//
// DUAS camadas:
//  1) CONFIG (schema + gating)  — window.FORMAT2.normalize/defaultConfig/summary
//  2) COMPILADOR                — window.FORMAT2.compileToPhases(cfg) → {topLevel, phases}
//     Emite os MESMOS campos que o motor de sorteio atual já consome (top-level t.*
//     que dirigem o stage-0 via _buildPhase0Cfg + phases[] espelho/transição). NÃO
//     reimplementa sorteio: reusa buildPhaseGroupStage/buildPhaseLeagueStage/
//     genTierBracket/_computeStandings/sit-out/clusters/GSM/W.O. (tudo testado).
//
// CONTRATO-CHAVE (verificado no motor):
//  • Dupla FIXA  → Fase de Grupos (formatCode 'grupos_mata'), gruposCount=nº grupos
//    (inclusive 1). Liga PROÍBE duplas formadas.
//  • Rei/Rainha  → Liga 'rei_rainha' (grupos de 4 rotativos, individual).
//  • Sorteio/rodada → Liga 'standard' clusterizado (parceiro+adversário/rodada, individual).
//  • Singles: 'todos' → Fase de Grupos; 'fixo N rodadas' → Liga standard.
//  • Elim: origem 'formar' (indivíduos → duplas: performance/equilíbrio/sorteio) via
//    fixedPairs:true+pairingStrategy; 'já formadas' → carrega (fixedPairs:false).
//
// Isolado — não fiado no fluxo ainda.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  function allowsSingles(sport) {
    var R = window.SPORT_RULES || {};
    var r = R[sport];
    return !!(r && r.teamSize === 1);
  }
  function teamSizeFor(disputa) { return disputa === 'dupla' ? 2 : 1; }

  function defaultConfig(sport) {
    var dispDefault = allowsSingles(sport) ? 'individual' : 'dupla';
    return normalize({
      disputa: dispDefault,
      grupos: 1,
      parceria: 'fixa',
      formacaoDupla: 'sorteio',
      rodadas: { modo: 'todos', turnos: 'ida', n: 5 },
      classificados: 2,          // X que classificam (por grupo se N grupos; total se 1 grupo)
      eliminatoria: {
        ativa: false,
        linhas: 1,
        nomes: [''],
        origem: 'ja_formadas',
        formacao: 'performance',
        terceiro: true
      }
    }, sport);
  }

  function normalize(cfg, sport) {
    cfg = cfg || {};
    var out = JSON.parse(JSON.stringify(cfg));

    if (out.disputa !== 'individual' && out.disputa !== 'dupla') out.disputa = 'dupla';
    if (out.disputa === 'individual' && sport && !allowsSingles(sport)) out.disputa = 'dupla';
    var isDupla = out.disputa === 'dupla';

    out.grupos = Math.max(1, parseInt(out.grupos, 10) || 1);
    var umGrupo = out.grupos === 1;

    if (!isDupla) {
      out.parceria = null;
    } else {
      if (['fixa', 'rei_rainha', 'sorteio_rodada'].indexOf(out.parceria) === -1) out.parceria = 'fixa';
      if (!umGrupo && out.parceria !== 'fixa') out.parceria = 'fixa'; // 2+ grupos ⇒ só dupla fixa
    }
    if (out.formacaoDupla !== 'manual' && out.formacaoDupla !== 'sorteio') out.formacaoDupla = 'sorteio';

    // Pontuação individual quando singles OU parceria rotativa.
    out._scoreBy = (!isDupla || out.parceria === 'rei_rainha' || out.parceria === 'sorteio_rodada')
      ? 'individual' : 'dupla';

    // Rodadas. Rotativo (RR/sorteio_rodada) = por-rodada (Liga limitada, sem turnos).
    // Dupla fixa = round-robin ('todos'). Singles = 'todos' (round-robin) ou 'fixo' (Liga limitada).
    // IDA-E-VOLTA só em TABELA ÚNICA (grupos=1), todos-contra-todos (dupla fixa ou singles).
    out.rodadas = out.rodadas || {};
    var rotativo = isDupla && (out.parceria === 'rei_rainha' || out.parceria === 'sorteio_rodada');
    if (rotativo) {
      out.rodadas.modo = 'fixo'; out.rodadas.turnos = 'ida';
    } else if (isDupla) {
      out.rodadas.modo = 'todos'; // dupla fixa = round-robin
      out.rodadas.turnos = (umGrupo && out.rodadas.turnos === 'ida_volta') ? 'ida_volta' : 'ida';
    } else { // singles
      if (!umGrupo) out.rodadas.modo = 'todos';
      else if (out.rodadas.modo !== 'todos' && out.rodadas.modo !== 'fixo') out.rodadas.modo = 'todos';
      out.rodadas.turnos = (umGrupo && out.rodadas.modo === 'todos' && out.rodadas.turnos === 'ida_volta') ? 'ida_volta' : 'ida';
    }
    out.rodadas.n = Math.max(1, parseInt(out.rodadas.n, 10) || 1);

    out.classificados = Math.max(1, parseInt(out.classificados, 10) || 2);

    var e = out.eliminatoria || {};
    e.ativa = !umGrupo ? true : !!e.ativa; // grupos ⇒ elim forçada
    if ([1, 2, 4].indexOf(e.linhas) === -1) e.linhas = 1;
    if (!Array.isArray(e.nomes)) e.nomes = [];
    while (e.nomes.length < e.linhas) e.nomes.push('');
    e.nomes = e.nomes.slice(0, e.linhas);
    if (e.origem !== 'ja_formadas' && e.origem !== 'formar') e.origem = 'ja_formadas';
    // "formar" só quando ENTRAM INDIVÍDUOS (pontuação individual).
    if (out._scoreBy !== 'individual') e.origem = 'ja_formadas';
    if (['performance', 'equilibrio', 'sorteio'].indexOf(e.formacao) === -1) e.formacao = 'performance';
    e.terceiro = e.terceiro !== false;
    out.eliminatoria = e;

    return out;
  }

  function summary(cfg) {
    var parts = [];
    parts.push(cfg.disputa === 'individual' ? 'Individual' : 'Duplas');
    parts.push(cfg.grupos === 1 ? 'Pontos Corridos' : (cfg.grupos + ' grupos'));
    if (cfg.disputa === 'dupla' && cfg.grupos === 1) {
      parts.push({ fixa: 'dupla fixa', rei_rainha: 'Rei/Rainha', sorteio_rodada: 'sorteio/rodada' }[cfg.parceria] || 'dupla fixa');
    }
    if (cfg.grupos === 1) {
      parts.push(cfg.rodadas.modo === 'fixo' ? (cfg.rodadas.n + ' rodadas') : ('todos ' + (cfg.rodadas.turnos === 'ida_volta' ? 'ida/volta' : 'ida')));
    }
    if (cfg.eliminatoria.ativa) parts.push('elim ' + cfg.eliminatoria.linhas + (cfg.eliminatoria.linhas > 1 ? ' linhas' : ' linha') + ' · top ' + cfg.classificados);
    return parts.join(' · ');
  }

  // Distribui `topN` vagas em `nLines` linhas (bandas contíguas, resto na frente) —
  // espelha _deriveMotorMapping do builder atual.
  function _buildMapping(dests, names, topN, nLines) {
    var per = Math.floor(topN / nLines), rem = topN % nLines, rank = 1, mapping = [];
    for (var i = 0; i < nLines; i++) {
      var count = Math.max(1, per + (i < rem ? 1 : 0));
      mapping.push({ dest: dests[i], rankFrom: rank, rankTo: rank + count - 1, label: (names[i] || '') });
      rank += count;
    }
    return mapping;
  }
  var _LINE_DESTS = { 1: ['main'], 2: ['upper', 'lower'], 4: ['upper', 'lower', 'line3', 'line4'] };

  // Base comum de campos por-fase (datas/W.O./resultado) — o motor tolera defaults.
  function _phaseBase(resultEntry) {
    return {
      woScope: 'individual', rankingType: 'individual',
      resultEntry: resultEntry || ['organizer'],
      advancedScoring: null, scoring: null, lateEnrollment: 'closed',
      drawFirstDate: '', drawFirstTime: '19:00', drawIntervalDays: null, drawManual: true
    };
  }

  // COMPILADOR: config → { topLevel: {t.* p/ stage-0}, phases: [p0 (+p1 elim)] }.
  function compileToPhases(cfg, opts) {
    opts = opts || {};
    cfg = normalize(cfg, opts.sport);
    var isDupla = cfg.disputa === 'dupla';
    var teamSize = teamSizeFor(cfg.disputa);
    var scoreInd = cfg._scoreBy === 'individual';
    var re = opts.resultEntry || ['organizer'];
    var top = {}, p0;

    // Classificatória = Liga (rotativo/singles-limitado) OU Fase de Grupos (dupla fixa / todos).
    var useLiga = isDupla
      ? (cfg.parceria === 'rei_rainha' || cfg.parceria === 'sorteio_rodada')
      : (cfg.rodadas.modo === 'fixo');

    if (useLiga) {
      var isRR = isDupla && cfg.parceria === 'rei_rainha';
      top.format = 'Liga';
      top.drawMode = isRR ? 'rei_rainha' : 'sorteio';
      top.teamSize = teamSize;
      top.enrollmentMode = 'individual';
      top.ligaRoundFormat = isRR ? 'rei_rainha' : 'standard';
      top.ligaDrawMode = 'standard';           // rodada-a-rodada (não RR pré-gerado)
      top.gruposCount = 1;
      top.gruposClassified = cfg.classificados;
      if (!isRR) { top.equilibrado = true; top.clusterSize = 8; top.balanceBy = 'individual'; }
      p0 = Object.assign(_phaseBase(re), {
        name: isRR ? 'Rei/Rainha' : 'Pontos Corridos',
        formatCode: 'liga', format: 'Liga',
        drawMode: top.drawMode, reiRainha: isRR,
        rounds: cfg.rodadas.n, groupsBy: 'sorteio',
        source: { type: 'enrollment' },
        fixedPairs: false, gruposCount: 1, gruposClassified: cfg.classificados,
        pairingStrategy: 'top', grandFinal: true, lateEnrollment: 'expand'
      });
    } else {
      top.format = 'Fase de Grupos';
      top.drawMode = 'sorteio';
      top.teamSize = teamSize;
      top.enrollmentMode = 'individual';
      top.gruposCount = cfg.grupos;
      top.gruposClassified = cfg.classificados;
      // ida-e-volta só vale em tabela única (grupos=1) todos-contra-todos.
      var idaVolta = (cfg.grupos === 1 && cfg.rodadas.turnos === 'ida_volta');
      top.turnos = idaVolta ? 'ida_volta' : 'ida';   // _buildPhase0Cfg propaga p/ genGroupsFromPool
      if (idaVolta) top.ligaTurnos = 2;
      p0 = Object.assign(_phaseBase(re), {
        name: cfg.grupos === 1 ? 'Pontos Corridos' : 'Fase de Grupos',
        formatCode: 'grupos_mata', format: 'Fase de Grupos',
        drawMode: 'sorteio', reiRainha: false,
        gruposCount: cfg.grupos, gruposClassified: cfg.classificados,
        groupsBy: 'sorteio', rounds: 1,
        turnos: idaVolta ? 'ida_volta' : 'ida',   // ⚠️ motor grupos_mata ainda não honra turnos (TODO extensão)
        _doubleRR: idaVolta,
        source: { type: 'enrollment' },
        fixedPairs: isDupla,                   // teamSize>1 forma duplas fixas no sorteio
        pairingStrategy: 'top', grandFinal: true
      });
    }

    var phases = [p0];

    if (cfg.eliminatoria.ativa) {
      var e = cfg.eliminatoria;
      var perGroup = cfg.grupos > 1;
      var nLines = e.linhas;
      var dests = _LINE_DESTS[nLines] || ['main'];
      var topN = cfg.classificados;            // por grupo (N grupos) ou total (1 grupo)
      var mapping = _buildMapping(dests, e.nomes, topN, nLines);
      // Origem: "formar" (indivíduos → duplas) só quando pontuação individual.
      var forma = (e.origem === 'formar' && scoreInd && isDupla);
      var elimFixedPairs = !!forma;            // forma duplas dos indivíduos
      var elimPairing = forma
        ? ({ performance: 'top', equilibrio: 'balanced', sorteio: 'draw_among' }[e.formacao] || 'top')
        : 'top';
      var p1 = Object.assign(_phaseBase(re), {
        name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples',
        reiRainha: false, drawMode: 'sorteio', rounds: 1,
        gruposCount: cfg.grupos, gruposClassified: cfg.classificados,
        source: {
          type: 'previous_phase', fromPhaseOffset: 1,
          byGroupRank: perGroup, scope: perGroup ? 'per_group' : 'overall',
          qualifyMode: perGroup ? 'per_group' : 'overall',
          qualifyQuantity: 'top', qualifyTopN: topN, mapping: mapping
        },
        fixedPairs: elimFixedPairs, pairingStrategy: elimPairing,
        mapping: mapping, grandFinal: nLines > 1, thirdPlace: e.terceiro,
        drawManual: false
      });
      phases.push(p1);
    }

    return { topLevel: top, phases: phases, cfg: cfg };
  }

  window.FORMAT2 = {
    allowsSingles: allowsSingles,
    teamSizeFor: teamSizeFor,
    defaultConfig: defaultConfig,
    normalize: normalize,
    summary: summary,
    compileToPhases: compileToPhases
  };
})();
