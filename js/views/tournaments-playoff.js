// ─────────────────────────────────────────────────────────────────────────────
// tournaments-playoff.js — Fase Final de Temporada (playoffs de Liga)
//
// Ao fim de uma temporada de Liga, o organizador pode disparar uma fase
// eliminatória entre os melhores colocados para sagrar os campeões da temporada
// (a "confraternização + torneio extra"). Tudo configurável por toggles/botões/
// campos, por categoria.
//
// PRINCÍPIO DE ISOLAMENTO: a temporada da Liga vive inteiramente em `t.rounds`
// e a classificação (`_computeStandings`) lê de lá. A Liga NÃO usa `t.matches`.
// Por isso a chave da fase final é gravada em `t.matches` (com `m.phase`
// 'playoff' e `m.category`), o que reaproveita de graça `renderMatchCard`,
// `_saveResultInline`, `_advanceWinner` e `_autoResolveBye` — sem nunca tocar
// a classificação da temporada. Config/snapshot/qualificados/espera/evento
// ficam em campos `t.playoff*`. `t.currentStage = 'playoffs'`.
//
// Cortes: este primeiro corte cobre Eliminatória Simples, por categoria,
// seeding × sorteio, byes para os cabeças. Dupla Eliminatória, Grupos+Elim,
// e os 4 modos de formação de dupla (manual / 1º+último / sequencial /
// rodada Rei-Rainha) entram em cortes seguintes — marcados com TODO-PLAYOFF.
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  'use strict';

  var _t = window._t || function (k) { return k; };

  function _esc(s) { return window._safeHtml ? window._safeHtml(s) : String(s == null ? '' : s); }
  function _name(p) {
    if (typeof p === 'string') return p;
    return (window._pName ? window._pName(p) : ((p && (p.displayName || p.name)) || '')) || '';
  }
  function _findT(tId) {
    if (!window.AppStore || !window.AppStore.tournaments) return null;
    return window.AppStore.tournaments.find(function (x) { return String(x.id) === String(tId); }) || null;
  }
  function _isLiga(t) { return !!(window._isLigaFormat && window._isLigaFormat(t)); }
  function _isOrg(t) {
    try { return !!(window.AppStore && window.AppStore.isOrganizer && window.AppStore.isOrganizer(t)); } catch (e) { return false; }
  }

  // Categorias da fase final: as categorias reais da Liga, ou [null] quando a
  // Liga não tem categorias (chave única). Cada chave usa a chave especial
  // '_default_' no mapa de config quando cat === null.
  function _playoffCats(t) {
    var cats = (window._getTournamentCategories ? window._getTournamentCategories(t) : (t.combinedCategories || [])) || [];
    if (!cats.length) return [null];
    return cats;
  }
  function _catKey(cat) { return cat == null ? '_default_' : String(cat); }

  // Classificação congelada (snapshot) para uma categoria, ou recomputa ao vivo.
  function _standingsFor(t, cat) {
    var snap = t.playoffSnapshot && t.playoffSnapshot[_catKey(cat)];
    if (Array.isArray(snap) && snap.length) return snap;
    if (typeof window._computeStandings === 'function') {
      try { return window._computeStandings(t, cat == null ? undefined : cat) || []; } catch (e) { return []; }
    }
    return [];
  }

  // Já existe uma fase final gerada?
  function _hasPlayoff(t) {
    return t && t.currentStage === 'playoffs' &&
      Array.isArray(t.matches) && t.matches.some(function (m) { return m && m.phase === 'playoff'; });
  }
  // Algum resultado de playoff já foi lançado? (trava o "refazer")
  function _playoffHasResult(t) {
    return Array.isArray(t.matches) && t.matches.some(function (m) {
      return m && m.phase === 'playoff' && m.winner && !m.isBye;
    });
  }

  // v2.3.95: temporada da Liga "fechada" pra fase final = TODA partida de TODA
  // rodada já tem placar (winner/BYE/folga). Nenhum jogo pendente. Exige ao
  // menos um jogo real lançado. Dispara a cor verde + brilho dos botões e a
  // visibilidade do "Gerar fase final".
  function _ligaSeasonScored(t) {
    if (!_isLiga(t)) return false;
    var rounds = Array.isArray(t.rounds) ? t.rounds : [];
    if (!rounds.length) return false;
    var anyReal = false;
    for (var i = 0; i < rounds.length; i++) {
      var ms = (rounds[i] && rounds[i].matches) || [];
      for (var j = 0; j < ms.length; j++) {
        var m = ms[j];
        if (!m || m.isSitOut || m.isBye) continue;
        anyReal = true;
        if (!m.winner) return false; // jogo pendente → temporada não fechou
      }
    }
    return anyReal;
  }
  window._ligaSeasonScored = _ligaSeasonScored;

  // v2.4.2: estado do botão de fase final, em 3 fases:
  //  'pending'   → ainda há rodadas a SORTEAR (temporada não acabou) → âmbar, SEM brilho
  //  'lastRound' → última rodada já sorteada, mas faltam placares     → âmbar, COM brilho
  //  'complete'  → todos os placares lançados (temporada encerrada)   → verde, COM brilho
  // "rodadas previstas" reusa _ligaTournamentProgress (mesma conta da barra roxa).
  window._ligaPlayoffButtonState = function (t) {
    if (!t || !_isLiga(t)) return 'pending';
    var rounds = Array.isArray(t.rounds) ? t.rounds : [];
    if (!rounds.length) return 'pending'; // nem sorteou ainda
    var roundsPlanned = rounds.length;
    try {
      var prog = window._ligaTournamentProgress && window._ligaTournamentProgress(t);
      if (prog && prog.roundsPlanned) roundsPlanned = prog.roundsPlanned;
    } catch (e) {}
    // Ainda há rodadas a sortear → temporada em andamento.
    if (rounds.length < roundsPlanned) return 'pending';
    // Última rodada sorteada: verde só quando TODOS os placares estão lançados.
    return _ligaSeasonScored(t) ? 'complete' : 'lastRound';
  };

  // ───────────────────────────────────────────────────────────────────────────
  // SEEDING — ordem de slots padrão (1 vs N, 2 vs N-1, cabeças distribuídos).
  // Gera a sequência de seeds para um bracket de tamanho potência de 2.
  // Ex.: size 4 → [1,4,3,2]; size 8 → [1,8,5,4,3,6,7,2].
  // ───────────────────────────────────────────────────────────────────────────
  function _seedOrder(size) {
    var rounds = Math.log(size) / Math.log(2);
    var seeds = [1, 2];
    for (var r = 1; r < rounds; r++) {
      var next = [];
      var sum = Math.pow(2, r + 1) + 1;
      for (var i = 0; i < seeds.length; i++) {
        next.push(seeds[i]);
        next.push(sum - seeds[i]);
      }
      seeds = next;
    }
    return seeds; // 1-based seed numbers in slot order
  }

  function _nextPow2(n) {
    var p = 1;
    while (p < n) p *= 2;
    return Math.max(2, p);
  }

  function _shuffle(arr) {
    var a = arr.slice();
    // Determinístico-ish: usa índices; Math.random é bloqueado em alguns
    // contextos, mas aqui é runtime de UI normal (permitido).
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // FORMAÇÃO DE DUPLAS — a classificação da Liga é sempre por indivíduo. Quando
  // a fase final é em duplas, formamos os pares a partir dos qualificados.
  // names = nomes ordenados por classificação (1º..Nº). Retorna ["A / B", ...]
  // na ordem em que devem ser semeados (par 0 = "seed 1").
  //  - best_worst (1º+último): equilibra — melhor com pior.
  //  - sequential (1º+2º): os melhores jogam juntos.
  // (manual e rei_rainha entram em iteração seguinte.)
  // ───────────────────────────────────────────────────────────────────────────
  function _formPairs(names, mode) {
    var n = names.length;
    var pairs = [];
    if (n < 2) return pairs;
    // descarta sobra ímpar (o último fica de fora — vira lista de espera).
    var arr = names.slice();
    if (arr.length % 2 === 1) arr = arr.slice(0, arr.length - 1);
    var half = arr.length / 2;
    if (mode === 'sequential') {
      for (var i = 0; i < arr.length; i += 2) pairs.push(arr[i] + ' / ' + arr[i + 1]);
    } else { // best_worst (default)
      for (var k = 0; k < half; k++) pairs.push(arr[k] + ' / ' + arr[arr.length - 1 - k]);
    }
    return pairs;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GERAÇÃO — Eliminatória Simples para uma categoria.
  // `entrants` = array de nomes (strings), já na ordem de classificação (1º..Nº).
  // Retorna array de match objects ligados por nextMatchId/nextSlot.
  // ───────────────────────────────────────────────────────────────────────────
  function _buildSingleElim(entrants, cat, seedMode, tIdShort) {
    var N = entrants.length;
    if (N < 2) return [];
    var size = _nextPow2(N);
    var order = _seedOrder(size); // seed numbers in slot order

    // Mapeia seed number → entrant. Seeds > N são BYE.
    // No modo sorteio, embaralha a associação seed→entrant (byes caem em
    // posições aleatórias). No modo seeding, seed k = k-ésimo classificado.
    var bySeed = {};
    var ordered = (seedMode === 'sorteio') ? _shuffle(entrants) : entrants.slice();
    for (var s = 1; s <= size; s++) {
      bySeed[s] = (s <= N) ? ordered[s - 1] : 'BYE';
    }

    var slots = order.map(function (seedNum) { return bySeed[seedNum]; });

    // Constrói rodadas. Round 1 pareando slots adjacentes.
    var matches = [];
    var rounds = Math.log(size) / Math.log(2);
    var prevRoundIds = [];
    var ctr = 0;
    var stamp = (tIdShort || 'po');

    // Round 1
    var r1ids = [];
    for (var i = 0; i < size; i += 2) {
      var p1 = slots[i], p2 = slots[i + 1];
      var id = 'po-r1-' + (ctr++) + '-' + stamp;
      var m = {
        id: id, phase: 'playoff', category: cat == null ? undefined : cat,
        round: 1, p1: p1, p2: p2,
        scoreP1: null, scoreP2: null, winner: null,
        nextMatchId: null, nextSlot: null,
        isBye: (p1 === 'BYE' || p2 === 'BYE')
      };
      matches.push(m);
      r1ids.push(id);
    }
    prevRoundIds = r1ids;

    // Rounds seguintes
    for (var rr = 2; rr <= rounds; rr++) {
      var thisIds = [];
      var cnt = prevRoundIds.length / 2;
      for (var k = 0; k < cnt; k++) {
        var nid = 'po-r' + rr + '-' + k + '-' + stamp;
        matches.push({
          id: nid, phase: 'playoff', category: cat == null ? undefined : cat,
          round: rr, p1: 'TBD', p2: 'TBD',
          scoreP1: null, scoreP2: null, winner: null,
          nextMatchId: null, nextSlot: null, isBye: false
        });
        thisIds.push(nid);
        // liga os dois da rodada anterior a este
        var a = _matchById(matches, prevRoundIds[k * 2]);
        var b = _matchById(matches, prevRoundIds[k * 2 + 1]);
        if (a) { a.nextMatchId = nid; a.nextSlot = 'p1'; }
        if (b) { b.nextMatchId = nid; b.nextSlot = 'p2'; }
      }
      prevRoundIds = thisIds;
    }

    // Pré-resolve BYEs do round 1: vencedor = jogador real, avança.
    matches.forEach(function (m) {
      if (m.round === 1 && m.isBye) {
        var realPlayer = (m.p1 === 'BYE') ? m.p2 : m.p1;
        if (realPlayer && realPlayer !== 'BYE') {
          m.winner = realPlayer;
          // avança para o próximo
          if (m.nextMatchId) {
            var nx = _matchById(matches, m.nextMatchId);
            if (nx) {
              if (m.nextSlot === 'p1') nx.p1 = realPlayer;
              else if (m.nextSlot === 'p2') nx.p2 = realPlayer;
            }
          }
        }
      }
    });

    return matches;
  }
  function _matchById(arr, id) {
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GERAÇÃO — Dupla Eliminatória para uma categoria (fase final de Liga).
  // Espelha a topologia de window._buildDoubleElimBracket (tournaments-draw.js),
  // mas retorna um ARRAY PURO de matches phase:'playoff' — sem tocar colunas
  // canônicas, t.matches, nem a Liga. Cada match traz bracket 'upper'|'lower'|
  // 'grand'. Upper losers caem no lower via loserMatchId (o avanço resolve, agora
  // que reconhece phase:'playoff' && bracket). Grande final liga upper-final→p1 e
  // lower-final→p2. BYEs do upper R1 pré-resolvidos; o 'BYE' perdedor é dropado no
  // lower pra _autoResolveBye limpar quando o slot adversário preencher.
  // ───────────────────────────────────────────────────────────────────────────
  function _buildDoubleElimPlayoff(entrants, cat, seedMode, stamp) {
    var N = entrants.length;
    if (N < 2) return [];
    var size = _nextPow2(N);
    var order = _seedOrder(size);
    var bySeed = {};
    var ordered = (seedMode === 'sorteio') ? _shuffle(entrants) : entrants.slice();
    for (var s = 1; s <= size; s++) bySeed[s] = (s <= N) ? ordered[s - 1] : 'BYE';
    var slots = order.map(function (seedNum) { return bySeed[seedNum]; });

    var stp = stamp || 'po';
    var catVal = (cat == null) ? undefined : cat;
    var matches = [];
    var totalUpperRounds = Math.round(Math.log(size) / Math.LN2);

    function mk(id, round, bracket, p1, p2, label, isBye) {
      var m = {
        id: id, phase: 'playoff', category: catVal,
        round: round, bracket: bracket, label: label,
        p1: p1, p2: p2, scoreP1: null, scoreP2: null, winner: null,
        nextMatchId: null, nextSlot: null, loserMatchId: null, isBye: !!isBye
      };
      matches.push(m);
      return m;
    }

    // UPPER bracket
    var upperRounds = {};
    var u1 = [];
    for (var i = 0; i < size; i += 2) {
      var up1 = slots[i], up2 = slots[i + 1];
      u1.push(mk('po-u1-' + (i / 2) + '-' + stp, 1, 'upper', up1, up2,
        'Chave dos Vencedores — Rodada 1', (up1 === 'BYE' || up2 === 'BYE')));
    }
    upperRounds[1] = u1;
    for (var ur = 2; ur <= totalUpperRounds; ur++) {
      var prevU = upperRounds[ur - 1];
      var curU = [];
      for (var k = 0; k < prevU.length / 2; k++) {
        var um = mk('po-u' + ur + '-' + k + '-' + stp, ur, 'upper', 'TBD', 'TBD',
          'Chave dos Vencedores — Rodada ' + ur, false);
        curU.push(um);
        var a = prevU[k * 2], b = prevU[k * 2 + 1];
        if (a) { a.nextMatchId = um.id; a.nextSlot = 'p1'; }
        if (b) { b.nextMatchId = um.id; b.nextSlot = 'p2'; }
      }
      upperRounds[ur] = curU;
    }

    // LOWER bracket — rounds alternando "merge" (recebe upper losers) e "battle"
    // (vencedores do lower se enfrentam). Espelha tournaments-draw.js.
    var lowerRounds = {};
    var lrNum = 1;
    for (var ur2 = 1; ur2 <= totalUpperRounds; ur2++) {
      if (ur2 === 1) {
        var cnt1 = Math.ceil(upperRounds[1].length / 2);
        var lr1 = [];
        for (var li = 0; li < cnt1; li++) {
          lr1.push(mk('po-l' + lrNum + '-' + li + '-' + stp, lrNum, 'lower', 'TBD', 'TBD',
            'Repescagem — Rodada ' + lrNum, false));
        }
        lowerRounds[lrNum] = lr1;
        upperRounds[1].forEach(function (um, idx) {
          var lowerIdx = Math.floor(idx / 2);
          if (lr1[lowerIdx]) um.loserMatchId = lr1[lowerIdx].id;
        });
        lrNum++;
      } else {
        var mergeCount = (lowerRounds[lrNum - 1] || []).length;
        var lrM = [];
        for (var mi = 0; mi < mergeCount; mi++) {
          lrM.push(mk('po-l' + lrNum + '-' + mi + '-' + stp, lrNum, 'lower', 'TBD', 'TBD',
            'Repescagem — Rodada ' + lrNum, false));
        }
        lowerRounds[lrNum] = lrM;
        (lowerRounds[lrNum - 1] || []).forEach(function (lm, idx) {
          if (lrM[idx]) lm.nextMatchId = lrM[idx].id;
        });
        upperRounds[ur2].forEach(function (um, idx) {
          if (lrM[idx]) um.loserMatchId = lrM[idx].id;
        });
        lrNum++;
        if (mergeCount > 1) {
          var battleCount = Math.ceil(mergeCount / 2);
          var lrB = [];
          for (var bi = 0; bi < battleCount; bi++) {
            lrB.push(mk('po-l' + lrNum + '-' + bi + '-' + stp, lrNum, 'lower', 'TBD', 'TBD',
              'Repescagem — Rodada ' + lrNum, false));
          }
          lowerRounds[lrNum] = lrB;
          (lowerRounds[lrNum - 1] || []).forEach(function (lm, idx) {
            var nextIdx = Math.floor(idx / 2);
            if (lrB[nextIdx]) lm.nextMatchId = lrB[nextIdx].id;
          });
          lrNum++;
        }
      }
    }

    // GRANDE FINAL — upper-final (p1) vs lower-final (p2). (Sem bracket reset no
    // V1: jogo único, igual à dupla-elim normal de hoje — limitação documentada.)
    var gf = mk('po-gf-' + stp, totalUpperRounds + 1, 'grand', 'TBD', 'TBD', '🏆 Grande Final', false);
    var upperFinal = upperRounds[totalUpperRounds];
    if (upperFinal && upperFinal[0]) { upperFinal[0].nextMatchId = gf.id; upperFinal[0].nextSlot = 'p1'; }
    var lastLower = lowerRounds[lrNum - 1];
    if (lastLower && lastLower[0]) { lastLower[0].nextMatchId = gf.id; lastLower[0].nextSlot = 'p2'; }

    // Pré-resolve BYEs do upper R1: vencedor avança; 'BYE' perdedor cai no lower.
    upperRounds[1].forEach(function (m) {
      if (!m.isBye) return;
      var real = (m.p1 === 'BYE') ? m.p2 : m.p1;
      if (real && real !== 'BYE') {
        m.winner = real;
        if (m.nextMatchId) {
          var nx = _matchById(matches, m.nextMatchId);
          if (nx) {
            if (m.nextSlot === 'p1') nx.p1 = real;
            else if (m.nextSlot === 'p2') nx.p2 = real;
          }
        }
      }
      if (m.loserMatchId) {
        var lm = _matchById(matches, m.loserMatchId);
        if (lm) {
          if (!lm.p1 || lm.p1 === 'TBD') lm.p1 = 'BYE';
          else if (!lm.p2 || lm.p2 === 'TBD') lm.p2 = 'BYE';
        }
      }
    });

    return matches;
  }

  // Total de rodadas (para rótulos Final/Semi/Quartas).
  function _roundLabel(roundNum, totalRounds) {
    var fromEnd = totalRounds - roundNum; // 0 = final
    if (fromEnd === 0) return '🏆 ' + (_t('playoff.final') || 'Final');
    if (fromEnd === 1) return _t('playoff.semi') || 'Semifinais';
    if (fromEnd === 2) return _t('playoff.quarter') || 'Quartas';
    return (_t('playoff.round') || 'Rodada') + ' ' + roundNum;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // PÁGINA DE CONFIGURAÇÃO — #fase-final/:tId (page-route padrão centralizado)
  // ───────────────────────────────────────────────────────────────────────────
  window.renderFaseFinalPage = function (container, tId) {
    var t = _findT(tId);
    if (!t || !_isLiga(t)) { window.location.replace('#dashboard'); return; }
    if (!_isOrg(t)) {
      container.innerHTML = (window._renderBackHeader ? window._renderBackHeader({ href: '#tournaments/' + tId, label: 'Voltar' }) : '') +
        '<div style="padding:2rem;text-align:center;color:var(--text-muted);">' + (_t('playoff.orgOnly') || 'Apenas o organizador configura a fase final.') + '</div>';
      return;
    }

    var hdr = window._renderBackHeader({
      href: '#tournaments/' + tId,
      label: 'Voltar',
      middleHtml: '<span style="font-size:0.9rem;font-weight:700;color:var(--text-bright);">🏆 ' + (_t('playoff.title') || 'Fase Final da Temporada') + '</span>'
    });

    // Se já gerada → tela de status (refazer / ir para a chave).
    if (_hasPlayoff(t)) {
      container.innerHTML = hdr + _renderAlreadyGeneratedBody(t);
      if (window._reflowChrome) window._reflowChrome();
      return;
    }

    // v2.3.97/v2.4.2: botão "Gerar fase final" fixo no topo, abaixo do cabeçalho.
    // Verde + brilho, SÓ visível quando a TEMPORADA terminou ('complete' = última
    // rodada sorteada E todos os placares lançados). Antes disso, aviso por fase.
    var _poState = (typeof window._ligaPlayoffButtonState === 'function') ? window._ligaPlayoffButtonState(t) : 'pending';
    var _topBar = (_poState === 'complete')
      ? '<div style="position:sticky;top:60px;z-index:20;background:var(--bg-dark);padding:10px 1rem;border-bottom:1px solid rgba(255,255,255,0.08);text-align:center;">' +
          '<button type="button" class="btn btn-shine" onclick="window._reviewPlayoff(\'' + _esc(t.id) + '\')" style="background:#10b981;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:700;min-width:240px;">🏆 ' + (_t('playoff.generate') || 'Gerar fase final') + '</button>' +
        '</div>'
      : '<div style="padding:10px 1rem;text-align:center;font-size:0.8rem;color:var(--text-muted);background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.06);">⏳ ' +
          (_poState === 'lastRound'
            ? 'Última rodada sorteada — o botão <b>Gerar fase final</b> aparece quando <b>todos os placares</b> forem lançados.'
            : 'O botão <b>Gerar fase final</b> aparece quando a fase de Liga terminar (todas as rodadas sorteadas e com placar).') +
        '</div>';

    container.innerHTML = hdr + _topBar + _renderConfigBody(t);
    if (window._reflowChrome) window._reflowChrome();
    // popula previews iniciais
    setTimeout(function () { _refreshAllPreviews(t); }, 30);
  };

  function _renderAlreadyGeneratedBody(t) {
    var canRedo = !_playoffHasResult(t);
    return '<div style="padding:1rem;max-width:560px;margin:0 auto;">' +
      '<div style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25);border-radius:12px;padding:1rem;text-align:center;">' +
        '<div style="font-size:1.1rem;font-weight:800;color:#34d399;margin-bottom:6px;">✅ ' + (_t('playoff.alreadyGenerated') || 'Fase final já gerada') + '</div>' +
        '<p style="color:var(--text-muted);font-size:0.85rem;margin:0 0 1rem;">' + (_t('playoff.alreadyGeneratedDesc') || 'A chave está disponível na página do torneio, abaixo da classificação.') + '</p>' +
        '<a href="#tournaments/' + _esc(t.id) + '" class="btn btn-primary" style="display:inline-block;">' + (_t('playoff.goToBracket') || 'Ver a chave') + '</a>' +
      '</div>' +
      (canRedo
        ? '<div style="margin-top:1rem;text-align:center;">' +
            '<button type="button" class="btn btn-outline btn-sm" onclick="window._redoPlayoff(\'' + _esc(t.id) + '\')" style="color:#f87171;border-color:rgba(248,113,113,0.4);">↺ ' + (_t('playoff.redo') || 'Refazer fase final') + '</button>' +
            '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:6px;">' + (_t('playoff.redoHint') || 'Disponível até o primeiro placar ser lançado.') + '</div>' +
          '</div>'
        : '<div style="margin-top:1rem;text-align:center;font-size:0.75rem;color:var(--text-muted);">' + (_t('playoff.redoLocked') || 'A fase final já tem resultados — não é mais possível refazer.') + '</div>') +
    '</div>';
  }

  function _renderConfigBody(t) {
    var cats = _playoffCats(t);
    var multiCat = cats.length > 1;

    var html = '<div style="padding:1rem;max-width:620px;margin:0 auto;">';

    // Intro
    html += '<p style="color:var(--text-muted);font-size:0.85rem;line-height:1.5;margin:0 0 1rem;">' +
      (_t('playoff.intro') || 'Configure a disputa final entre os melhores colocados da temporada. Você decide quantos entram, o formato e os confrontos.') + '</p>';

    // Bloco Playoffs: data (1 linha) e local (outra linha) do evento da fase final.
    html += '<div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.22);border-radius:12px;padding:0.9rem;margin-bottom:1rem;">' +
      '<p style="margin:0 0 0.6rem;font-size:0.78rem;font-weight:700;color:#a5b4fc;text-transform:uppercase;letter-spacing:0.5px;">🏆 ' + (_t('playoff.eventSection') || 'Playoffs') + '</p>' +
      '<div class="form-group" style="margin:0 0 0.6rem;">' +
        '<label class="form-label" style="font-size:0.7rem;">' + (_t('playoff.eventDate') || 'Data') + '</label>' +
        '<input type="datetime-local" class="form-control" id="po-event-date" value="' + _esc((t.playoffEvent && t.playoffEvent.date) || '') + '" style="padding:6px 8px;font-size:0.85rem;box-sizing:border-box;min-width:0;width:100%;">' +
      '</div>' +
      '<div class="form-group" style="margin:0;">' +
        '<label class="form-label" style="font-size:0.7rem;">' + (_t('playoff.eventVenue') || 'Local') + '</label>' +
        '<input type="text" class="form-control" id="po-event-venue" value="' + _esc((t.playoffEvent && t.playoffEvent.venue) || t.venue || '') + '" placeholder="' + (_t('playoff.eventVenuePh') || 'Onde será') + '" style="padding:6px 8px;font-size:0.85rem;box-sizing:border-box;min-width:0;width:100%;">' +
      '</div>' +
    '</div>';

    // Config por categoria (ou única)
    cats.forEach(function (cat, idx) {
      html += _renderCatConfigBlock(t, cat, idx, multiCat);
    });

    // v2.3.97: o botão "Gerar fase final" agora é fixo no topo (renderFaseFinalPage).
    // Aqui fica só a dica de que a classificação congela ao gerar.
    html += '<div style="margin-top:1rem;text-align:center;font-size:0.72rem;color:var(--text-muted);">' +
      (_t('playoff.generateHint') || 'Ao gerar a fase final, a classificação da temporada é congelada.') + '</div>';

    html += '</div>';
    return html;
  }

  function _renderCatConfigBlock(t, cat, idx, multiCat) {
    var ck = _catKey(cat);
    var standings = _standingsFor(t, cat);
    var total = standings.length;
    var prev = (t.playoffConfigByCat && t.playoffConfigByCat[ck]) || {};
    var defQualify = prev.qualifyCount || Math.min(8, _nextPow2(Math.max(2, Math.min(total, 8))));
    if (defQualify > total) defQualify = total;
    var seedMode = prev.seedMode || 'seeding';
    var active = (prev.active !== false);

    var title = multiCat ? ('📂 ' + _esc(cat)) : ('🏁 ' + (_t('playoff.singleBracket') || 'Fase final'));

    var h = '<div class="po-cat-block" data-po-cat="' + _esc(ck) + '" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.22);border-radius:12px;padding:0.9rem;margin-bottom:0.9rem;">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:0.6rem;">' +
      '<span style="font-size:0.9rem;font-weight:800;color:#fbbf24;">' + title + '</span>';
    if (multiCat) {
      h += '<label class="toggle-switch" style="flex-shrink:0;"><input type="checkbox" class="po-active" ' + (active ? 'checked' : '') + ' onchange="window._togglePoCat(this)"><span class="toggle-slider"></span></label>';
    } else {
      h += '<input type="hidden" class="po-active" value="1">';
    }
    h += '</div>';

    h += '<div class="po-cat-inner" style="' + (active ? '' : 'opacity:0.4;pointer-events:none;') + '">';

    // total disponível
    h += '<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">' +
      (_t('playoff.totalClassified') || 'Classificados na temporada') + ': <b style="color:var(--text-bright);">' + total + '</b></div>';

    // quantos disputam
    h += '<div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:0.6rem;">' +
      '<div class="form-group" style="margin:0;">' +
        '<label class="form-label" style="font-size:0.72rem;">' + (_t('playoff.qualifyCount') || 'Quantos disputam') + '</label>' +
        '<input type="number" class="form-control po-qualify" min="2" max="' + Math.max(2, total) + '" value="' + defQualify + '" oninput="window._onPoConfigChange(this)" style="width:80px;padding:6px 8px;font-size:0.9rem;text-align:center;">' +
      '</div>' +
      // seed mode
      '<div class="form-group" style="margin:0;flex:1;min-width:200px;">' +
        '<label class="form-label" style="font-size:0.72rem;">' + (_t('playoff.confronts') || 'Confrontos') + '</label>' +
        '<input type="hidden" class="po-seedmode" value="' + _esc(seedMode) + '">' +
        '<div style="display:flex;gap:6px;">' +
          _seedBtn('seeding', seedMode, _t('playoff.seedByRank') || 'Por classificação') +
          _seedBtn('sorteio', seedMode, _t('playoff.seedRandom') || 'Sorteio') +
        '</div>' +
      '</div>' +
    '</div>';

    // formato (1º corte: só Simples ativo)
    h += '<div class="form-group" style="margin:0 0 0.4rem;">' +
      '<label class="form-label" style="font-size:0.72rem;">' + (_t('playoff.format') || 'Formato') + '</label>' +
      '<input type="hidden" class="po-format" value="' + _esc(prev.format || 'simples') + '">' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
        _fmtBtn('simples', prev.format || 'simples', _t('playoff.fmtSingle') || 'Eliminatória Simples', false) +
        _fmtBtn('dupla', prev.format || 'simples', _t('playoff.fmtDouble') || 'Dupla Eliminatória', !(window._flag && window._flag('playoff-double-elim'))) +
        _fmtBtn('grupos_elim', prev.format || 'simples', _t('playoff.fmtGroups') || 'Grupos + Elim.', true) +
      '</div>' +
      '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;">' + ((window._flag && window._flag('playoff-double-elim')) ? 'Grupos+Elim. chega em breve.' : (_t('playoff.fmtSoon') || 'Dupla Eliminatória e Grupos+Elim. chegam em breve.')) + '</div>' +
    '</div>';

    // modo de disputa (duplas) — só relevante quando o esporte é de duplas.
    var isDoubles = (parseInt(t.teamSize, 10) || 1) >= 2;
    var pairMode = prev.pairMode || (isDoubles ? 'best_worst' : 'individual');
    if (isDoubles) {
      h += '<div class="form-group" style="margin:0 0 0.4rem;">' +
        '<label class="form-label" style="font-size:0.72rem;">' + (_t('playoff.pairing') || 'Formação das duplas') + '</label>' +
        '<input type="hidden" class="po-pairmode" value="' + _esc(pairMode) + '">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          _pairBtn('individual', pairMode, _t('playoff.pairIndividual') || 'Individual', false) +
          _pairBtn('best_worst', pairMode, _t('playoff.pairBestWorst') || '1º + último', false) +
          _pairBtn('sequential', pairMode, _t('playoff.pairSequential') || 'Sequencial', false) +
          _pairBtn('rei_rainha', pairMode, _t('playoff.pairReiRainha') || 'Rei/Rainha', true) +
        '</div>' +
        '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;">' + (_t('playoff.pairHint') || 'Como os classificados serão pareados em duplas para o mata-mata.') + '</div>' +
      '</div>';
    } else {
      h += '<input type="hidden" class="po-pairmode" value="individual">';
    }

    // preview de classificados + lista de espera
    h += '<div class="po-preview" id="po-preview-' + _esc(ck) + '" style="margin-top:0.6rem;"></div>';

    h += '</div>'; // inner
    h += '</div>'; // block
    return h;
  }

  function _seedBtn(val, current, label) {
    var on = (val === current);
    return '<button type="button" class="po-seed-btn" data-val="' + val + '" onclick="window._selectPoSeed(this)" style="flex:1;min-width:0;padding:7px 8px;border-radius:10px;font-size:0.72rem;cursor:pointer;border:2px solid ' +
      (on ? '#fbbf24;background:rgba(245,158,11,0.18);color:#fbbf24' : 'rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main)') +
      ';font-weight:600;text-align:center;">' + _esc(label) + '</button>';
  }
  function _fmtBtn(val, current, label, soon) {
    var on = (val === current);
    var dis = soon ? ' disabled' : '';
    var op = soon ? 'opacity:0.45;cursor:not-allowed;' : 'cursor:pointer;';
    return '<button type="button" class="po-fmt-btn" data-val="' + val + '"' + dis + ' onclick="window._selectPoFormat(this)" style="' + op + 'flex:1;min-width:90px;padding:7px 8px;border-radius:10px;font-size:0.72rem;border:2px solid ' +
      (on ? '#fbbf24;background:rgba(245,158,11,0.18);color:#fbbf24' : 'rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main)') +
      ';font-weight:600;text-align:center;">' + _esc(label) + (soon ? ' 🔒' : '') + '</button>';
  }
  function _pairBtn(val, current, label, soon) {
    var on = (val === current);
    var dis = soon ? ' disabled' : '';
    var op = soon ? 'opacity:0.45;cursor:not-allowed;' : 'cursor:pointer;';
    return '<button type="button" class="po-pair-btn" data-val="' + val + '"' + dis + ' onclick="window._selectPoPair(this)" style="' + op + 'flex:1;min-width:80px;padding:7px 8px;border-radius:10px;font-size:0.72rem;border:2px solid ' +
      (on ? '#fbbf24;background:rgba(245,158,11,0.18);color:#fbbf24' : 'rgba(255,255,255,0.18);background:rgba(255,255,255,0.06);color:var(--text-main)') +
      ';font-weight:600;text-align:center;">' + _esc(label) + (soon ? ' 🔒' : '') + '</button>';
  }

  // toggle handlers (globais)
  window._togglePoCat = function (cb) {
    var block = cb.closest('.po-cat-block');
    if (!block) return;
    var inner = block.querySelector('.po-cat-inner');
    if (inner) {
      inner.style.opacity = cb.checked ? '' : '0.4';
      inner.style.pointerEvents = cb.checked ? '' : 'none';
    }
  };
  window._selectPoSeed = function (btn) {
    var wrap = btn.parentNode;
    var hidden = btn.closest('.form-group').querySelector('.po-seedmode');
    if (hidden) hidden.value = btn.getAttribute('data-val');
    Array.prototype.forEach.call(wrap.querySelectorAll('.po-seed-btn'), function (b) {
      var on = (b === btn);
      b.style.border = '2px solid ' + (on ? '#fbbf24' : 'rgba(255,255,255,0.18)');
      b.style.background = on ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)';
      b.style.color = on ? '#fbbf24' : 'var(--text-main)';
    });
    var t = window._poCurrentT; if (t) _refreshPreview(t, btn.closest('.po-cat-block'));
  };
  window._selectPoFormat = function (btn) {
    if (btn.disabled) return;
    var block = btn.closest('.po-cat-block');
    var hidden = block.querySelector('.po-format');
    if (hidden) hidden.value = btn.getAttribute('data-val');
    Array.prototype.forEach.call(block.querySelectorAll('.po-fmt-btn'), function (b) {
      if (b.disabled) return;
      var on = (b === btn);
      b.style.border = '2px solid ' + (on ? '#fbbf24' : 'rgba(255,255,255,0.18)');
      b.style.background = on ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)';
      b.style.color = on ? '#fbbf24' : 'var(--text-main)';
    });
  };
  window._selectPoPair = function (btn) {
    if (btn.disabled) return;
    var block = btn.closest('.po-cat-block');
    var hidden = block.querySelector('.po-pairmode');
    if (hidden) hidden.value = btn.getAttribute('data-val');
    Array.prototype.forEach.call(block.querySelectorAll('.po-pair-btn'), function (b) {
      if (b.disabled) return;
      var on = (b === btn);
      b.style.border = '2px solid ' + (on ? '#fbbf24' : 'rgba(255,255,255,0.18)');
      b.style.background = on ? 'rgba(245,158,11,0.18)' : 'rgba(255,255,255,0.06)';
      b.style.color = on ? '#fbbf24' : 'var(--text-main)';
    });
    var t = window._poCurrentT; if (t) _refreshPreview(t, block);
  };
  window._onPoConfigChange = function (input) {
    var t = window._poCurrentT; if (!t) return;
    _refreshPreview(t, input.closest('.po-cat-block'));
  };

  // Preview de classificados + lista de espera por categoria.
  function _refreshAllPreviews(t) {
    window._poCurrentT = t;
    var blocks = document.querySelectorAll('.po-cat-block');
    Array.prototype.forEach.call(blocks, function (b) { _refreshPreview(t, b); });
  }
  function _refreshPreview(t, block) {
    if (!block) return;
    var ck = block.getAttribute('data-po-cat');
    var cat = (ck === '_default_') ? null : ck;
    var qEl = block.querySelector('.po-qualify');
    var n = parseInt(qEl && qEl.value, 10) || 0;
    var standings = _standingsFor(t, cat);
    var target = block.querySelector('.po-preview');
    if (!target) return;
    if (n < 2) { target.innerHTML = '<div style="font-size:0.75rem;color:#f87171;">' + (_t('playoff.minTwo') || 'Mínimo de 2 participantes.') + '</div>'; return; }
    if (n > standings.length) n = standings.length;

    var qualified = standings.slice(0, n);
    var waitlist = standings.slice(n, n + 4);
    var pairModeEl = block.querySelector('.po-pairmode');
    var pairMode = pairModeEl ? pairModeEl.value : 'individual';

    var h = '<div style="background:rgba(0,0,0,0.18);border-radius:10px;padding:8px 10px;">';
    h += '<div style="font-size:0.72rem;font-weight:700;color:#34d399;margin-bottom:4px;">✅ ' + (_t('playoff.qualified') || 'Classificados') + ' (' + qualified.length + ')</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
    qualified.forEach(function (s, i) {
      h += '<span style="font-size:0.72rem;background:rgba(16,185,129,0.14);border:1px solid rgba(16,185,129,0.3);border-radius:20px;padding:2px 8px;color:var(--text-bright);">' +
        '<b style="color:#34d399;">' + (i + 1) + 'º</b> ' + _esc(s.name) + '</span>';
    });
    h += '</div>';

    // Preview das duplas formadas (quando modo de duplas, exceto rei_rainha)
    if (pairMode && pairMode !== 'individual' && pairMode !== 'rei_rainha') {
      var pairs = _formPairs(qualified.map(function (s) { return s.name; }), pairMode);
      if (pairs.length) {
        h += '<div style="font-size:0.72rem;font-weight:700;color:#a5b4fc;margin-bottom:4px;">👥 ' + (_t('playoff.pairsFormed') || 'Duplas') + ' (' + pairs.length + ')</div>';
        h += '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px;">';
        pairs.forEach(function (pr, i) {
          h += '<span style="font-size:0.72rem;background:rgba(99,102,241,0.14);border:1px solid rgba(99,102,241,0.3);border-radius:20px;padding:2px 8px;color:var(--text-bright);">' +
            '<b style="color:#a5b4fc;">' + (i + 1) + '</b> ' + _esc(pr) + '</span>';
        });
        h += '</div>';
      }
    }
    if (waitlist.length) {
      h += '<div style="font-size:0.72rem;font-weight:700;color:#fbbf24;margin-bottom:4px;">🕓 ' + (_t('playoff.waitlist') || 'Lista de espera') + '</div>';
      h += '<div style="display:flex;flex-wrap:wrap;gap:4px;">';
      waitlist.forEach(function (s, i) {
        h += '<span style="font-size:0.7rem;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:20px;padding:2px 8px;color:var(--text-muted);">' +
          (n + i + 1) + 'º ' + _esc(s.name) + '</span>';
      });
      h += '</div>';
    }
    h += '</div>';
    target.innerHTML = h;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // GERAÇÃO (confirmar)
  // ───────────────────────────────────────────────────────────────────────────
  // Builds pendentes (entre "Gerar fase final" → revisão → "Publicar"), por tId.
  var _pendingBuilds = {};

  // Lê a config do DOM e monta a chave SEM gravar nada. Retorna o build ou null.
  function _buildPlayoffFromDom(t) {
    function multiLabel(cat) { return cat == null ? (_t('playoff.singleBracket') || 'Fase final') : cat; }
    var evDate = (document.getElementById('po-event-date') || {}).value || '';
    var evVenue = (document.getElementById('po-event-venue') || {}).value || '';

    var cats = _playoffCats(t);
    var configByCat = {};
    var snapshot = {};
    var qualifiedByCat = {};
    var waitlistByCat = {};
    var allMatches = [];
    var anyActive = false;

    var blocks = document.querySelectorAll('.po-cat-block');
    var blockByCk = {};
    Array.prototype.forEach.call(blocks, function (b) { blockByCk[b.getAttribute('data-po-cat')] = b; });

    for (var ci = 0; ci < cats.length; ci++) {
      var cat = cats[ci];
      var ck = _catKey(cat);
      var block = blockByCk[ck];
      if (!block) continue;
      var activeEl = block.querySelector('.po-active');
      var active = activeEl ? (activeEl.type === 'checkbox' ? activeEl.checked : activeEl.value === '1') : true;
      var qualify = parseInt((block.querySelector('.po-qualify') || {}).value, 10) || 0;
      var seedMode = (block.querySelector('.po-seedmode') || {}).value || 'seeding';
      var format = (block.querySelector('.po-format') || {}).value || 'simples';
      var pairMode = (block.querySelector('.po-pairmode') || {}).value || 'individual';

      configByCat[ck] = { active: active, qualifyCount: qualify, seedMode: seedMode, format: format, pairMode: pairMode };
      if (!active) continue;

      var standings = _standingsFor(t, cat);
      if (qualify < 2 || standings.length < 2) {
        if (typeof showNotification === 'function') {
          showNotification('⚠️ ' + (_t('playoff.tooFew') || 'Poucos classificados'),
            (multiLabel(cat)) + ' — ' + (_t('playoff.tooFewDesc') || 'são necessários ao menos 2.'), 'warning');
        }
        continue;
      }
      if (qualify > standings.length) qualify = standings.length;

      anyActive = true;
      snapshot[ck] = standings.slice();
      var qualified = standings.slice(0, qualify);
      var qualifiedNames = qualified.map(function (s) { return s.name; });
      qualifiedByCat[ck] = qualifiedNames.slice();
      waitlistByCat[ck] = standings.slice(qualify).map(function (s) { return s.name; });

      var entrants = qualifiedNames;
      if (pairMode && pairMode !== 'individual' && pairMode !== 'rei_rainha') {
        entrants = _formPairs(qualifiedNames, pairMode);
        if (entrants.length < 2) {
          if (typeof showNotification === 'function') {
            showNotification('⚠️', (multiLabel(cat)) + ' — ' + (_t('playoff.pairTooFew') || 'duplas insuficientes (mínimo 2 duplas).'), 'warning');
          }
          continue;
        }
      }

      var stamp = String(t.id).slice(-4) + '-' + ck.replace(/[^a-z0-9]/gi, '').slice(0, 6);
      var useDouble = (format === 'dupla' && window._flag && window._flag('playoff-double-elim'));
      // V1 da Dupla Eliminatória de playoff: exige potência de 2 (4/8/16/32).
      // Com byes na chave de perdedores o auto-resolve do app é inconsistente
      // (label de BYE divergente em todo o codebase) — restrição honesta até a
      // limpeza dos byes. Eliminatória simples não tem essa restrição.
      var en = entrants.length;
      if (useDouble && (en & (en - 1)) !== 0) {
        if (typeof showNotification === 'function') {
          showNotification('⚠️ Dupla Eliminatória',
            (multiLabel(cat)) + ' — por enquanto a Dupla Eliminatória exige um número potência de 2 (4, 8, 16, 32). Você tem ' + en + '. Ajuste "Quantos disputam" ou use Eliminatória Simples.', 'warning');
        }
        continue;
      }
      var built = useDouble
        ? _buildDoubleElimPlayoff(entrants, cat, seedMode, stamp)
        : _buildSingleElim(entrants, cat, seedMode, stamp);
      allMatches = allMatches.concat(built);
    }

    if (!anyActive) {
      if (typeof showNotification === 'function') {
        showNotification('⚠️ ' + (_t('playoff.nothing') || 'Nada a gerar'), (_t('playoff.nothingDesc') || 'Ative ao menos uma categoria com 2+ classificados.'), 'warning');
      }
      return null;
    }
    // Todas as categorias ativas foram puladas (ex.: Dupla Eliminatória sem
    // potência de 2) — já avisamos por categoria; não gerar chave vazia.
    if (!allMatches.length) return null;
    return {
      event: { date: evDate, venue: evVenue },
      configByCat: configByCat, snapshot: snapshot,
      qualifiedByCat: qualifiedByCat, waitlistByCat: waitlistByCat,
      allMatches: allMatches
    };
  }

  // "Gerar fase final" → revisa (chave montada do config) com Voltar/Publicar.
  window._reviewPlayoff = function (tId) {
    var t = _findT(tId);
    if (!t || !_isOrg(t)) return;
    if (typeof window._ligaPlayoffButtonState === 'function' && window._ligaPlayoffButtonState(t) !== 'complete') {
      if (typeof showNotification === 'function') showNotification('Liga ainda em andamento', 'A fase final só pode ser gerada quando a temporada terminar — todas as rodadas sorteadas e com placar.', 'warning');
      return;
    }
    var build = _buildPlayoffFromDom(t);
    if (!build) return; // avisos já mostrados
    _pendingBuilds[String(tId)] = build;
    var tPrev = Object.assign({}, t, {
      matches: (t.matches || []).filter(function (m) { return m && m.phase !== 'playoff'; }).concat(build.allMatches),
      currentStage: 'playoffs',
      playoffStatus: 'preview',
      playoffEvent: build.event,
      playoffSnapshot: build.snapshot
    });
    var container = document.getElementById('view-container');
    if (!container) return;
    var hdr = window._renderBackHeader ? window._renderBackHeader({ href: '#fase-final/' + tId, label: 'Voltar', middleHtml: '<span style="font-size:0.9rem;font-weight:700;color:var(--text-bright);">🔍 Revisar fase final</span>' }) : '';
    container.innerHTML = hdr + '<div style="padding:1rem;max-width:680px;margin:0 auto;">' + window._renderPlayoffSection(tPrev, 'review') + '</div>';
    if (window._reflowChrome) window._reflowChrome();
    window.scrollTo(0, 0);
  };

  // "Publicar torneio" → grava a chave em PREVIEW (aguardando Iniciar) e vai ao chaveamento.
  window._publishPlayoff = function (tId) {
    var t = _findT(tId);
    if (!t || !_isOrg(t)) return;
    var build = _pendingBuilds[String(tId)];
    if (!build) { window._reviewPlayoff(tId); return; } // perdeu o build → recomputa
    t.playoffConfigByCat = build.configByCat;
    t.playoffSnapshot = build.snapshot;
    t.playoffQualified = build.qualifiedByCat;
    t.playoffWaitlist = build.waitlistByCat;
    t.playoffEvent = build.event;
    t.playoffStartedAt = new Date().toISOString();
    t.playoffEnabled = true;
    t.playoffStatus = 'preview'; // publicado, mas só vale após "Iniciar torneio"
    t.matches = (t.matches || []).filter(function (m) { return m && m.phase !== 'playoff'; }).concat(build.allMatches);
    t.currentStage = 'playoffs';
    delete _pendingBuilds[String(tId)];
    try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
    if (typeof showNotification === 'function') {
      showNotification('🏆 ' + (_t('playoff.published') || 'Fase final publicada!'), (_t('playoff.publishedDesc') || 'A chave está no topo do chaveamento. Clique "Iniciar torneio" para liberar os placares.'), 'success');
    }
    window.location.hash = '#tournaments/' + t.id;
  };

  // Back-compat: o nome antigo agora abre a revisão.
  window._generatePlayoff = function (tId) { window._reviewPlayoff(tId); };

  window._redoPlayoff = function (tId) {
    var t = _findT(tId);
    if (!t || !_isOrg(t)) return;
    if (_playoffHasResult(t)) {
      if (typeof showNotification === 'function') showNotification('⚠️', (_t('playoff.redoLocked') || 'Já há resultados.'), 'warning');
      return;
    }
    var doIt = function () {
      t.matches = (t.matches || []).filter(function (m) { return m && m.phase !== 'playoff'; });
      t.currentStage = (t.format === 'Liga' || t.format === 'Ranking') ? null : t.currentStage;
      t.playoffStartedAt = null;
      try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
      window.location.hash = '#fase-final/' + t.id;
      setTimeout(function () { if (window._routerHandler) window._routerHandler(); }, 20);
    };
    if (typeof showConfirmDialog === 'function') {
      showConfirmDialog((_t('playoff.redo') || 'Refazer fase final?'), (_t('playoff.redoConfirm') || 'A chave atual será descartada e você poderá reconfigurar.'), doIt, null, { confirmText: (_t('playoff.redo') || 'Refazer'), cancelText: (_t('btn.cancel') || 'Cancelar') });
    } else { doIt(); }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // SUBSTITUIÇÃO / W.O. — organizador, em partida pendente da fase final.
  // Substituir: troca um lado pelo próximo da lista de espera (só individual —
  // a espera é de indivíduos). W.O.: o lado presente vence e avança.
  // ───────────────────────────────────────────────────────────────────────────
  window._playoffSub = function (tId, matchId) {
    var t = _findT(tId);
    if (!t || !_isOrg(t)) return;
    var m = (t.matches || []).filter(function (x) { return x.phase === 'playoff' && String(x.id) === String(matchId); })[0];
    if (!m || m.winner) return;
    var ck = m.category == null ? '_default_' : m.category;
    var waitlist = (t.playoffWaitlist && t.playoffWaitlist[ck]) || [];
    var nextSub = waitlist.length ? waitlist[0] : null;

    // remove overlay anterior
    var old = document.getElementById('po-sub-overlay'); if (old) old.remove();
    var ov = document.createElement('div');
    ov.id = 'po-sub-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10040;display:flex;align-items:center;justify-content:center;padding:1rem;';
    function sideRow(slot, name) {
      var isPair = String(name).indexOf(' / ') !== -1;
      var rows = '<div style="background:var(--bg-dark);border:1px solid var(--border-color);border-radius:10px;padding:10px;margin-bottom:8px;">' +
        '<div style="font-weight:700;color:var(--text-bright);margin-bottom:6px;">' + _esc(name) + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">';
      if (nextSub && !isPair) {
        rows += '<button type="button" class="btn btn-success btn-sm" onclick="window._playoffDoSub(\'' + _esc(tId) + '\',\'' + _esc(matchId) + '\',\'' + slot + '\')" style="font-size:0.72rem;">↪ ' + (_t('playoff.subWith') || 'Substituir por') + ' ' + _esc(nextSub) + '</button>';
      }
      rows += '<button type="button" class="btn btn-outline btn-sm" onclick="window._playoffDoWO(\'' + _esc(tId) + '\',\'' + _esc(matchId) + '\',\'' + slot + '\')" style="font-size:0.72rem;color:#f87171;border-color:rgba(248,113,113,0.4);">⚠️ ' + (_t('playoff.woHere') || 'Ausente — adversário vence') + '</button>';
      rows += '</div></div>';
      return rows;
    }
    ov.innerHTML = '<div style="background:var(--bg-card);border-radius:14px;padding:1rem;max-width:420px;width:100%;">' +
      '<div style="font-size:1rem;font-weight:800;color:#fbbf24;margin-bottom:4px;">⚠️ ' + (_t('playoff.substitute') || 'Substituir / W.O.') + '</div>' +
      '<div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:0.8rem;">' + (nextSub ? ((_t('playoff.nextInLine') || 'Próximo da lista de espera') + ': <b style="color:var(--text-bright);">' + _esc(nextSub) + '</b>') : (_t('playoff.noWaitlist') || 'Sem lista de espera disponível.')) + '</div>' +
      sideRow('p1', m.p1) +
      sideRow('p2', m.p2) +
      '<div style="text-align:right;margin-top:6px;"><button type="button" class="btn btn-outline btn-sm" onclick="var o=document.getElementById(\'po-sub-overlay\');if(o)o.remove();">' + (_t('btn.cancel') || 'Cancelar') + '</button></div>' +
    '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  window._playoffDoSub = function (tId, matchId, slot) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var m = (t.matches || []).filter(function (x) { return x.phase === 'playoff' && String(x.id) === String(matchId); })[0];
    if (!m || m.winner) return;
    var ck = m.category == null ? '_default_' : m.category;
    t.playoffWaitlist = t.playoffWaitlist || {};
    var waitlist = t.playoffWaitlist[ck] || [];
    if (!waitlist.length) return;
    var sub = waitlist.shift();
    t.playoffWaitlist[ck] = waitlist;
    m[slot] = sub;
    var o = document.getElementById('po-sub-overlay'); if (o) o.remove();
    try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
    if (typeof showNotification === 'function') showNotification('↪ ' + (_t('playoff.subbed') || 'Substituído'), sub + ' ' + (_t('playoff.subbedIn') || 'entrou na vaga.'), 'success');
    if (window._routerHandler) window._routerHandler();
  };

  window._playoffDoWO = function (tId, matchId, absentSlot) {
    var t = _findT(tId); if (!t || !_isOrg(t)) return;
    var m = (t.matches || []).filter(function (x) { return x.phase === 'playoff' && String(x.id) === String(matchId); })[0];
    if (!m || m.winner) return;
    var winner = absentSlot === 'p1' ? m.p2 : m.p1;
    if (!winner || winner === 'TBD' || winner === 'BYE') return;
    m.winner = winner;
    m.wo = true;
    m.scoreP1 = absentSlot === 'p1' ? 0 : 1;
    m.scoreP2 = absentSlot === 'p1' ? 1 : 0;
    try { if (typeof _advanceWinner === 'function') _advanceWinner(t, m); } catch (e) {}
    var o = document.getElementById('po-sub-overlay'); if (o) o.remove();
    try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
    if (typeof showNotification === 'function') showNotification('⚠️ W.O.', winner + ' ' + (_t('playoff.advancesWO') || 'avança por W.O.'), 'success');
    if (window._routerHandler) window._routerHandler();
  };

  function _notifyQualified(t) {
    if (typeof window._sendUserNotification !== 'function') return;
    var sentTo = {};
    var parts = Array.isArray(t.participants) ? t.participants : (t.participants ? Object.values(t.participants) : []);
    var byName = {};
    parts.forEach(function (p) { var nm = _name(p); if (nm) byName[nm] = p; });
    var qual = t.playoffQualified || {};
    Object.keys(qual).forEach(function (ck) {
      (qual[ck] || []).forEach(function (nm) {
        // nomes podem ser duplas "A / B"
        String(nm).split('/').forEach(function (part) {
          var person = byName[part.trim()];
          var uids = person && window._participantUids ? window._participantUids(person) : (person && person.uid ? [person.uid] : []);
          (uids || []).forEach(function (uid) {
            if (!uid || sentTo[uid]) return;
            sentTo[uid] = true;
            try {
              window._sendUserNotification(uid, {
                type: 'tournament_update', level: 'fundamental',
                title: '🏆 ' + (_t('playoff.notifTitle') || 'Você está na fase final!'),
                message: (t.name || 'Liga') + ' — ' + (_t('playoff.notifMsg') || 'os melhores da temporada vão se enfrentar. Boa sorte!'),
                tournamentId: t.id, tournamentName: t.name
              });
            } catch (e) {}
          });
        });
      });
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // RENDERIZAÇÃO — card injetado no layout da Liga (abaixo da classificação).
  // Chamado por bracket.js. Reusa renderMatchCard (matches estão em t.matches).
  // ───────────────────────────────────────────────────────────────────────────
  window._renderPlayoffSection = function (t, mode) {
    if (!t || !_hasPlayoff(t)) return '';
    var isOrg = _isOrg(t);
    var re = t.resultEntry || 'organizer';
    var canEnter = isOrg || re === 'players' || re === 'all';
    // v2.3.97: 'preview' = chave gerada mas aguardando o organizador clicar
    // "Iniciar torneio" (sem lançar placar). 'active'/ausente = valendo.
    // mode === 'review' = tela de revisão antes de publicar (botões Voltar/Publicar).
    var isReview = (mode === 'review');
    var poStatus = t.playoffStatus || 'active';
    var isPreview = (poStatus === 'preview');
    if (isPreview || isReview) canEnter = false;

    var poMatches = t.matches.filter(function (m) { return m && m.phase === 'playoff'; });
    if (!poMatches.length) return '';

    // agrupa por categoria
    var byCat = {};
    poMatches.forEach(function (m) {
      var ck = m.category == null ? '_default_' : m.category;
      (byCat[ck] = byCat[ck] || []).push(m);
    });

    var evt = t.playoffEvent || {};
    var html = '<div class="card" style="margin-top:1.2rem;border:1px solid rgba(245,158,11,0.3);">' +
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:0.6rem;">' +
        '<h3 style="margin:0;font-size:1.05rem;color:#fbbf24;">🏆 ' + (_t('playoff.title') || 'Fase Final da Temporada') + '</h3>' +
        (isOrg && !_playoffHasResult(t) ? '<button type="button" class="btn btn-outline btn-sm" onclick="window.location.hash=\'#fase-final/' + _esc(t.id) + '\'" style="color:#f87171;border-color:rgba(248,113,113,0.4);">↺ ' + (_t('playoff.redo') || 'Refazer') + '</button>' : '') +
      '</div>';

    // v2.3.97: controles do organizador. Em REVIEW (antes de publicar): Voltar/Publicar.
    // Em PREVIEW (já publicado, aguardando iniciar): Voltar/Iniciar torneio.
    if (isReview && isOrg) {
      html += '<div style="border:2px solid #6366f1;background:rgba(99,102,241,0.10);border-radius:12px;padding:12px 14px;margin-bottom:0.9rem;">' +
        '<div style="font-size:0.9rem;font-weight:800;color:#a5b4fc;margin-bottom:3px;">🔍 Confira a chave antes de publicar</div>' +
        '<div style="font-size:0.8rem;color:var(--text-main);line-height:1.4;margin-bottom:10px;">A chave abaixo foi montada conforme suas configurações. Se estiver tudo certo, clique <b>Publicar torneio</b>. Para ajustar, <b>Voltar às configurações</b>.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-shine" style="background:#10b981;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:700;" onclick="window._publishPlayoff(\'' + _esc(t.id) + '\')">🚀 ' + (_t('playoff.publish') || 'Publicar torneio') + '</button>' +
          '<button type="button" class="btn btn-outline" onclick="window.location.hash=\'#fase-final/' + _esc(t.id) + '\'">↩ ' + (_t('playoff.backToConfig') || 'Voltar às configurações') + '</button>' +
        '</div>' +
      '</div>';
    } else if (isPreview && isOrg) {
      html += '<div style="border:2px solid #f59e0b;background:rgba(245,158,11,0.10);border-radius:12px;padding:12px 14px;margin-bottom:0.9rem;">' +
        '<div style="font-size:0.9rem;font-weight:800;color:#fbbf24;margin-bottom:3px;">👀 Fase final em pré-visualização</div>' +
        '<div style="font-size:0.8rem;color:var(--text-main);line-height:1.4;margin-bottom:10px;">A chave foi publicada e está no topo do chaveamento. Clique <b>Iniciar torneio</b> para liberar o lançamento de placares, ou <b>Voltar às configurações</b> para refazer.</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button type="button" class="btn btn-shine" style="background:#10b981;color:#fff;border:1px solid rgba(255,255,255,0.3);font-weight:700;" onclick="window._startPlayoff(\'' + _esc(t.id) + '\')">▶️ ' + (_t('playoff.start') || 'Iniciar torneio') + '</button>' +
          '<button type="button" class="btn btn-outline" onclick="window.location.hash=\'#fase-final/' + _esc(t.id) + '\'">↩ ' + (_t('playoff.backToConfig') || 'Voltar às configurações') + '</button>' +
        '</div>' +
      '</div>';
    }

    // Banner do evento de playoffs
    if (evt.date || evt.venue || evt.note) {
      var when = '';
      if (evt.date) { try { when = new Date(evt.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { when = evt.date; } }
      html += '<div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:8px 12px;margin-bottom:0.8rem;font-size:0.82rem;color:var(--text-bright);">' +
        '🎉 ' + (when ? '<b>' + _esc(when) + '</b>' : '') + (evt.venue ? ' · ' + _esc(evt.venue) : '') +
        (evt.note ? '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px;">' + _esc(evt.note) + '</div>' : '') +
      '</div>';
    }

    var cats = Object.keys(byCat);
    var multiCat = cats.length > 1;

    // HTML de uma partida: skip de BYE já resolvido + card + botão Substituir/W.O.
    // (compartilhado entre eliminatória simples e dupla eliminatória).
    function _poMatchHtml(m, num) {
      if (m.isBye && m.winner) {
        return '<div style="font-size:0.78rem;color:var(--text-muted);padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:8px;margin-bottom:6px;">' +
          _esc(m.winner) + ' <span style="color:#34d399;">— BYE —</span></div>';
      }
      var s = (typeof renderMatchCard === 'function') ? renderMatchCard(m, canEnter, t.id, num) : '';
      if (isOrg && !m.winner && !m.isBye &&
          m.p1 && m.p1 !== 'TBD' && m.p1 !== 'BYE' &&
          m.p2 && m.p2 !== 'TBD' && m.p2 !== 'BYE') {
        s += '<div style="margin:-2px 0 10px;text-align:right;">' +
          '<button type="button" class="btn btn-outline btn-sm" onclick="window._playoffSub(\'' + _esc(t.id) + '\',\'' + _esc(m.id) + '\')" style="font-size:0.7rem;padding:3px 10px;color:#fbbf24;border-color:rgba(245,158,11,0.4);">⚠️ ' + (_t('playoff.substitute') || 'Substituir / W.O.') + '</button>' +
        '</div>';
      }
      return s;
    }
    function _poSecHeader(txt, color) {
      return '<div style="font-size:0.82rem;font-weight:800;color:' + color + ';margin:0.9rem 0 0.4rem;text-transform:uppercase;letter-spacing:0.5px;">' + _esc(txt) + '</div>';
    }
    function _poBracketRoundsHtml(secMatches) {
      var out = '';
      var rounds = secMatches.map(function (m) { return m.round || 1; });
      var maxR = Math.max.apply(null, rounds);
      var minR = Math.min.apply(null, rounds);
      var multiR = (maxR > minR);
      for (var r = minR; r <= maxR; r++) {
        var rms = secMatches.filter(function (m) { return (m.round || 1) === r; });
        if (!rms.length) continue;
        if (multiR) out += '<div style="font-size:0.74rem;font-weight:700;color:var(--text-muted);margin:0.5rem 0 0.3rem;text-transform:uppercase;letter-spacing:0.5px;">Rodada ' + r + '</div>';
        var num = 0;
        rms.forEach(function (m) { num++; out += _poMatchHtml(m, num); });
      }
      return out;
    }

    cats.forEach(function (ck) {
      var matches = byCat[ck];
      var isDE = matches.some(function (m) { return !!m.bracket; });
      var maxRound = matches.reduce(function (mx, m) { return Math.max(mx, m.round || 1); }, 1);

      if (multiCat) {
        html += '<div style="font-size:0.9rem;font-weight:800;color:#fbbf24;margin:0.8rem 0 0.4rem;">📂 ' + _esc(ck) + '</div>';
      }

      // campeão? (DE: vencedor da Grande Final; simples: vencedor da última rodada)
      var finalM = isDE
        ? matches.filter(function (m) { return m.bracket === 'grand'; })[0]
        : matches.filter(function (m) { return m.round === maxRound; })[0];
      if (finalM && finalM.winner) {
        html += '<div style="background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(245,158,11,0.06));border:1px solid rgba(245,158,11,0.4);border-radius:12px;padding:12px 16px;margin-bottom:0.8rem;text-align:center;">' +
          '<div style="font-size:0.72rem;color:#fbbf24;text-transform:uppercase;letter-spacing:1px;font-weight:700;">🏆 ' + (_t('playoff.champion') || 'Campeão da Temporada') + '</div>' +
          '<div style="font-size:1.2rem;font-weight:900;color:#fff;margin-top:2px;">' + _esc(finalM.winner) + '</div>' +
        '</div>';
      }

      if (isDE) {
        // Dupla Eliminatória: três seções — Vencedores / Repescagem / Grande Final.
        var upperM = matches.filter(function (m) { return m.bracket === 'upper'; });
        var lowerM = matches.filter(function (m) { return m.bracket === 'lower'; });
        var grandM = matches.filter(function (m) { return m.bracket === 'grand'; });
        if (upperM.length) html += _poSecHeader('🏆 Chave dos Vencedores', '#fbbf24') + _poBracketRoundsHtml(upperM);
        if (lowerM.length) html += _poSecHeader('🔁 Repescagem', '#a5b4fc') + _poBracketRoundsHtml(lowerM);
        if (grandM.length) { html += _poSecHeader('👑 Grande Final', '#34d399'); var gn = 0; grandM.forEach(function (m) { gn++; html += _poMatchHtml(m, gn); }); }
      } else {
        // Eliminatória simples — rodadas (comportamento original, intocado).
        for (var r = 1; r <= maxRound; r++) {
          var rms = matches.filter(function (m) { return m.round === r; });
          if (!rms.length) continue;
          html += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-muted);margin:0.6rem 0 0.3rem;text-transform:uppercase;letter-spacing:0.5px;">' + _roundLabel(r, maxRound) + '</div>';
          var num = 0;
          rms.forEach(function (m) { num++; html += _poMatchHtml(m, num); });
        }
      }
    });

    html += '</div>';

    // Side effect controlado: marca campeão/encerra quando todas as finais decididas.
    // Nunca em preview/review (chave ainda não iniciada / não publicada).
    if (!isPreview && !isReview) { try { _maybeFinishPlayoff(t, byCat); } catch (e) {} }

    return html;
  };

  // v2.3.97: organizador clica "Iniciar torneio" → fase final passa a valer.
  window._startPlayoff = function (tId) {
    var t = _findT(tId);
    if (!t || !_isOrg(t) || !_hasPlayoff(t)) return;
    t.playoffStatus = 'active';
    t.updatedAt = new Date().toISOString();
    try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
    try { if (window._notifyQualified) _notifyQualified(t); } catch (e) {}
    if (typeof window.showNotification === 'function') window.showNotification('▶️ Fase final iniciada!', 'Os participantes já podem lançar os placares.', 'success');
    try {
      var _vc = document.getElementById('view-container');
      var _h = (window.location && window.location.hash) || '';
      if (_vc && _h.indexOf('#bracket/' + t.id) === 0 && typeof window._rerenderBracket === 'function') window._rerenderBracket(t.id);
      else if (_vc && typeof window.renderTournaments === 'function') window.renderTournaments(_vc, t.id);
    } catch (e) {}
  };

  function _maybeFinishPlayoff(t, byCat) {
    var champByCat = {};
    var allDone = true;
    Object.keys(byCat).forEach(function (ck) {
      var matches = byCat[ck];
      var isDE = matches.some(function (m) { return !!m.bracket; });
      var maxRound = matches.reduce(function (mx, m) { return Math.max(mx, m.round || 1); }, 1);
      // DE: a "final" da categoria é a Grande Final; simples: a última rodada.
      var finalM = isDE
        ? matches.filter(function (m) { return m.bracket === 'grand'; })[0]
        : matches.filter(function (m) { return m.round === maxRound; })[0];
      if (finalM && finalM.winner) champByCat[ck] = finalM.winner;
      else allDone = false;
    });
    var changed = false;
    if (JSON.stringify(t.playoffChampion || {}) !== JSON.stringify(champByCat)) {
      t.playoffChampion = champByCat; changed = true;
    }
    if (allDone && !t.playoffFinishedAt) {
      t.playoffFinishedAt = new Date().toISOString();
      t.status = 'finished';
      changed = true;
    }
    if (changed) {
      try { if (window.AppStore && window.AppStore.syncImmediate) window.AppStore.syncImmediate(t.id); } catch (e) {}
    }
  }

  // Helper exposto: botão do organizador (usado em tournaments.js) — só decide visibilidade.
  window._playoffEligibleForButton = function (t) {
    return _isLiga(t) && _isOrg(t);
  };
  window._playoffActive = _hasPlayoff;

})();
