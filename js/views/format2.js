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
      parceria: 'sorteio_rodada', // Sorteio + "por rodada" ON por padrão (dono)
      formacaoDupla: 'sorteio',
      rodadas: { modo: 'fixo', turnos: 'ida', n: 5, drawFirstDate: '', drawFirstTime: '19:00', drawIntervalDays: 7, drawManual: false, _intervalAuto: true },
      classifAtiva: true,        // false = SEM classificatória → eliminação direta do enrollment
      classificados: 2,          // X que classificam (por grupo OU total, conforme classifScope)
      classifScope: 'per_group', // 'per_group' (melhores de cada grupo) | 'overall' (tabela geral)
      eliminatoria: {
        ativa: true,          // ativo por padrão (dono)
        dupla: false,         // v4.4.58: false = eliminatória simples; true = Dupla Eliminatória (repescagem)
        linhas: 1,
        nomes: [''],
        origem: 'ja_formadas',
        formacao: 'performance', // ESTRATÉGIA geral: performance (beneficia os melhores) | equilibrio
                                 // (jogos disputados) | sorteio. Dirige FORMAÇÃO das duplas E semeadura
                                 // dos confrontos de uma vez só (compilador deriva bracketSeeding).
        qualifyAll: false,       // false = os X melhores (slider); true = TODOS avançam
        terceiro: true,
        grandFinal: true,        // v4.4.73: grande final unindo as linhas. Só editável na SIMPLES
                                 // com 2/4 linhas (desativar = linhas independentes). Dupla = sempre.
        lateEnrollment: 'closed' // inscrições durante a ELIMINATÓRIA: closed | standby | expand
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
      // Rei/Rainha (grupos de 4 rotativos) só faz sentido com 1 grupo. 2+ grupos ⇒ dupla fixa
      // (montadas ou sorteadas). Pedido do dono: "rei/rainha só aparece se for 1 grupo".
      if (!umGrupo && out.parceria !== 'fixa') out.parceria = 'fixa';
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
      out.rodadas.modo = 'fixo'; out.rodadas.turnos = 'ida'; // rotativo = por-rodada
    } else {
      // dupla fixa OU singles: round-robin ('todos') OU nº de rodadas ('fixo').
      if (out.rodadas.modo !== 'todos' && out.rodadas.modo !== 'fixo') out.rodadas.modo = 'todos';
      // "Nº de rodadas" (fixo, com agendamento) só faz sentido em PONTOS CORRIDOS (1 grupo).
      // Em fase de grupos (2+), sempre round-robin dentro do grupo.
      if (!umGrupo) out.rodadas.modo = 'todos';
      // ida-e-volta vale em qualquer round-robin (o motor dobra o RR — grupos ou tabela única).
      out.rodadas.turnos = (out.rodadas.modo === 'todos' && out.rodadas.turnos === 'ida_volta') ? 'ida_volta' : 'ida';
    }
    out.rodadas.n = Math.max(1, parseInt(out.rodadas.n, 10) || 1);
    // Agendamento dos sorteios (só relevante no modo "nº de rodadas").
    out.rodadas.drawFirstDate = out.rodadas.drawFirstDate || '';
    out.rodadas.drawFirstTime = out.rodadas.drawFirstTime || '19:00';
    var _di = parseInt(out.rodadas.drawIntervalDays, 10);
    out.rodadas.drawIntervalDays = (_di >= 1) ? _di : null; // vazio = sem repetição (NÃO força 7)
    out.rodadas.drawManual = !!out.rodadas.drawManual;
    out.rodadas._intervalAuto = (out.rodadas._intervalAuto !== false); // sugere intervalo até o user editar

    out.classificados = Math.max(1, parseInt(out.classificados, 10) || 2);
    // Escopo da classificação: por grupo × geral. Com 1 grupo é sempre geral (não há grupos).
    if (out.classifScope !== 'overall' && out.classifScope !== 'per_group') out.classifScope = 'per_group';
    if (umGrupo) out.classifScope = 'overall';

    var e = out.eliminatoria || {};
    e.ativa = !!e.ativa; // v4.4.32: pode desligar SEMPRE (grupos ou pontos corridos); default = defaultConfig
    // v4.4.58: Dupla Eliminatória (repescagem). É UMA chave só — força 1 linha (chaves
    // paralelas de dupla-elim fogem do escopo). Simples pode ter 1/2/4 linhas.
    e.dupla = e.dupla === true;
    if (e.dupla) e.linhas = 1;
    if ([1, 2, 4].indexOf(e.linhas) === -1) e.linhas = 1;
    // v4.4.73: grande final. Default ON. Dupla Eliminatória SEMPRE tem (inerente ao
    // formato). Só a SIMPLES com 2/4 linhas pode desativar (→ linhas independentes,
    // cada uma com seu campeão). 1 linha não tem conceito de grande final.
    e.grandFinal = (e.grandFinal !== false);
    if (e.dupla) e.grandFinal = true;
    if (!Array.isArray(e.nomes)) e.nomes = [];
    while (e.nomes.length < e.linhas) e.nomes.push('');
    e.nomes = e.nomes.slice(0, e.linhas);
    // v4.4.40: origem é DETERMINADA pela classificatória (não é escolha livre): pontuação
    // individual (rei/rainha, sorteio-a-cada-rodada) → FORMAR as duplas dos indivíduos;
    // dupla fixa → duplas carregam (já formadas).
    e.origem = (out._scoreBy === 'individual' && isDupla) ? 'formar' : 'ja_formadas';
    if (['performance', 'equilibrio', 'sorteio'].indexOf(e.formacao) === -1) e.formacao = 'performance';
    // 'sorteio' só faz sentido FORMANDO duplas (senão não há o que sortear — os confrontos
    // seguem a classificação). Fora disso cai em 'performance' (beneficia os melhores).
    if (e.formacao === 'sorteio' && !(isDupla && e.origem === 'formar')) e.formacao = 'performance';
    e.qualifyAll = !!e.qualifyAll;
    if (['closed', 'standby', 'expand'].indexOf(e.lateEnrollment) === -1) e.lateEnrollment = 'closed';
    e.terceiro = true; // 3º lugar SEMPRE existe (project_third_place_always) — não é opcional.
    // v4.4.33: fase classificatória on/off. Ao menos UMA fase ativa: sem classificatória ⇒
    // eliminatória obrigatória (eliminação direta do enrollment).
    out.classifAtiva = out.classifAtiva !== false;
    if (!out.classifAtiva) e.ativa = true;
    out.eliminatoria = e;

    return out;
  }

  function summary(cfg) {
    var parts = [];
    parts.push(cfg.disputa === 'individual' ? 'Individual' : 'Duplas');
    if (cfg.classifAtiva === false) {
      parts.push('Eliminação direta');
      if (cfg.disputa === 'dupla') parts.push(cfg.formacaoDupla === 'manual' ? 'duplas já formadas' : 'duplas sorteadas');
      parts.push('elim ' + cfg.eliminatoria.linhas + (cfg.eliminatoria.linhas > 1 ? ' linhas' : ' linha'));
      return parts.join(' · ');
    }
    parts.push(cfg.grupos === 1 ? 'Pontos Corridos' : (cfg.grupos + ' grupos'));
    if (cfg.disputa === 'dupla') {
      if (cfg.parceria === 'rei_rainha') parts.push('Rei/Rainha');
      else if (cfg.parceria === 'sorteio_rodada') parts.push('sorteio/rodada');
      else parts.push(cfg.formacaoDupla === 'manual' ? 'duplas montadas' : 'duplas sorteadas');
    }
    if (cfg.grupos === 1) {
      parts.push(cfg.rodadas.modo === 'fixo' ? (cfg.rodadas.n + ' rodadas') : ('todos ' + (cfg.rodadas.turnos === 'ida_volta' ? 'ida/volta' : 'ida')));
    }
    if (cfg.eliminatoria.ativa) parts.push('elim ' + cfg.eliminatoria.linhas + (cfg.eliminatoria.linhas > 1 ? ' linhas' : ' linha') + ' · top ' + cfg.classificados);
    return parts.join(' · ');
  }

  // Distribui `topN` vagas em `nLines` linhas (bandas contíguas, resto na frente) —
  // produz o mapping que o motor (buildEntrantsByDest) consome por rankFrom/rankTo.
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

    // v4.4.33: SEM fase classificatória → ELIMINAÇÃO DIRETA. Todos os inscritos entram no
    // bracket por sorteio; duplas já formadas (enrollment=teams) ou sorteadas (individual).
    if (!cfg.classifAtiva) {
      var e0 = cfg.eliminatoria;
      var formadas0 = isDupla && cfg.formacaoDupla === 'manual';
      var elimDupla0 = !!e0.dupla; // v4.4.58: Dupla Eliminatória (repescagem)
      top.format = elimDupla0 ? 'Dupla Eliminatória' : 'Eliminatórias Simples';
      top.drawMode = 'sorteio';
      top.teamSize = teamSize;
      top.enrollmentMode = formadas0 ? 'teams' : 'individual';
      var d0 = _LINE_DESTS[e0.linhas] || ['main'];
      p0 = Object.assign(_phaseBase(re), {
        name: 'Eliminatória',
        formatCode: elimDupla0 ? 'elim_dupla' : 'elim_simples',
        format: elimDupla0 ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
        reiRainha: false, drawMode: 'sorteio', rounds: 1,
        source: { type: 'enrollment' },
        fixedPairs: isDupla, pairingStrategy: 'top', // eliminação direta: inscritos sorteados (sem ranking → semeadura neutra)
        mapping: _buildMapping(d0, e0.nomes, Math.max(e0.linhas, 2) * 8, e0.linhas),
        grandFinal: elimDupla0 || (e0.linhas > 1 && e0.grandFinal !== false), thirdPlace: e0.terceiro, drawManual: false
      });
      return { topLevel: top, phases: [p0], cfg: cfg };
    }

    // Classificatória = Liga (rotativo/nº-de-rodadas) OU Fase de Grupos (todos-contra-todos).
    // "Nº de rodadas" (modo 'fixo') = Liga rodada-a-rodada com agendamento — vale p/ singles E
    // dupla fixa (pontos corridos com nº determinado de rodadas). Todos-contra-todos = grupos.
    var useLiga = isDupla
      ? (cfg.parceria === 'rei_rainha' || cfg.parceria === 'sorteio_rodada' || cfg.rodadas.modo === 'fixo')
      : (cfg.rodadas.modo === 'fixo');

    if (useLiga) {
      var isRR = isDupla && cfg.parceria === 'rei_rainha';
      // dupla FIXA com nº de rodadas → Liga com pares travados (não rotativo).
      var ligaFixedPairs = isDupla && cfg.parceria === 'fixa';
      top.format = 'Liga';
      top.drawMode = isRR ? 'rei_rainha' : 'sorteio';
      top.teamSize = teamSize;
      top.enrollmentMode = ligaFixedPairs ? 'teams' : 'individual';
      top.ligaRoundFormat = isRR ? 'rei_rainha' : 'standard';
      top.ligaDrawMode = 'standard';           // rodada-a-rodada (não RR pré-gerado)
      top.gruposCount = 1;
      top.gruposClassified = cfg.classificados;
      if (!isRR && !ligaFixedPairs) { top.equilibrado = true; top.clusterSize = 8; top.balanceBy = 'individual'; }
      // Agendamento dos sorteios. Manual é o modo EFETIVO quando o org marcou manual OU
      // quando não dá pra automatizar (sem data do 1º sorteio). Auto só quando há data.
      var _schedManual = !!cfg.rodadas.drawManual || !cfg.rodadas.drawFirstDate;
      top.drawManual = _schedManual;
      if (!_schedManual) {
        top.drawFirstDate = cfg.rodadas.drawFirstDate;
        top.drawFirstTime = cfg.rodadas.drawFirstTime || '19:00';
        top.drawIntervalDays = (cfg.rodadas.drawIntervalDays >= 1) ? cfg.rodadas.drawIntervalDays : null; // vazio = sem repetição
      }
      p0 = Object.assign(_phaseBase(re), {
        name: isRR ? 'Rei/Rainha' : 'Pontos Corridos',
        formatCode: 'liga', format: 'Liga',
        drawMode: top.drawMode, reiRainha: isRR,
        rounds: cfg.rodadas.n, groupsBy: 'sorteio',
        source: { type: 'enrollment' },
        fixedPairs: ligaFixedPairs, gruposCount: 1, gruposClassified: cfg.classificados,
        pairingStrategy: 'top', grandFinal: true, lateEnrollment: 'expand',
        drawManual: _schedManual,
        drawFirstDate: _schedManual ? '' : cfg.rodadas.drawFirstDate,
        drawFirstTime: _schedManual ? '' : (cfg.rodadas.drawFirstTime || '19:00'),
        drawIntervalDays: _schedManual ? null : ((cfg.rodadas.drawIntervalDays >= 1) ? cfg.rodadas.drawIntervalDays : null)
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
      // Escopo vem do TOGGLE (classifScope), não do nº de grupos: com 2+ grupos o org escolhe
      // por-grupo (melhores de cada) OU geral (tabela única). 1 grupo é sempre geral.
      var perGroup = cfg.grupos > 1 && cfg.classifScope === 'per_group';
      var nLines = e.linhas;
      var dests = _LINE_DESTS[nLines] || ['main'];
      var topN = cfg.classificados;            // quantos classificam = valor do SLIDER
      var qAll0 = !!e.qualifyAll;              // "Todos" = atalho do slider no máximo
      // v4.4.x: quantos avançam vem do SLIDER (classificados). "Todos" (qualifyAll) NÃO é limitado
      // pelo número do slider — é o MÁXIMO (todos) → mapping com rankTo:999 (profundidade = todos
      // no motor, buildEntrantsByDest). Sem "Todos" → faixas do slider via _buildMapping.
      var mapping = qAll0
        ? dests.map(function (dst, di) { return { dest: dst, rankFrom: 1, rankTo: 999, label: (e.nomes && e.nomes[di]) || '' }; })
        : _buildMapping(dests, e.nomes, topN, nLines);
      // Origem: "formar" (indivíduos → duplas) só quando pontuação individual.
      var forma = (e.origem === 'formar' && scoreInd && isDupla);
      var elimFixedPairs = !!forma;            // forma duplas dos indivíduos
      // v4.4.38: a estratégia (performance/equilíbrio/sorteio) vale SEMPRE que há duplas —
      // formar (individuais) OU parear a chave (duplas fixas). Antes só valia ao formar.
      var elimPairing = (isDupla)
        ? ({ performance: 'top', equilibrio: 'balanced', sorteio: 'draw_among' }[e.formacao] || 'top')
        : 'top';
      // v4.4.x: CONCEITO ÚNICO — a MESMA estratégia dirige a semeadura dos confrontos:
      // performance → cabeças de chave (seed, protege os melhores); equilíbrio → confrontos
      // parelhos (balanced); sorteio → duplas já vêm embaralhadas, semeadura neutra (seed).
      var elimSeeding = ({ performance: 'seed', equilibrio: 'balanced', sorteio: 'seed' }[e.formacao] || 'seed');
      var qAll = !!e.qualifyAll;
      var elimDupla = !!e.dupla; // v4.4.58: Dupla Eliminatória (repescagem)
      var p1 = Object.assign(_phaseBase(re), {
        name: 'Eliminatória',
        formatCode: elimDupla ? 'elim_dupla' : 'elim_simples',
        format: elimDupla ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
        reiRainha: false, drawMode: 'sorteio', rounds: 1,
        gruposCount: cfg.grupos, gruposClassified: cfg.classificados,
        source: {
          type: 'previous_phase', fromPhaseOffset: 1,
          byGroupRank: perGroup, scope: perGroup ? 'per_group' : 'overall',
          qualifyMode: qAll ? 'all' : (perGroup ? 'per_group' : 'overall'),
          qualifyQuantity: qAll ? 'all' : 'top', qualifyTopN: topN, mapping: mapping,
          // v4.4.x: Rei/Rainha em escopo GERAL → grupos rotativos de 4 = ranking geral é lista
          // plana → motor usa pool global (respeita o slider), sem degenerar pra por-grupo.
          flatOverall: (cfg.parceria === 'rei_rainha' && !perGroup)
        },
        fixedPairs: elimFixedPairs, pairingStrategy: elimPairing, bracketSeeding: elimSeeding,
        mapping: mapping, grandFinal: elimDupla || (nLines > 1 && e.grandFinal !== false), thirdPlace: e.terceiro,
        lateEnrollment: e.lateEnrollment || 'closed', // inscrições durante a eliminatória
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
