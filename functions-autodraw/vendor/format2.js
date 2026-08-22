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
      manualPairingOpen: false,   // duplas "já formadas": os PARTICIPANTES podem formar duplas?
                                  // false (padrão) = só o organizador forma. → t.manualPairing.
      rodadas: { modo: 'fixo', turnos: 'ida', n: 5, drawFirstDate: '', drawFirstTime: '19:00', drawIntervalDays: 7, drawManual: false, allowSelfDeactivation: true, _intervalAuto: true },
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
        lateEnrollment: 'inherit', // inscrições durante a ELIMINATÓRIA: inherit (segue a fase inicial) | closed | standby | expand
        // "Novos Confrontos" da ELIMINATÓRIA — INDEPENDENTE de "Abertas", igual à fase inicial
        // (cânone project_new_matchups_independent). 'inherit' = segue a fase inicial | true | false.
        newMatchups: 'inherit',
        // FORMATO DA PARTIDA (GSM) PRÓPRIO da eliminatória — v1.9.111. null = joga com o MESMO
        // formato da classificatória (t.scoring, o bloco "🎾 Formato da Partida" do form, que
        // pertence à fase INICIAL). Objeto = a eliminatória tem o SEU formato e é ele que vale
        // nos jogos dela (compila pra phases[elim].scoring, lido por window._effectiveScoring).
        // Caso do dono: Rei/Rainha 1 set na classificatória, duplas fixas melhor-de-3 na elim.
        scoring: null,
        // TÉRMINO da fase eliminatória (v1.6.80). O box "📅 Datas da fase" do form é da fase
        // INICIAL (grava t.startDate/t.endDate) — quando há classificatória, a eliminatória é
        // 2ª fase e NÃO tinha janela nenhuma, então o fim do TORNEIO era o fim da classificatória.
        // Compila pra phases[última].endDate/endTime, o schema que _tournamentDateRange e
        // _tournamentScheduledWindow já leem. Vazio = sem término próprio (herda o do torneio).
        endDate: '', endTime: ''
      }
    }, sport);
  }

  // ── FORMATO DA PARTIDA (GSM) DE UMA FASE ─────────────────────────────────────
  // null = a fase HERDA o formato do torneio (t.scoring). Objeto = formato PRÓPRIO.
  // ⚠️ `type` é obrigatório e não-vazio: é ele que window._effectiveScoring usa pra decidir
  // que a fase tem formato próprio (`if (ph.scoring && ph.scoring.type)`). Um objeto sem
  // type seria silenciosamente ignorado — por isso normalizamos pra 'sets' e nunca deixamos
  // passar meio-objeto vindo de config antiga/template.
  function normScoring(s) {
    if (!s || typeof s !== 'object') return null;
    var type = String(s.type || 'sets');
    if (type === 'simple') return { type: 'simple' };
    if (type !== 'sets' && type !== 'gsm') type = 'sets';
    var g = parseInt(s.gamesPerSet, 10); if (!(g >= 1)) g = 6;
    var sw = parseInt(s.setsToWin, 10); if (!(sw >= 1 && sw <= 3)) sw = 1;
    var tbP = parseInt(s.tiebreakPoints, 10); if (!(tbP >= 1)) tbP = 7;
    var tbM = parseInt(s.tiebreakMargin, 10); if (!(tbM >= 1)) tbM = 2;
    var stbP = parseInt(s.superTiebreakPoints, 10); if (!(stbP >= 1)) stbP = 10;
    var fsg = parseInt(s.fixedSetGames, 10); if (!(fsg >= 1)) fsg = g;
    var out = {
      type: type, setsToWin: sw, gamesPerSet: g,
      tiebreakEnabled: s.tiebreakEnabled !== false,
      tiebreakPoints: tbP, tiebreakMargin: tbM,
      superTiebreak: s.superTiebreak === true, superTiebreakPoints: stbP,
      countingType: (s.countingType === 'numeric') ? 'numeric' : 'tennis',
      advantageRule: s.advantageRule === true,
      fixedSet: s.fixedSet === true, fixedSetGames: fsg
    };
    if (s.tiebreakAt) out.tiebreakAt = String(s.tiebreakAt);
    // ⭐ 2.0.2: `tieRule` ('extend' = prorrogar · 'tiebreak') TEM que atravessar a normalização.
    // O `out` é uma lista FECHADA de campos — campo novo que não entre aqui é SILENCIOSAMENTE
    // DESCARTADO na compilação das fases, e a fase acabaria jogando com a regra do torneio em
    // vez da sua. Mesmo motivo pelo qual `tiebreakAt` já estava na linha de cima.
    if (s.tieRule === 'extend' || s.tieRule === 'tiebreak') out.tieRule = s.tieRule;
    return out;
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
    out.manualPairingOpen = !!out.manualPairingOpen;

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
    // v1.4.12/15: autodesativação dos inscritos. RODADA ÚNICA vem desligada por DEFAULT
    // (não há próximo sorteio pra ficar de fora) — mas é DEFAULT, não cadeado: escolha
    // explícita do organizador (true/false) sempre vence. Só decide quando ninguém decidiu.
    if (out.rodadas.allowSelfDeactivation == null) out.rodadas.allowSelfDeactivation = (out.rodadas.n !== 1);
    else out.rodadas.allowSelfDeactivation = (out.rodadas.allowSelfDeactivation !== false);
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
    // v4.5.51: ABERTURA POR REI/RAINHA (nova alternativa da eliminatória). ON = a eliminatória
    // começa por UMA rodada Rei/Rainha (grupos de 4 sorteados) e as duplas se formam DENTRO de
    // cada grupo — a estratégia (performance 1º+2º/3º+4º · equilíbrio 1º+4º/2º+3º) dirige o
    // pareamento intra-grupo. Só faz sentido em DUPLAS. Corte por grupo de 4: 4 (todos → 2 duplas)
    // ou 2 (só os 2 melhores → 1 dupla). Só faz sentido em DUPLAS.
    // ⚠️ A EXCLUSÃO MÚTUA COM A CLASSIFICATÓRIA CAIU (1.8.56). A v4.5.51 tinha travado isto em
    // `out.classifAtiva === false` e deixado escrito "com classificatória é fase empilhada
    // (3 fases), próximo passo" — o passo nunca veio, e o dono cobrou pelo nome: "pode fazer
    // uma classificatoria de varias rodadas e depois definir que os x classificados para as
    // eliminatorias vao fazer uma rodada inicial nas eliminatorias que definira as duplas que
    // seguem na disputa — normalmente uma rodada rei rainha sorteados grupos com cabecas de
    // chaves que foram definidos na fase classificatoria anterior". Agora vale nos dois casos
    // e a compilação é a MESMA (_parReiRainhaMaisElim); o que muda é só DE ONDE vem o pool.
    e.openReiRainha = (e.openReiRainha === true) && isDupla;
    e.reiRainhaCut = (parseInt(e.reiRainhaCut, 10) === 2) ? 2 : 4;
    e.qualifyAll = !!e.qualifyAll;
    // 'inherit' (default) = a elim segue a inscrição da fase inicial; só coage o que for inválido.
    if (['inherit', 'closed', 'standby', 'expand'].indexOf(e.lateEnrollment) === -1) e.lateEnrollment = 'inherit';
    // newMatchups é ORTOGONAL ao lateEnrollment (não coage um pelo outro). Compat: config antiga
    // sem o campo, mas com lateEnrollment EXPLÍCITO, herda o significado antigo ('expand' = ON).
    if (e.newMatchups !== true && e.newMatchups !== false) {
      e.newMatchups = (['closed', 'standby', 'expand'].indexOf(e.lateEnrollment) >= 0)
        ? (e.lateEnrollment === 'expand') : 'inherit';
    }
    e.terceiro = true; // 3º lugar SEMPRE existe (project_third_place_always) — não é opcional.
    // v4.4.33: fase classificatória on/off. Ao menos UMA fase ativa: sem classificatória ⇒
    // eliminatória obrigatória (eliminação direta do enrollment).
    out.classifAtiva = out.classifAtiva !== false;
    if (!out.classifAtiva) e.ativa = true;
    // v1.6.80: término PRÓPRIO da eliminatória — só faz sentido quando ela é 2ª fase. Na
    // eliminação DIRETA ela É a fase inicial e já usa as datas do form (t.startDate/t.endDate),
    // então aqui fica vazio pra não haver duas fontes pro mesmo fim. Só aceita 'AAAA-MM-DD';
    // hora sem data não vale nada.
    // FORMATO DA PARTIDA PRÓPRIO da elim: só faz sentido quando ela é fase POSTERIOR.
    // Na eliminação DIRETA a eliminatória É a fase inicial e joga com o formato do TORNEIO
    // (o bloco "🎾 Formato da Partida" do form, que a UI reloca pra dentro dela) — um formato
    // só, sem duas fontes pro mesmo jogo.
    e.scoring = out.classifAtiva ? normScoring(e.scoring) : null;
    e.endDate = (out.classifAtiva && /^\d{4}-\d{2}-\d{2}$/.test(String(e.endDate || ''))) ? String(e.endDate) : '';
    e.endTime = (e.endDate && /^\d{2}:\d{2}$/.test(String(e.endTime || ''))) ? String(e.endTime) : '';
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

  // Inscrição tardia da ELIMINATÓRIA (project_late_enrollment_per_phase + incidente 18/jul):
  // por padrão HERDA a política da fase inicial (opts.lateEnrollment = painel do form). Só
  // um valor EXPLÍCITO no painel da elim (closed/standby/expand) sobrepõe — "cada fase
  // gerencia a sua" continua, mas o default deixa de FECHAR a inscrição por surpresa.
  // ⚠️ Era uma closure recriada dentro de compileToPhases; subiu pro módulo porque a
  // montagem do par Rei/Rainha + Eliminatória também precisa dela — e duas cópias da mesma
  // regra de herança divergiriam na primeira mudança.
  function _elimLE(cfgLE, opts) {
    return (cfgLE && cfgLE !== 'inherit') ? cfgLE : ((opts && opts.lateEnrollment) || 'closed');
  }
  // "Novos Confrontos" da elim: valor EXPLÍCITO manda; 'inherit' segue a fase inicial
  // (opts.newMatchups) e, na falta dela, o significado legado de lateEnrollment='expand'.
  function _elimNM(cfgNM, opts) {
    if (cfgNM === true || cfgNM === false) return cfgNM;
    if (opts && (opts.newMatchups === true || opts.newMatchups === false)) return opts.newMatchups;
    return (((opts && opts.lateEnrollment) || 'closed') === 'expand');
  }

  // ── ABRIR A ELIMINATÓRIA COM UMA RODADA REI/RAINHA ────────────────────────────
  // FONTE ÚNICA das duas fases desse arranjo: a rodada de FORMAÇÃO (grupos de 4 que decidem
  // as duplas) e a ELIMINATÓRIA que lê o resultado dela.
  //
  // POR QUE UMA FUNÇÃO, e não dois blocos: o mesmo arranjo serve DOIS lugares do modelo —
  //   • eliminação direta que abre com Rei/Rainha  → o pool vem da INSCRIÇÃO;
  //   • classificatória de N rodadas → rodada inicial na eliminatória → o pool vem dos
  //     CLASSIFICADOS da fase anterior (as cabeças de chave saem dali).
  // Muda só a `source` da fase de formação. Enquanto isto era código duplicado, o segundo
  // caso simplesmente não existia (o normalize apagava o toggle) — que é a duplicidade que
  // o dono apontou: "esse toggle da fase eliminatoria veio depois e deve ser assim".
  //
  // `sourceRR` = de onde saem as pessoas da rodada de formação.
  function _parReiRainhaMaisElim(cfg, re, sourceRR, opts) {
    var e0 = cfg.eliminatoria;
    var cutRR = e0.reiRainhaCut;               // 2 (top-2 → 1 dupla) | 4 (todos → 2 duplas)
    var daInscricao = !(sourceRR && sourceRR.type === 'previous_phase');
    var pRR = Object.assign(_phaseBase(re), {
      name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga',
      drawMode: 'rei_rainha', reiRainha: true, rounds: 1, groupsBy: 'sorteio',
      source: sourceRR,
      fixedPairs: false, gruposCount: 1, gruposClassified: cutRR,
      // Vindo da fase anterior o pool chega ORDENADO POR MÉRITO, e é isso que faz as cabeças
      // de chave espalharem em vez de caírem no mesmo grupo. Da inscrição não há mérito
      // nenhum a preservar, então segue o pareamento neutro de sempre.
      pairingStrategy: daInscricao ? 'top' : 'seed',
      grandFinal: true, lateEnrollment: 'closed', drawManual: false
    });
    var dRR = _LINE_DESTS[e0.linhas] || ['main'];
    // per_group: cada linha puxa até `cutRR` de CADA grupo de 4 (rankTo = corte).
    var mapRR = dRR.map(function (dst, di) {
      return { dest: dst, rankFrom: 1, rankTo: cutRR, label: (e0.nomes && e0.nomes[di]) || '' };
    });
    var pairRR = ({ performance: 'top', equilibrio: 'balanced', sorteio: 'draw_among' }[e0.formacao] || 'top');
    var seedRR = ({ performance: 'seed', equilibrio: 'balanced', sorteio: 'seed' }[e0.formacao] || 'seed');
    var elimDuplaRR = !!e0.dupla;
    var pElimRR = Object.assign(_phaseBase(re), {
      name: 'Eliminatória',
      formatCode: elimDuplaRR ? 'elim_dupla' : 'elim_simples',
      format: elimDuplaRR ? 'Dupla Eliminatória' : 'Eliminatórias Simples',
      reiRainha: false, drawMode: 'sorteio', rounds: 1,
      gruposCount: 1, gruposClassified: cutRR,
      source: {
        type: 'previous_phase', fromPhaseOffset: 1,
        byGroupRank: true, scope: 'per_group',
        qualifyMode: 'per_group', qualifyQuantity: 'top', qualifyTopN: cutRR, mapping: mapRR
      },
      fixedPairs: true, pairingStrategy: pairRR, bracketSeeding: seedRR,
      mapping: mapRR, grandFinal: elimDuplaRR || (e0.linhas > 1 && e0.grandFinal !== false),
      thirdPlace: e0.terceiro, lateEnrollment: _elimLE(e0.lateEnrollment, opts),
      newMatchups: _elimNM(e0.newMatchups, opts), drawManual: false,
      // Formato da partida PRÓPRIO da eliminatória (null = herda t.scoring). A rodada de
      // FORMAÇÃO (pRR, acima) fica com null de propósito: ela é uma rodada Rei/Rainha, irmã
      // da classificatória — quem muda de formato é a disputa eliminatória em si.
      scoring: e0.scoring || null,
      endDate: e0.endDate || '', endTime: e0.endTime || ''   // v1.6.80: término da ÚLTIMA fase
    });
    return [pRR, pElimRR];
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

      // v4.5.51: ELIMINATÓRIA QUE ABRE COM REI/RAINHA (eliminação direta). p0 = 1 rodada
      // Rei/Rainha (grupos de 4 sorteados do enrollment) → p1 = eliminatória que lê POR GRUPO
      // (scope 'per_group'), corta os X melhores de cada grupo de 4 (rankTo=reiRainhaCut) e forma
      // as duplas pela estratégia (performance 1º+2º/3º+4º · equilíbrio 1º+4º/2º+3º · sorteio).
      // Mesmo motor da classificatória Rei/Rainha → elim, só que POR GRUPO (não flatOverall) e 1 rodada.
      if (isDupla && e0.openReiRainha) {
        var cutRR = e0.reiRainhaCut;             // 2 (top-2 → 1 dupla) | 4 (todos → 2 duplas)
        top.format = 'Liga'; top.drawMode = 'rei_rainha'; top.teamSize = teamSize;
        top.enrollmentMode = 'individual';
        top.ligaRoundFormat = 'rei_rainha'; top.ligaDrawMode = 'standard';
        top.gruposCount = 1; top.gruposClassified = cutRR; top.drawManual = false;
        // A rodada de formação vem da INSCRIÇÃO (é a 1ª fase do torneio).
        var parDireto = _parReiRainhaMaisElim(cfg, re, { type: 'enrollment' }, opts);
        if (opts.lateEnrollment) parDireto[0].lateEnrollment = opts.lateEnrollment; // fase inicial = painel
        return { topLevel: top, phases: parDireto, cfg: cfg };
      }

      var formadas0 = isDupla && cfg.formacaoDupla === 'manual';
      var elimDupla0 = !!e0.dupla; // v4.4.58: Dupla Eliminatória (repescagem)
      top.format = elimDupla0 ? 'Dupla Eliminatória' : 'Eliminatórias Simples';
      top.drawMode = 'sorteio';
      top.teamSize = teamSize;
      top.enrollmentMode = formadas0 ? 'teams' : 'individual';
      // Duplas já formadas: se o org habilitou, os PARTICIPANTES podem formar suas duplas
      // (arrastar/soltar); senão só o organizador. Sorteadas → irrelevante (organizer_only).
      top.manualPairing = (formadas0 && cfg.manualPairingOpen) ? 'open' : 'organizer_only';
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
      if (opts.lateEnrollment) p0.lateEnrollment = opts.lateEnrollment; // eliminação direta: fase inicial = painel
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

    // ── A ELIMINATÓRIA ABRE COM UMA RODADA DE FORMAÇÃO (Rei/Rainha) ────────────────
    // Regra do dono: "pode fazer uma classificatória de várias rodadas e depois definir que
    // os x classificados para as eliminatórias vão fazer uma rodada inicial nas eliminatórias
    // que definirá as duplas que seguem na disputa — normalmente uma rodada rei rainha
    // sorteados grupos com cabeças de chaves que foram definidos na fase classificatória
    // anterior." São TRÊS fases: classificatória → formação → eliminatória.
    // É o MESMO arranjo da eliminação direta que abre com Rei/Rainha (_parReiRainhaMaisElim);
    // muda só de onde vem o pool — aqui, os classificados da fase anterior, ORDENADOS POR
    // MÉRITO (é isso que dá as cabeças de chave).
    if (cfg.eliminatoria.ativa && cfg.eliminatoria.openReiRainha && isDupla) {
      var eRR = cfg.eliminatoria;
      var perGroupRR = cfg.grupos > 1 && cfg.classifScope === 'per_group';
      var destsRR = _LINE_DESTS[eRR.linhas] || ['main'];
      var mapClassif = !!eRR.qualifyAll
        ? destsRR.map(function (dst, di) { return { dest: dst, rankFrom: 1, rankTo: 999, label: (eRR.nomes && eRR.nomes[di]) || '' }; })
        : _buildMapping(destsRR, eRR.nomes, cfg.classificados, eRR.linhas);
      var parEmpilhado = _parReiRainhaMaisElim(cfg, re, {
        // quem entra na rodada de formação = os classificados da fase anterior
        type: 'previous_phase', fromPhaseOffset: 1,
        byGroupRank: perGroupRR, scope: perGroupRR ? 'per_group' : 'overall',
        qualifyMode: !!eRR.qualifyAll ? 'all' : (perGroupRR ? 'per_group' : 'overall'),
        qualifyQuantity: !!eRR.qualifyAll ? 'all' : 'top',
        qualifyTopN: cfg.classificados, mapping: mapClassif,
        // Rei/Rainha em escopo geral = ranking plano (mesma razão do ramo comum abaixo)
        flatOverall: (cfg.parceria === 'rei_rainha' && !perGroupRR)
      }, opts);
      phases.push(parEmpilhado[0]);   // formação
      phases.push(parEmpilhado[1]);   // eliminatória (lê a formação, fromPhaseOffset 1)
      if (opts.lateEnrollment) phases[0].lateEnrollment = opts.lateEnrollment;
      if (opts.newMatchups === true || opts.newMatchups === false) phases[0].newMatchups = opts.newMatchups;
      return { topLevel: top, phases: phases, cfg: cfg };
    }

    if (cfg.eliminatoria.ativa) {
      var e = cfg.eliminatoria;
      // Escopo vem do TOGGLE (classifScope), não do nº de grupos: com 2+ grupos o org escolhe
      // por-grupo (melhores de cada) OU geral (tabela única). 1 grupo é sempre geral.
      //
      // ⭐ EXCEÇÃO REI/RAINHA DE RODADA ÚNICA — os grupos DE VERDADE são os do R/R.
      // `cfg.grupos` é o slider da Fase de Grupos e NÃO fala do Rei/Rainha: ele monta
      // grupos de 4 sozinho (a Confra tem `grupos:1` e 34 grupos na quadra). Como o
      // normalize ainda força `classifScope='overall'` quando `grupos===1`, a condição
      // acima dava SEMPRE falso no R/R — e a colocação dentro do grupo, que é a única
      // que existe ali, nunca era usada. Efeito medido na Confra: o motor pareava o
      // ranking GERAL plano (1º+2º do torneio) em vez de 1º+2º DE CADA GRUPO.
      //
      // Com UMA rodada o grupo é ESTÁVEL: a pessoa jogou os 3 jogos dela naquele grupo,
      // então "1º a 4º do grupo" é um fato, e Ouro = 1º+2º / Prata = 3º+4º sai direto dos
      // seletores que o organizador vê (Todos avançam + estratégia Performance + 2 linhas).
      // Com VÁRIAS rodadas os grupos rotacionam a cada sorteio e a colocação "dentro do
      // grupo" não significa nada — aí continua valendo o ranking geral plano.
      // [[project_formato_da_partida_por_fase]] · [[feedback_behavior_is_pure_function_of_config]]
      var _rrRodadaUnica = (cfg.parceria === 'rei_rainha') && (((cfg.rodadas || {}).n || 1) === 1);
      var perGroup = _rrRodadaUnica || (cfg.grupos > 1 && cfg.classifScope === 'per_group');
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
        lateEnrollment: _elimLE(e.lateEnrollment, opts), // inscrições durante a elim: herda a fase inicial por padrão
        newMatchups: _elimNM(e.newMatchups, opts),       // ⊥ de "Abertas" — a elim tem a SUA regra
        scoring: e.scoring || null,                      // formato da partida DESTA fase (null = herda t.scoring)
        drawManual: false,
        endDate: e.endDate || '', endTime: e.endTime || ''   // v1.6.80: término da ÚLTIMA fase
      });
      phases.push(p1);
    }

    // A fase INICIAL (classificatória, onde há inscrição) honra o painel "Inscrições durante a
    // fase" (t.lateEnrollment). A eliminatória (fase 2) tem o SEU próprio valor
    // (cfg.eliminatoria.lateEnrollment), já compilado acima → cada fase gerencia a sua.
    if (opts.lateEnrollment) phases[0].lateEnrollment = opts.lateEnrollment;
    if (opts.newMatchups === true || opts.newMatchups === false) phases[0].newMatchups = opts.newMatchups;
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
