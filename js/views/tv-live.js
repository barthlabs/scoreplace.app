// Saída de TV da chave: uma segunda janela limpa, alimentada pelo torneio já
// acompanhado pelo listener canônico do app. Não escreve no torneio.
(function () {
  'use strict';
  var popup = null, tick = null, lastMarkup = '', wakeSentinel = null, wakePending = false;
  var popupTournamentId = '', popupGeneration = 0, lastHeartbeatAt = 0, lastHeartbeatVisible = false;
  var highestGenerationById = Object.create(null);
  var lastCompleteTournament = null, loadingTournament = false, lastLoadAttempt = 0;
  var liveMatchTournamentId = '', liveMatches = new Map(), liveMatchesUnsubscribe = null;
  var clock = window.ScoreplaceMatchTiming;
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var dayCore = window.ScoreplaceMatchDay;
  if (!dayCore || typeof dayCore.matchDay !== 'function') {
    window._tvLiveUnavailable = 'Módulo de datas indisponível. Recarregue o aplicativo.';
    return;
  }
  var timestamp = dayCore.timestamp;
  var localDay = dayCore.localDay;
  var eventZone = dayCore.eventZone;
  var matchDay = dayCore.matchDay;
  function completeTournament(t) {
    if (!t || t._resumo === true || t._doCache === true || t._faltamPesados === true) return false;
    var expected = Number(t._nJogos);
    if (expected > 0) {
      if (typeof window._collectAllMatches !== 'function') return false;
      var ids = new Set((window._collectAllMatches(t) || []).filter(Boolean).map(function (m) { return String(m.id || ''); }).filter(Boolean));
      if (ids.size < expected) return false;
    }
    if (typeof window._marcaPartesQueFaltam === 'function') {
      try { if (window._marcaPartesQueFaltam(t, true)) return false; } catch (e) { return false; }
    }
    return true;
  }
  window._tvLiveIsComplete = completeTournament;
  window._tvLiveEnsureFresh = function (id) {
    var now = Date.now();
    if (loadingTournament || now - lastLoadAttempt < 5000 || typeof window._ensureTournamentLoaded !== 'function') return;
    loadingTournament = true; lastLoadAttempt = now;
    window._ensureTournamentLoaded(id, function (fresh) {
      loadingTournament = false;
      if (completeTournament(fresh)) {
        lastCompleteTournament = fresh;
        if (typeof window._tvLiveRefresh === 'function') window._tvLiveRefresh();
      }
    }, true);
  };
  function gameScore(m, side, final) {
    var sets = Array.isArray(m.sets) ? m.sets : [];
    if (sets.length) {
      var shown = final ? sets : [sets[sets.length - 1]];
      return shown.map(function (set) {
        var value = set[side === 1 ? 'gamesP1' : 'gamesP2'];
        return value == null || value === '' ? '–' : String(value);
      }).join(' / ');
    }
    var value = m[side === 1 ? 'scoreP1' : 'scoreP2'];
    return value == null || value === '' ? '–' : String(value);
  }
  function courtsOf(t) {
    if (Array.isArray(t.courtNames) && t.courtNames.length) return t.courtNames.map(String);
    if (typeof t.courtNames === 'string' && t.courtNames.trim()) return t.courtNames.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var count = Math.max(0, Number(t.courtCount) || 0), out = [];
    for (var i = 1; i <= count; i++) out.push('Quadra ' + i);
    return out;
  }
  function teamFor(match, side, teams) {
    var id = String(match[side === 1 ? 'p1CompetitionTeamId' : 'p2CompetitionTeamId'] || '');
    var object = match[side === 1 ? 'team1Obj' : 'team2Obj'] || {};
    if (!id) id = String(object.competitionTeamId || '');
    var team = teams.find(function (item) { return String(item.id) === id; });
    var hue = team && Number(team.hue);
    return { name: team ? String(team.name || '') : '', color: Number.isFinite(hue) ? 'hsl(' + hue + ' 78% 56%)' : '#94a3b8' };
  }
  function sideName(t, match, slot) {
    var raw = String(match[slot] || '');
    if (typeof window._resolveSideLive !== 'function') return raw;
    var uids = typeof window._slotUidsPositional === 'function'
      ? window._slotUidsPositional(match, slot, t)
      : (match[slot === 'p1' ? 'team1Uids' : 'team2Uids'] || match[slot + 'Uid']);
    return String(window._resolveSideLive(t, raw, uids) || raw);
  }
  function monarchSeries(t, current, matches, occupancy, teams, latestResultId) {
    if (!current || current.isMonarch !== true || current.monarchGroup == null || current.round == null || !current.category) return null;
    var games = matches.filter(function (game) {
      return game && game.isMonarch === true && !game.isTieBreak &&
        String(game.category || '') === String(current.category) &&
        Number(game.phaseIndex || 0) === Number(current.phaseIndex || 0) &&
        String(game.round) === String(current.round) &&
        String(game.monarchGroup) === String(current.monarchGroup);
    });
    if (games.length !== 3 || !games.some(function (game) { return String(game.id) === String(current.id); })) return null;
    games.sort(function (a, b) {
      return Number(a._gameNum || a.scheduledGameNumber || 0) - Number(b._gameNum || b.scheduledGameNumber || 0) ||
        timestamp(a.scheduledAt) - timestamp(b.scheduledAt);
    });
    return games.map(function (game) {
      var done = occupancy.isFinished(game);
      var active = String(game.id) === String(current.id);
      var sideWinner = done && typeof window._matchWinnerSide === 'function' ? window._matchWinnerSide(game) : 0;
      return { number: game._gameNum || game.scheduledGameNumber || game.matchNumber || '',
        a: sideName(t, game, 'p1'), b: sideName(t, game, 'p2'),
        ta: teamFor(game, 1, teams), tb: teamFor(game, 2, teams),
        scoreA: done || active ? (game.wo ? 'W.O.' : gameScore(game, 1, done)) : '',
        scoreB: done || active ? (game.wo ? 'W.O.' : gameScore(game, 2, done)) : '',
        status: done ? 'done' : active ? 'active' : 'waiting', winnerSide: sideWinner,
        latestResult: done && String(game.id || '') === latestResultId };
    });
  }
  function rankingSections(t, matches, teams) {
    var core = window.ScoreplaceTeamCompetition;
    var configured = core && typeof core.configurationForTournament === 'function'
      ? core.configurationForTournament(t) : (t.teamCompetition || ((t.phases || [])[0] || {}).teamCompetition);
    if (!core) return generalRankingSections(t, matches);
    var cfg = typeof core.rankingConfigForTournament === 'function' ? core.rankingConfigForTournament(t) : core.normalize(configured);
    if (!cfg || cfg.enabled !== true) return generalRankingSections(t, matches);
    var pairs = Array.isArray(t.competitionPairs) ? t.competitionPairs : [];
    var categories = cfg.aggregation === 'per_category'
      ? Array.from(new Set(matches.map(function (m) { return String(m.category || ''); }).filter(Boolean)))
      : [''];
    return categories.map(function (category) {
      var selected = category ? matches.filter(function (m) { return String(m.category || '') === category; }) : matches;
      var rows = cfg.classificationUnit === 'pair'
        ? core.pairStandings(pairs, selected, cfg, category || undefined)
        : core.standings(teams, selected, cfg);
      return { title: category || (cfg.classificationUnit === 'pair' ? 'Duplas' : 'Times'), rows: rows, ranking: cfg.ranking,
        colors: teams.reduce(function (map, team) {
          var hue = Number(team.hue);
          if (team.id && Number.isFinite(hue)) map[String(team.id)] = 'hsl(' + hue + ' 78% 56%)';
          return map;
        }, {}) };
    });
  }
  function generalRankingSections(t, matches) {
    if (typeof window._computeStandings !== 'function') return [];
    var categories = Array.isArray(t.combinedCategories) && t.combinedCategories.length ? t.combinedCategories : [''];
    return categories.map(function (category) {
      var rows = [];
      try { rows = window._computeStandings(t, category || undefined) || []; } catch (e) { /* classificação parcial indisponível */ }
      return { title: category || 'Geral', ranking: 'points', colors: {}, rows: rows.slice(0, 12).map(function (row) {
        return { name: row.name || row.displayName || '', points: row.points == null ? row.wins || 0 : row.points,
          gamesWon: row.gamesWon || 0, gamesLost: row.gamesLost || 0, wins: row.wins || 0,
          losses: row.losses || 0, played: row.played || 0 };
      }).filter(function (row) { return row.name; }) };
    }).filter(function (section) { return section.rows.length; });
  }
  function bracketSections(t, matches) {
    var categories = Array.isArray(t.combinedCategories) ? t.combinedCategories.map(String) : [];
    var actual = matches.filter(function (m) {
      return m && !m.isBye && !m.isSitOut && Number(m.phaseIndex || 0) > 0 &&
        (!Array.isArray(t.phases) || !t.phases[m.phaseIndex] ||
          (typeof window._isEliminationPhase === 'function' && window._isEliminationPhase(t, Number(m.phaseIndex))));
    });
    var projected = [];
    var eng = window._phasesEngine, next = Number(t.currentPhaseIndex || 0) + 1;
    if (eng && Array.isArray(t.phases) && t.phases[next] && typeof eng.projectPhaseCfg === 'function' &&
        typeof eng.buildCategorizedPhaseBrackets === 'function') {
      try {
        var groups = Number(t.currentPhaseIndex || 0) === 0 && typeof eng.prevPhaseGroups === 'function'
          ? eng.prevPhaseGroups(t) : typeof eng.bracketPhaseGroups === 'function'
            ? eng.bracketPhaseGroups(t, Number(t.currentPhaseIndex || 0)) : [];
        var cfg = eng.projectPhaseCfg(t.phases[next], t, next);
        if (groups && groups.length && cfg && cfg.kind === 'elimination') {
          var built = eng.buildCategorizedPhaseBrackets(t, groups, cfg, function (g) {
            if (typeof window._computeMonarchStandings === 'function' && (g.matches || []).some(function (m) { return m && m.isMonarch; }))
              return window._computeMonarchStandings(g, t, g.category) || [];
            return g.standings || (g.players || g.participants || []).map(function (p) {
              var name = typeof p === 'string' ? p : p && (p.displayName || p.name) || '';
              return { name: name, displayName: name };
            });
          }, 'tv-preview-' + next);
          if (!built.error) projected = (built.matches || []).filter(function (m) { return m && !m.isBye && !m.isSitOut; });
        }
      } catch (e) { if (window._warn) window._warn('Prévia das eliminatórias indisponível', e); }
    }
    actual.concat(projected).forEach(function (m) {
      var category = String(m.category || 'Geral');
      if (categories.indexOf(category) < 0) categories.push(category);
    });
    var occupancy = window.ScoreplaceCourtOccupancy || { isFinished:function (m) { return !!(m.resultAt || m.winner || m.wo); } };
    return categories.map(function (category) {
      var live = actual.filter(function (m) { return String(m.category || 'Geral') === category; });
      var games = live.length ? live : projected.filter(function (m) { return String(m.category || 'Geral') === category; });
      var rounds = Array.from(new Set(games.map(function (m) { return Number(m.round || 1); }))).sort(function (a, b) { return a - b; });
      var activeRound = rounds.find(function (round) { return games.some(function (m) { return Number(m.round || 1) === round && !occupancy.isFinished(m); }); });
      if (activeRound == null) activeRound = rounds[rounds.length - 1] || 1;
      return { category: category, provisional: !live.length, activeRound:activeRound, rounds:rounds,
        matches: games.map(function (m) {
        return { id: String(m.id || ''), round: Number(m.round || 1), number: m._gameNum || m.scheduledGameNumber || '',
          a: live.length ? sideName(t, m, 'p1') : String(m.p1 || ''),
          b: live.length ? sideName(t, m, 'p2') : String(m.p2 || ''),
          inCourt: !!(live.length && m.court && (m.courtCalledAt || m.startedAt) && !occupancy.isFinished(m)),
          done: occupancy.isFinished(m), third:!!m.isThirdPlace };
      }) };
    });
  }
  window._tvLiveBuildSnapshot = function (t, nowMs) {
    if (!t || !t.id) return null;
    if (typeof window._bracketEnsureCourtReleaseListener === 'function') window._bracketEnsureCourtReleaseListener(t.id);
    var released = typeof window._bracketCourtReleased === 'function' ? window._bracketCourtReleased(t.id) : {};
    // O listener recebe uma cópia nova. Use a numeração canônica da chave.
    if (typeof window._assignGlobalGameNumbers === 'function') window._assignGlobalGameNumbers(t);
    var matches = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) : (t.matches || []);
    // O torneio completo pode continuar em memória enquanto a mesa grava uma
    // chamada numa parte externa. A janela acompanha a mesma subcoleção canônica
    // que loadTournamentById lê; cada jogo recém-gravado substitui só seu retrato.
    if (String(t.id) === liveMatchTournamentId && liveMatches.size) {
      matches = matches.map(function (m) {
        var live = m && liveMatches.get(String(m.id));
        return live ? Object.assign({}, m, live, { _gameNum: live._gameNum || m._gameNum }) : m;
      });
    }
    var tieBook = t.phaseTieDecisions && t.phaseTieDecisions[String(t.currentPhaseIndex || 0)];
    var tieMatches = tieBook ? Object.keys(tieBook).sort().reduce(function (all, id) {
      var decision = tieBook[id];
      return all.concat(decision && decision.matches || []);
    }, []).map(function (m) {
      return { id: m.id, _gameNum: m.displayGameNumber, category: 'Desempate da classificatória',
        p1: String(m.p1 && m.p1.name || ''), p2: String(m.p2 && m.p2.name || ''),
        court: m.court, courtCalledAt: m.courtCalledAt, resultAt: m.resultAt,
        winner: m.winnerKey || null, sets: (m.sets || []).map(function (set) {
          return { gamesP1: set.p1, gamesP2: set.p2 };
        }) };
    }) : [];
    var teams = Array.isArray(t.competitionTeams) ? t.competitionTeams : [];
    var courtNames = courtsOf(t);
    var timing = clock.config(t);
    var now = nowMs == null ? Date.now() : nowMs;
    var occupancy = window.ScoreplaceCourtOccupancy || { isFinished: function (m) { return !!(m.resultAt || m.winner != null || m.wo === true); } };
    var allActive = matches.concat(tieMatches).filter(function (m) {
      return m && !released[String(m.id)] && !occupancy.isFinished(m) && !m.isBye && !m.isSitOut && m.court && (m.courtCalledAt || m.startedAt);
    }).sort(function (a, b) { return timestamp(b.courtCalledAt || b.startedAt) - timestamp(a.courtCalledAt || a.startedAt); });
    if (!courtNames.length) courtNames = Array.from(new Set(allActive.map(function (m) { return String(m.court); })));
    // A borda anuncia a próxima oportunidade de chamar pelo microfone. Cada
    // transição automática compete com uma chamada nova pelo instante em que
    // ocorreu; não basta lembrar qual jogo recebeu OK por último.
    var latestPhaseId = '', latestTransitionAt = 0;
    var latestResult = matches.filter(function (m) { return m && occupancy.isFinished(m) && timestamp(m.resultAt || m.completedAt) > 0 &&
      !m.wo && ((m.scoreP1 != null && m.scoreP2 != null) || (Array.isArray(m.sets) && m.sets.length)); })
      .sort(function (a, b) { return timestamp(b.resultAt || b.completedAt) - timestamp(a.resultAt || a.completedAt); })[0];
    var latestResultId = latestResult ? String(latestResult.id || '') : '';
    allActive.forEach(function (m) {
      var event = clock.phaseAt(timestamp(m.courtClockBaseAt || m.courtCalledAt || m.startedAt), timing, now);
      if (event.transitionAt > latestTransitionAt) {
        latestTransitionAt = event.transitionAt;
        latestPhaseId = String(m.id || '');
      }
    });
    var courtCards = courtNames.map(function (name) {
      var m = allActive.find(function (item) { return String(item.court) === name; });
      if (!m) return { name: name };
      return { name: name, number: m._gameNum || m.scheduledGameNumber || m.matchNumber || '', category: String(m.category || m.tierLabel || ''),
        latest: !!latestPhaseId && String(m.id || '') === latestPhaseId,
        series: monarchSeries(t, m, matches, occupancy, teams, latestResultId),
        a: sideName(t, m, 'p1'), b: sideName(t, m, 'p2'), ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams),
        scoreA: gameScore(m, 1) === '–' ? '0' : gameScore(m, 1),
        scoreB: gameScore(m, 2) === '–' ? '0' : gameScore(m, 2),
        timerStart: timestamp(m.courtClockBaseAt || m.courtCalledAt || m.startedAt) };
    });
    var nextSelection = typeof window._bracketOperationsSelect === 'function' ? window._bracketOperationsSelect(t) : null;
    var nextMatch = nextSelection ? nextSelection.next : null;
    if (!nextSelection) {
      var knownSide = window.ScoreplaceNextMatch.knownSide;
      var nextCandidates = matches.filter(function (m) {
        if (!m || occupancy.isFinished(m) || m.isBye || m.isSitOut || m.courtCalledAt || m.startedAt || !timestamp(m.scheduledAt)) return false;
        var a = m.p1 || (Array.isArray(m.team1) ? m.team1.join(' / ') : '');
        var b = m.p2 || (Array.isArray(m.team2) ? m.team2.join(' / ') : '');
        return knownSide(a) && knownSide(b);
      }).map(function (m) { return { item: { m: m, tId: t.id } }; });
      nextCandidates.sort(window._dashboardNextMatchCompare);
      nextMatch = window.ScoreplaceNextMatch.firstAvailable(nextCandidates.map(function (entry) { return entry.item.m; }), matches, released);
    }
    var nextGame = nextMatch ? {
      number: nextMatch._gameNum || nextMatch.scheduledGameNumber || nextMatch.matchNumber || '',
      category: String(nextMatch.category || nextMatch.tierLabel || ''),
      a: sideName(t, nextMatch, 'p1'), b: sideName(t, nextMatch, 'p2'),
      ta: teamFor(nextMatch, 1, teams), tb: teamFor(nextMatch, 2, teams)
    } : null;
    // Partidas extras decidem a rota, mas não pontuam na tabela da fase encerrada.
    // Elas ficam no livro de decisões; a TV anuncia a próxima mesmo sem quadra atribuída.
    if (tieBook) {
      var tiePending = Object.keys(tieBook).sort().map(function (id) { return tieBook[id]; })
        .filter(function (decision) { return decision && decision.status === 'pending'; })
        .reduce(function (all, decision) { return all.concat(decision.matches || []); }, [])
        .find(function (match) { return match && !match.winnerKey; });
      if (tiePending) nextGame = { number: String(tiePending.displayGameNumber || 'EXTRA'), category: 'Desempate da classificatória',
        a: String(tiePending.p1 && tiePending.p1.name || ''), b: String(tiePending.p2 && tiePending.p2.name || ''),
        ta: { name: '', color: '#94a3b8' }, tb: { name: '', color: '#94a3b8' } };
    }
    var zone = eventZone(t);
    var today = localDay(now, zone);
    var resultDays = matches.concat(tieMatches).filter(function (m) { return m && occupancy.isFinished(m) && !m.isBye && !m.isSitOut; })
      .map(function (m) { return matchDay(m, zone); })
      .filter(function (day) { return day && day <= today; })
      .sort().reverse();
    var resultDay = resultDays[0] || today;
    var results = matches.concat(tieMatches).filter(function (m) { return m && occupancy.isFinished(m) && !m.isBye && !m.isSitOut &&
      matchDay(m, zone) === resultDay; })
      .sort(function (a, b) { return timestamp(b.resultAt || b.completedAt || b.scheduledAt) - timestamp(a.resultAt || a.completedAt || a.scheduledAt); })
      .map(function (m) {
        var ended = timestamp(m.resultAt || m.completedAt);
        var anchor = timestamp(m.courtClockBaseAt || m.courtCalledAt);
        var gameStart = anchor ? anchor + (timing.call + timing.warmup) * 60000 : 0;
        if (!gameStart) gameStart = timestamp(m.startedAt);
        var duration = !m.wo && ended > gameStart && gameStart > 0 ? clock.elapsed(gameStart, ended) : '';
        var resultTime = ended
          ? new Intl.DateTimeFormat('pt-BR', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ended))
          : 'Horário indisponível';
        var hasScore = !m.wo && ended > 0 && ((m.scoreP1 != null && m.scoreP2 != null) ||
          (Array.isArray(m.sets) && m.sets.some(function (set) { return set && set.gamesP1 != null && set.gamesP2 != null; })));
        return { id: String(m.id || ''), resultAt: ended, hasScore: hasScore, number: m._gameNum || m.scheduledGameNumber || m.matchNumber || '', time: resultTime, category: String(m.category || ''), a: sideName(t, m, 'p1'), b: sideName(t, m, 'p2'),
          ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams), scoreA: m.wo ? 'W.O.' : gameScore(m, 1, true), scoreB: m.wo ? 'W.O.' : gameScore(m, 2, true), duration: duration };
      });
    // Uma decisão por W.O. pode entrar no histórico depois do placar mais
    // recente; o destaque é sempre do último jogo com placar efetivamente salvo.
    var latestScoreIndex = results.findIndex(function (result) { return result.hasScore; });
    if (latestScoreIndex > 0) results.unshift(results.splice(latestScoreIndex, 1)[0]);
    var site = String(window.SCOREPLACE_URL || 'https://scoreplace.app').replace(/\/$/, '');
    var publicId = /^tour_[0-9]{13}_[a-f0-9]{32}$/.test(String(t.id || '')) ? String(t.id) : '';
    var qrUrl = site + '/open.html' + (publicId ? '?t=' + encodeURIComponent(publicId) : '');
    var tvLayout = null;
    if (window.ScoreplaceTvLayout) {
      var layoutCore = window.ScoreplaceTvLayout;
      var fallbackLayout = null, screens = null;
      try { if (t.tvLayout) fallbackLayout = layoutCore.normalize(t.tvLayout); } catch (e) { /* dado antigo inválido */ }
      try { if (t.tvScreens) screens = layoutCore.normalizeScreens(t.tvScreens); } catch (e) { /* usa o layout antigo */ }
      tvLayout = layoutCore.forPhase(screens, t.currentPhaseIndex || 0, fallbackLayout);
    }
    var matchChoices = matches.filter(function (m) { return m && m.id && !m.isBye && !m.isSitOut; }).map(function (m) {
      return { id: String(m.id), label: 'JOGO ' + (m._gameNum || m.scheduledGameNumber || m.matchNumber || '') +
        ' · ' + String(m.bracket || m.category || '') + (m.isThirdPlace ? ' · 3º lugar' : '') };
    });
    var selectedMatches = {};
    if (tvLayout) ['live1', 'live2', 'live3', 'live4'].forEach(function (id) {
      var source = tvLayout.sections[id].source;
      var m = source && matches.find(function (item) { return item && String(item.id) === source; });
      if (!m) return;
      selectedMatches[id] = { number: m._gameNum || m.scheduledGameNumber || m.matchNumber || '',
        category: String(m.category || m.tierLabel || ''), bracket: String(m.bracket || ''),
        third: !!m.isThirdPlace, a: sideName(t, m, 'p1'), b: sideName(t, m, 'p2'),
        scoreA: gameScore(m, 1, true), scoreB: gameScore(m, 2, true),
        winnerSide: typeof window._matchWinnerSide === 'function' ? window._matchWinnerSide(m) :
          (m.winner === 'p1' ? 1 : m.winner === 'p2' ? 2 : 0) };
    });
    var lineKeys = Array.from(new Set(matches.map(function (m) { return m && String(m.bracket || 'main'); }).filter(Boolean)));
    var lineChoices = lineKeys.map(function (key) {
      return { key: key, label: key === 'gold' ? 'Ouro' : key === 'silver' ? 'Prata' : key === 'main' ? 'Principal' : key };
    });
    var lineStandings = {};
    if (tvLayout) ['standing1', 'standing2', 'standing3', 'standing4'].forEach(function (id) {
      var key = tvLayout.sections[id].source;
      if (!key) return;
      var lm = matches.filter(function (m) { return m && String(m.bracket || 'main') === key; });
      var saved = t.classifFinalDaLinha && t.classifFinalDaLinha[key];
      var rows = Array.isArray(saved) && saved.length ? saved :
        (typeof window._classifEntriesFromMatches === 'function' ? window._classifEntriesFromMatches(t, lm) : []);
      lineStandings[id] = { title: (lineChoices.find(function (choice) { return choice.key === key; }) || {}).label || key,
        rows: rows.map(function (entry) { return { name: String(entry.name || ''), pos: Number(entry.pos || 0) }; })
          .filter(function (entry) { return entry.name && entry.pos > 0; })
          .sort(function (a, b) { return a.pos - b.pos || a.name.localeCompare(b.name); }) };
    });
    var cover = typeof window._tournamentCoverBackground === 'function'
      ? window._tournamentCoverBackground(Object.assign({}, t, { coverMode: 'color' })) : null;
    var primary = /^#[0-9a-f]{6}$/i.test(String(t.coverColor || '')) ? t.coverColor : '#0d1b2e';
    var secondary = /^#[0-9a-f]{6}$/i.test(String(t.coverGradientColor || '')) ? t.coverGradientColor : primary;
    var title = /^#[0-9a-f]{6}$/i.test(String(t.titleColor || '')) ? t.titleColor : '#ffffff';
    var theme = { background: cover ? cover.css : '#060d1a', primary: primary, secondary: secondary, title: title };
    return { name: String(t.name || ''), logo: typeof window._tourLogoSrc === 'function' ? window._tourLogoSrc(t) : '', tvLayout: tvLayout, theme: theme,
      qrUrl: qrUrl, qrImage: typeof window._qrCodeUrl === 'function' ? window._qrCodeUrl(qrUrl, 320, false) :
        'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(qrUrl) + '&bgcolor=ffffff&color=1a1e2e&margin=10',
      scoreplaceLogo: site + '/icons/logo-podium.svg',
      courts: courtCards, nextGame: nextGame, rankings: rankingSections(t, matches, teams), results: results, resultDay: resultDay,
      matchChoices: matchChoices, selectedMatches: selectedMatches, lineChoices: lineChoices, lineStandings: lineStandings,
      brackets: bracketSections(t, matches),
      timing: timing };
  };
  function sideHtml(label, team, score, options) {
    var players = String(label || '').split(' / ').map(function (name) { return name.trim(); }).filter(Boolean);
    return '<div class="tv-side" style="--team:' + esc(team.color) + '">' + (options.teams ? '<span class="tv-team-tag">' + esc(team.name || 'Time') + '</span>' : '') +
      (options.players ? '<div class="tv-players">' + players.map(function (name) { return '<span>' + esc(name) + '</span>'; }).join('') + '</div>' : '') +
      (options.score && score !== '' ? '<strong class="tv-score">' + esc(score) + '</strong>' : '') + '</div>';
  }
  function cardHtml(card, options) {
    options = options || { court: true, number: true, category: true, teams: true, players: true, score: true, timer: true };
    if (!card.number && !card.a && !card.b) return '<article class="tv-court empty">' + (options.court ? '<h2>' + esc(card.name) + '</h2>' : '') + '<p>Aguardando chamada</p></article>';
    if (card.series) return '<article class="tv-court tv-court-series' + (card.latest ? ' tv-court-latest' : '') + '"><div class="tv-court-top"><h2>' + (options.court ? esc(card.name) : '') + '</h2>' + (options.category ? '<span>' + esc(card.category) + '</span>' : '') + '</div><div class="tv-series-games">' +
      card.series.map(function (game) {
        function side(label, score, direction, outcome) {
          var players = String(label || '').split(' / ').map(function (name) { return name.trim(); }).filter(Boolean);
          return '<div class="tv-series-side tv-series-' + direction + (outcome ? ' tv-series-' + outcome : '') + '"><div class="tv-series-players">' + players.map(function (name) { return '<span>' + esc(name) + '</span>'; }).join('') + '</div>' +
            (options.score && score !== '' ? '<strong>' + esc(score) + '</strong>' : '') + '</div>';
        }
        var winnerSide = Number(game.winnerSide) || 0;
        if (game.status === 'done' && !winnerSide && !game.wo) {
          var a = Number(game.scoreA), b = Number(game.scoreB);
          if (game.scoreA !== '' && game.scoreB !== '' && Number.isFinite(a) && Number.isFinite(b) && a !== b) winnerSide = a > b ? 1 : 2;
        }
        return '<div class="tv-series-game tv-series-' + game.status + (game.latestResult ? ' tv-series-latest-result' : '') + '"><b>JOGO ' + esc(game.number) + '</b>' +
          side(game.a, game.scoreA, 'left', game.status === 'done' && winnerSide ? (winnerSide === 1 ? 'win' : 'loss') : '') + '<span class="tv-series-versus">×</span>' + side(game.b, game.scoreB, 'right', game.status === 'done' && winnerSide ? (winnerSide === 2 ? 'win' : 'loss') : '') + '</div>';
      }).join('') + '</div>' +
      (options.timer ? '<div class="tv-court-footer"><strong data-tv-start="' + card.timerStart + '">00:00:00</strong></div>' : '') + '</article>';
    return '<article class="tv-court tv-court-active' + (card.latest ? ' tv-court-latest' : '') + '"><div class="tv-court-top"><h2>' + (options.court ? esc(card.name) : '') + (options.number ? ' · JOGO ' + esc(card.number) : '') + '</h2>' + (options.category ? '<span>' + esc(card.category) + '</span>' : '') + '</div>' +
      sideHtml(card.a, card.ta, card.scoreA, options) + '<div class="tv-versus">VS</div>' + sideHtml(card.b, card.tb, card.scoreB, options) +
      (options.timer ? '<div class="tv-court-footer"><strong data-tv-start="' + card.timerStart + '">00:00:00</strong></div>' : '') + '</article>';
  }
  function rankingHtml(section, showTitle) {
    var byGames = section.ranking === 'games_diff';
    return '<div class="tv-ranking-group" style="--tv-ranking-rows:' + section.rows.length + '">' + (showTitle ? '<h3>' + esc(section.title) + '</h3>' : '') + '<div class="tv-ranking-head"><span>#</span><span>' + (section.title === 'Duplas' ? 'DUPLA' : 'TIME') + '</span><span>' + (byGames ? 'SALDO' : 'PTS') + '</span><span>GAMES</span><span class="tv-win">V</span><span class="tv-loss">D</span><span>J</span></div>' + section.rows.map(function (row, index) {
      var value = section.ranking === 'games_diff' ? (row.gamesDiff >= 0 ? '+' : '') + row.gamesDiff : row.points;
      var color = section.colors[String(row.teamId || row.id)] || '#94a3b8';
      return '<div class="tv-ranking-row"><span>' + (index + 1) + '</span><strong class="tv-ranking-team" style="--team:' + esc(color) + '">' + esc(row.name) + '</strong><b>' + esc(value) + '</b><span>' + esc(row.gamesWon) + ' - ' + esc(row.gamesLost) + '</span><span class="tv-win">' + esc(row.wins) + '</span><span class="tv-loss">' + esc(row.losses) + '</span><span>' + esc(row.played) + '</span></div>';
    }).join('') + '</div>';
  }
  function resultHtml(result, index) {
    function players(label) {
      return String(label || '').split(' / ').map(function (name) { return '<span>' + esc(name.trim()) + '</span>'; }).join('');
    }
    var a = Number(result.scoreA), b = Number(result.scoreB);
    var scoreAClass = Number.isFinite(a) && Number.isFinite(b) && a !== b ? (a > b ? ' tv-result-win' : ' tv-result-loss') : '';
    var scoreBClass = Number.isFinite(a) && Number.isFinite(b) && a !== b ? (b > a ? ' tv-result-win' : ' tv-result-loss') : '';
    return '<div class="tv-result' + (index === 0 && result.hasScore ? ' tv-result-latest' : '') + '" data-result-id="' + esc(result.id || '') + '" data-result-at="' + esc(result.resultAt || 0) + '"><small>' + esc(result.time) + ' · JOGO ' + esc(result.number) + ' · ' + esc(result.category) + (result.duration ? ' · ' + esc(result.duration) : '') + '</small>' +
      '<div class="tv-result-match"><div class="tv-result-side tv-result-left" style="--team:' + esc(result.ta.color) + '"><span class="tv-result-team">' + esc(result.ta.name || 'Time') + '</span><div class="tv-result-players">' + players(result.a) + '</div><strong class="tv-result-side-score' + scoreAClass + '">' + esc(result.scoreA) + '</strong></div>' +
      '<div class="tv-result-versus">VS</div>' +
      '<div class="tv-result-side tv-result-right" style="--team:' + esc(result.tb.color) + '"><strong class="tv-result-side-score' + scoreBClass + '">' + esc(result.scoreB) + '</strong><div class="tv-result-players">' + players(result.b) + '</div><span class="tv-result-team">' + esc(result.tb.name || 'Time') + '</span></div></div></div>';
  }
  function nextGameHtml(game) {
    if (!game) return '<section class="tv-upcoming"><h2>PRÓXIMO JOGO</h2><p>Próximo jogo ainda não definido</p></section>';
    function players(label) {
      return String(label || '').split(' / ').map(function (name) { return '<span>' + esc(name.trim()) + '</span>'; }).join('');
    }
    return '<section class="tv-upcoming"><h2>PRÓXIMO JOGO</h2><small>JOGO ' + esc(game.number) + ' · ' + esc(game.category) + '</small>' +
      '<div class="tv-result-match"><div class="tv-result-side tv-result-left" style="--team:' + esc(game.ta.color) + '"><span class="tv-result-team">' + esc(game.ta.name || 'Time') + '</span><div class="tv-result-players">' + players(game.a) + '</div></div>' +
      '<div class="tv-result-versus">VS</div>' +
      '<div class="tv-result-side tv-result-right" style="--team:' + esc(game.tb.color) + '"><div class="tv-result-players">' + players(game.b) + '</div><span class="tv-result-team">' + esc(game.tb.name || 'Time') + '</span></div></div></section>';
  }
  function bracketsHtml(part) {
    var rounds = part.rounds || [];
    var maxRound = rounds[rounds.length - 1] || 1;
    function roundName(round) {
      var distance = maxRound - round;
      return distance === 0 ? 'Final' : distance === 1 ? 'Semifinais' : distance === 2 ? 'Quartas de final' :
        distance === 3 ? 'Oitavas de final' : 'Fase preliminar';
    }
    var rows = (part.matches || []).filter(function (m) { return m.round === part.activeRound; });
    return '<section class="tv-brackets"><h2>ELIMINATÓRIAS · ' + esc(part.category) + '</h2>' +
      '<div class="tv-bracket-rounds">' + rounds.map(function (round) {
        return '<span class="' + (round === part.activeRound ? 'tv-bracket-round-active' : '') + '">' + esc(roundName(round)) + '</span>';
      }).join('<b>›</b>') + '</div><small>' + (part.provisional ? 'Prévia · duplas em formação' : 'Chave publicada') + '</small>' +
      '<div class="tv-bracket-list" data-tv-autoscroll="bracket-' + esc(part.category) + '">' +
      (rows.length ? rows.map(function (m) {
        return '<div class="tv-bracket-match' + (m.inCourt ? ' tv-bracket-match-in-court' : '') + '"><span>' +
          (m.third ? '3º LUGAR' : m.number ? 'JOGO ' + esc(m.number) : 'CONFRONTO') + '</span>' +
          '<strong>' + esc(m.a || 'A definir') + '</strong><b>×</b><strong>' + esc(m.b || 'A definir') + '</strong></div>';
      }).join('') : '<p>Duplas e confrontos em formação</p>') + '</div></section>';
  }
  function bodyHtml(snapshot) {
    var theme = snapshot.theme || { background: '#060d1a', primary: '#0d1b2e', secondary: '#0d1b2e', title: '#ffffff' };
    var frame = '<div class="tv-theme" style="--tv-primary:' + esc(theme.primary) + ';--tv-secondary:' + esc(theme.secondary) +
      ';--tv-title:' + esc(theme.title) + ';background:' + esc(theme.background) + '">';
    if (snapshot.tvLayout) return frame + customBodyHtml(snapshot) + '</div>';
    return frame + '<header class="tv-header">' + (snapshot.logo ? '<img src="' + esc(snapshot.logo) + '" alt="">' : '') + '<h1>' + esc(snapshot.name) + '</h1>' + fullscreenActionHtml() + '<time id="tv-now"></time></header>' +
      '<main class="tv-board"><div class="tv-left"><section class="tv-courts" style="--tv-court-rows:' + Math.ceil(snapshot.courts.length / 2) + '">' + snapshot.courts.map(cardHtml).join('') + '</section>' + nextGameHtml(snapshot.nextGame) + '</div>' +
      '<aside class="tv-sidebar"><section class="tv-rankings"><h2>CLASSIFICAÇÃO</h2>' +
      (snapshot.rankings.length ? snapshot.rankings.map(function (section) { return rankingHtml(section, snapshot.rankings.length > 1); }).join('') : '<p>Classificação em formação</p>') +
      '</section><section class="tv-results"><div class="tv-results-main"><h2>ÚLTIMOS RESULTADOS</h2><div class="tv-results-list" data-result-day="' + esc(snapshot.resultDay) + '">' +
      snapshot.results.map(resultHtml).join('') +
      '</div></div><div class="tv-qr"><img class="tv-qr-code" src="' + esc(snapshot.qrImage) + '" alt="QR para escolher App Store, Google Play ou versão web"><div class="tv-qr-brand"><img src="' + esc(snapshot.scoreplaceLogo) + '" alt=""><span>Abra no<br>Scoreplace</span></div></div>' +
      '</section></aside></main></div>';
  }
  function fullscreenActionHtml() {
    return '<button id="tv-fullscreen-action" type="button" aria-label="Ativar modo tela cheia">⛶ Tela cheia</button>';
  }
  function customBodyHtml(snapshot) {
    var layout = snapshot.tvLayout;
    function box(id, inner, supplied) {
      var b = supplied || layout.sections[id];
      return b.visible ? '<div class="tv-custom-box tv-custom-' + id + '" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + b.h + '%">' + inner + '</div>' : '';
    }
    var ranking = '<section class="tv-rankings"><h2>CLASSIFICAÇÃO</h2>' + (snapshot.rankings.length ? snapshot.rankings.map(function (s) { return rankingHtml(s, snapshot.rankings.length > 1); }).join('') : '<p>Classificação em formação</p>') + '</section>';
    var results = '<section class="tv-results"><div class="tv-results-main"><h2>ÚLTIMOS RESULTADOS</h2><div class="tv-results-list" data-result-day="' + esc(snapshot.resultDay) + '">' + snapshot.results.map(resultHtml).join('') + '</div></div></section>';
    var qr = '<div class="tv-qr"><img class="tv-qr-code" src="' + esc(snapshot.qrImage) + '" alt="QR para abrir o Scoreplace"><div class="tv-qr-brand"><img src="' + esc(snapshot.scoreplaceLogo) + '" alt=""><span>Abra no<br>Scoreplace</span></div></div>';
    function liveGame(id) {
      var game = snapshot.selectedMatches && snapshot.selectedMatches[id];
      if (!game) return '<section class="tv-focus-card"><h2>Escolha a partida</h2></section>';
      var title = game.third ? '3º E 4º LUGAR' : 'FINAL';
      function side(name, score, winner) {
        return '<div class="tv-focus-side' + (winner ? ' tv-focus-winner' : '') + '"><div class="tv-focus-players">' +
          String(name || '').split(' / ').map(function (player) { return '<span>' + esc(player.trim()) + '</span>'; }).join('') +
          '</div><strong>' + esc(score) + '</strong></div>';
      }
      return '<section class="tv-focus-card"><h2>' + title + ' · JOGO ' + esc(game.number) + '</h2>' +
        side(game.a, game.scoreA, game.winnerSide === 1) + '<div class="tv-focus-vs">VS</div>' +
        side(game.b, game.scoreB, game.winnerSide === 2) + '</section>';
    }
    function lineStanding(id) {
      var standing = snapshot.lineStandings && snapshot.lineStandings[id];
      if (!standing) return '<section class="tv-focus-standing"><h2>Escolha a classificação</h2></section>';
      return '<section class="tv-focus-standing"><h2>CLASSIFICAÇÃO · ' + esc(standing.title).toUpperCase() + '</h2>' +
        '<div class="tv-focus-standing-list" style="--tv-qr-clearance:' + layout.sections.qr.h + 'vh">' + (standing.rows.length ? standing.rows.map(function (row) {
          return '<div class="tv-focus-standing-row"><b>' + esc(row.pos) + 'º</b><span>' + esc(row.name) + '</span></div>';
        }).join('') : '<p>Classificação em andamento</p>') + '</div></section>';
    }
    var background = layout.backgroundMode === 'custom' ? layout.background : (snapshot.theme && snapshot.theme.background || '#060d1a');
    return '<main class="tv-custom-board" style="background:' + esc(background) + '">' +
      box('header', '<header class="tv-header">' + (snapshot.logo && !layout.sections.logo.visible ? '<img src="' + esc(snapshot.logo) + '" alt="">' : '') + '<h1>' + esc(snapshot.name) + '</h1>' + fullscreenActionHtml() + '<time id="tv-now"></time></header>') +
      box('courts', '<section class="tv-courts" data-tv-autoscroll="courts" style="--tv-court-rows:' + Math.ceil(snapshot.courts.length / 2) + '">' + snapshot.courts.map(function (card) { return cardHtml(card, layout.card); }).join('') + '</section>') +
      box('upcoming', nextGameHtml(snapshot.nextGame).replace('class="tv-upcoming"', 'class="tv-upcoming" data-tv-autoscroll="upcoming"')) +
      box('rankings', ranking.replace('class="tv-rankings"', 'class="tv-rankings" data-tv-autoscroll="rankings"')) + box('results', results) +
      (layout.bracketBoxes || []).map(function (b, index) {
        var part = (snapshot.brackets || []).find(function (entry) { return entry.category === b.category; }) ||
          { category:b.category, rounds:[], matches:[], activeRound:1, provisional:true };
        return box('bracket-' + index, bracketsHtml(part), b);
      }).join('') +
      ['live1', 'live2', 'live3', 'live4'].map(function (id) { return box(id, liveGame(id)); }).join('') +
      ['standing1', 'standing2', 'standing3', 'standing4'].map(function (id) { return box(id, lineStanding(id)); }).join('') +
      box('logo', snapshot.logo ? '<img class="tv-placed-logo" src="' + esc(snapshot.logo) + '" alt="Logo do torneio">' : '') +
      box('qr', qr) + '</main>';
  }
  // A janela continua viva durante o reload automático da aba principal. O
  // script nela mantém os relógios e volta a ler o estado assim que o opener
  // termina de carregar a versão nova.
  window._tvLiveBodyHtml = bodyHtml;
  function childScript(tournamentId, generation) {
    var id = JSON.stringify(String(tournamentId || '')).replace(/</g, '\\u003c');
    var origin = JSON.stringify(window.location.origin).replace(/</g, '\\u003c');
    return '<script>(function(){"use strict";var id=' + id + ',gen=' + Number(generation) + ',origin=' + origin + ';window.__tvGeneration=gen;var timer,resultPosition=0,resultCycle=0,resultAt=Date.now(),highlightedResultId="",pinVisibleMs=0,pinArmed=false,boxLoops={};' +
      'function fit(){if(typeof window.getComputedStyle!=="function")return;' +
      'document.querySelectorAll(".tv-team-tag,.tv-result-team,.tv-score").forEach(function(el){el.style.fontSize="";' +
      'var box=el.closest(".tv-side,.tv-result-side");if(!box||!box.clientHeight||!el.clientHeight)return;' +
      'var size=parseFloat(window.getComputedStyle(el).fontSize)||12,min=el.classList.contains("tv-team-tag")?7:el.classList.contains("tv-score")?12:7;' +
      'while(el.scrollHeight>el.clientHeight+1&&size>min){size=Math.max(min,size-.5);el.style.fontSize=size+"px";}});' +
      'document.querySelectorAll(".tv-upcoming .tv-result-players").forEach(function(box){var names=box.querySelectorAll("span");' +
      'names.forEach(function(el){el.style.fontSize="";});if(!box.clientHeight||!names.length)return;' +
      'var size=parseFloat(window.getComputedStyle(names[0]).fontSize)||12;' +
      'while(box.scrollHeight>box.clientHeight+1&&size>10){size=Math.max(10,size-.5);names.forEach(function(el){el.style.fontSize=size+"px";});}});}' +
      'function ensureCycle(){if(window.__tvGeneration!==gen)return;var list=document.querySelector(".tv-results-list");resultCycle=0;if(!list)return;' +
      'list.querySelectorAll("[data-tv-repeat]").forEach(function(node){node.remove();});' +
      'var originals=list.querySelectorAll(".tv-result");if(!originals.length||list.scrollHeight-list.clientHeight<=2||' +
      '(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches))return;' +
      'originals.forEach(function(node){var copy=node.cloneNode(true);if(copy.classList)copy.classList.remove("tv-result-pinned");copy.setAttribute("data-tv-repeat","");copy.setAttribute("aria-hidden","true");' +
      'copy.querySelectorAll("[id]").forEach(function(child){child.removeAttribute("id");});list.appendChild(copy);});' +
      'var first=list.querySelector("[data-tv-repeat]");resultCycle=first?first.offsetTop-originals[0].offsetTop:0;' +
      'if(resultCycle<=0){list.querySelectorAll("[data-tv-repeat]").forEach(function(node){node.remove();});resultCycle=0;}}' +
      'function syncResultPin(){var list=document.querySelector(".tv-results-list"),first=list&&list.querySelector(".tv-result:not([data-tv-repeat])");' +
      'var current=first&&first.classList&&first.classList.contains("tv-result-latest")&&first.getAttribute("data-result-id")||"";' +
      'var savedAt=first&&Number(first.getAttribute("data-result-at"))||0,key=current?current+"@"+savedAt:"";' +
      'if(key!==highlightedResultId){highlightedResultId=key;pinVisibleMs=0;' +
      'pinArmed=!!(current&&resultCycle&&savedAt&&Date.now()-savedAt>=0&&Date.now()-savedAt<30000);' +
      'if(pinArmed){resultPosition=0;list.scrollTop=0;}}if(first)first.classList.toggle("tv-result-pinned",pinArmed);}' +
      'function prepareBoxLoops(){var previous=boxLoops;boxLoops={};document.querySelectorAll("[data-tv-autoscroll]").forEach(function(node){' +
      'var key=node.getAttribute("data-tv-autoscroll"),old=previous[key];node.querySelectorAll(":scope > [data-tv-loop-repeat]").forEach(function(copy){copy.remove();});' +
      'if(node.scrollHeight<=node.clientHeight+2||!node.children.length)return;' +
      'var originals=Array.from(node.children),first=originals[0];originals.forEach(function(child){var copy=child.cloneNode(true);copy.setAttribute("data-tv-loop-repeat","");copy.setAttribute("aria-hidden","true");node.appendChild(copy);});' +
      'var repeat=node.querySelector(":scope > [data-tv-loop-repeat]");var cycle=repeat&&first?repeat.offsetTop-first.offsetTop:0;' +
      'if(cycle<2)return;var position=old?old.position%cycle:0;boxLoops[key]={node:node,cycle:cycle,position:position};node.scrollTop=position;});}' +
      'function reflow(){if(window.__tvGeneration!==gen)return;fit();ensureCycle();prepareBoxLoops();if(resultCycle){resultPosition=resultPosition%resultCycle;}' +
      'else resultPosition=0;var list=document.querySelector(".tv-results-list");if(list)list.scrollTop=resultPosition;syncResultPin();}' +
      'window.__tvFitLabels=fit;window.addEventListener("resize",reflow);window.addEventListener("load",reflow);' +
      'document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible"){resultAt=Date.now();reflow();}});' +
      'if(document.fonts&&document.fonts.ready)document.fonts.ready.then(reflow);' +
      'window.__tvReplaceMarkup=function(html){var root=document.getElementById("tv-root"),old=root&&root.querySelector(".tv-results-list");' +
      'var day=old&&old.getAttribute("data-result-day"),top=resultPosition;' +
      'if(!root)return;if(typeof document.createElement!=="function"){root.innerHTML=html;fit();ensureCycle();prepareBoxLoops();' +
      'var fallback=root.querySelector(".tv-results-list");resultPosition=fallback&&fallback.getAttribute("data-result-day")===day&&resultCycle?top%resultCycle:0;' +
      'if(fallback)fallback.scrollTop=resultPosition;syncResultPin();resultAt=Date.now();return;}' +
      'var draft=document.createElement("div");draft.innerHTML=html;' +
      'var incoming=draft.querySelector(".tv-results-list"),same=!!(old&&incoming&&day===incoming.getAttribute("data-result-day")&&' +
      'Array.from(old.querySelectorAll(".tv-result:not([data-tv-repeat])")).map(function(n){return n.outerHTML.replace(/\\s+tv-result-pinned\\b/g,"");}).join("")===incoming.innerHTML);' +
      'if(same)incoming.replaceWith(old);root.replaceChildren.apply(root,Array.from(draft.childNodes));fit();prepareBoxLoops();' +
      'if(!same)ensureCycle();var list=root.querySelector(".tv-results-list");' +
      'if(!same){resultPosition=list&&list.getAttribute("data-result-day")===day&&resultCycle?top%resultCycle:0;' +
      'if(list)list.scrollTop=resultPosition;}syncResultPin();resultAt=Date.now();};' +
      'function advance(){if(window.__tvGeneration!==gen)return;var now=Date.now(),elapsed=Math.min(64,Math.max(0,now-resultAt));resultAt=now;' +
      'var list=document.querySelector(".tv-results-list");if(list&&resultCycle&&document.visibilityState==="visible"&&' +
      '!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)){' +
      'if(pinArmed)pinVisibleMs+=elapsed;resultPosition+=elapsed*.022;var wrapped=resultPosition>=resultCycle;' +
      'if(wrapped)resultPosition%=resultCycle;list.scrollTop=resultPosition;' +
      'if(pinArmed&&pinVisibleMs>=30000&&wrapped){pinArmed=false;syncResultPin();}}' +
      'if(document.visibilityState==="visible"&&!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches))' +
      'Object.keys(boxLoops).forEach(function(key){var loop=boxLoops[key];loop.position=(loop.position+elapsed*.022)%loop.cycle;loop.node.scrollTop=loop.position;});' +
      'window.requestAnimationFrame(advance);}window.requestAnimationFrame(advance);' +
      'function signal(type){try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:type,id:id,gen:gen,visible:document.visibilityState==="visible"},origin);}catch(e){}}' +
      'function tick(){if(window.__tvGeneration!==gen){clearInterval(timer);return;}var now=Date.now();' +
      'if(now-(window.__tvParentBeat||0)>1800){try{var owner=window.opener;' +
      'var t=owner&&owner._findTournamentById&&owner._findTournamentById(id);' +
      'if(owner&&owner._tvLiveEnsureFresh&&(!t||!owner._tvLiveIsComplete(t)))owner._tvLiveEnsureFresh(id);' +
      'if(t&&owner._tvLiveIsComplete&&owner._tvLiveIsComplete(t)&&owner._tvLiveBuildSnapshot&&owner._tvLiveBodyHtml){var snap=owner._tvLiveBuildSnapshot(t,now);' +
      'var html=owner._tvLiveBodyHtml(snap);if(html!==window.__tvLastMarkup){window.__tvReplaceMarkup(html);window.__tvLastMarkup=html;}' +
      'window.__tvTiming=snap.timing;window.__tvLastSync=now;}}catch(e){}}' +
      'var clock=window.ScoreplaceMatchTiming,timing=window.__tvTiming;' +
      'if(clock&&timing)document.querySelectorAll("[data-tv-start]").forEach(function(node){' +
      'var state=clock.phaseAt(Number(node.getAttribute("data-tv-start")),timing,now);' +
      'node.className="tv-phase-"+state.phase;node.title=clock.title(state.phase);node.textContent=clock.text(state,now);});' +
      'var current=document.getElementById("tv-now");if(current)current.textContent=new Date(now).toLocaleTimeString("pt-BR");' +
      'signal("scoreplace-tv-heartbeat");' +
      'var warning=document.getElementById("tv-connection");if(warning)warning.hidden=!!window.__tvLastSync&&now-window.__tvLastSync<10000;' +
      '}' +
      'window.addEventListener("pagehide",function(){signal("scoreplace-tv-gone");});timer=setInterval(tick,1000);tick();})();</script>';
  }
  var styles = '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#060d1a;color:#ffffff;font-family:Arial,Helvetica,sans-serif}.tv-header{height:9vh;min-height:62px;display:flex;align-items:center;gap:1.2vw;padding:1vh 2vw;border-bottom:2px solid #19314b}.tv-header img{height:100%;max-width:8vw;object-fit:contain}.tv-header h1{flex:1;min-width:0;font-size:clamp(1.3rem,2.5vw,3rem);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-header time{margin-left:auto;color:#67e8f9;font-size:1.25vw;white-space:nowrap}.tv-board{height:91vh;display:grid;grid-template-columns:1fr 1fr;gap:1vw;padding:1vw}.tv-courts{min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,minmax(0,1fr));gap:.75vw}.tv-court,.tv-rankings,.tv-results{min-height:0;background:#0d1b2e;border:1px solid #1b3f61;border-radius:1vw;padding:.8vw}.tv-court{display:flex;flex-direction:column;overflow:hidden}.tv-court-top{display:flex;align-items:center;justify-content:space-between;gap:.5vw;color:#7dd3fc;min-height:1.5vw}.tv-court h2{font-size:clamp(.8rem,1.2vw,1.5rem);margin:0}.tv-court h2 small{font-size:.7em}.tv-court-top>span{color:#fbbf24;font-size:.85vw;font-weight:700}.tv-side{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;border-left:.35vw solid var(--team);background:#081321;margin-top:.35vw;padding:.3vw .55vw;min-height:0;flex:1}.tv-team{grid-column:1;font-size:1.2vw;font-weight:900;color:var(--team)}.tv-pair{grid-column:1;font-size:.7vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1}.tv-score{grid-column:2;grid-row:1/span 2;font-size:1.9vw}.tv-versus{text-align:center;color:#94a3b8;font-weight:900;line-height:1}.tv-timer{display:flex;justify-content:space-between;color:#34d399;font-size:.8vw;margin-top:.3vw}.tv-timer strong{font-variant-numeric:tabular-nums;font-size:1vw}.tv-court.empty{align-items:center;justify-content:center;color:#64748b}.tv-court.empty h2{color:#7dd3fc}.tv-sidebar{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:.75vw}.tv-rankings,.tv-results{overflow:hidden}.tv-sidebar h2{margin:0 0 .5vw;color:#fbbf24;font-size:1.3vw}.tv-ranking-group{overflow:auto;max-height:calc(100% - 2vw)}.tv-ranking-group h3{font-size:.9vw;margin:.4vw 0;color:#7dd3fc}.tv-ranking-row{display:grid;grid-template-columns:2vw 1fr 4vw;gap:.4vw;padding:.24vw;border-bottom:1px solid #1e3349;font-size:.9vw}.tv-ranking-row b{text-align:right;color:#fbbf24}.tv-result{border-bottom:1px solid #1e3349;padding:.4vw 0}.tv-result small{color:#7dd3fc;font-size:.7vw}.tv-result>div{display:grid;grid-template-columns:1fr auto 1fr;gap:.5vw;align-items:center;font-size:.8vw}.tv-result>div strong{text-align:center;font-size:1vw;color:#fff}.tv-result>div span:last-child{text-align:right}@media(orientation:portrait){.tv-header{height:7vh}.tv-header h1{font-size:3vw}.tv-header time{font-size:2vw}.tv-board{height:93vh;grid-template-columns:1fr;grid-template-rows:55% 45%;gap:1vh;padding:1vh}.tv-courts{gap:1vw}.tv-court{padding:1vw}.tv-court h2,.tv-sidebar h2{font-size:2vw}.tv-court-top>span,.tv-team,.tv-score{font-size:1.6vw}.tv-pair,.tv-timer,.tv-timer strong{font-size:1.2vw}.tv-sidebar{grid-template-rows:60% 40%;gap:1vh}.tv-ranking-row,.tv-result>div{font-size:1.3vw}.tv-ranking-group h3{font-size:1.5vw}.tv-result small{font-size:1vw}}</style>';
  styles = styles.replace('</style>',
    '.tv-sidebar h2{font-size:clamp(1.2rem,1.5vw,2rem)}' +
    '.tv-header time{font-size:clamp(1.5rem,2vw,3rem);font-weight:800;font-variant-numeric:tabular-nums}' +
    '.tv-win{color:#4ade80}.tv-loss{color:#f87171}' +
    '.tv-court-top{display:flex;flex-direction:row;align-items:center;justify-content:space-between;gap:.4vw;border-bottom:1px solid #314151;padding-bottom:.25vw}.tv-court-top h2{color:#38bdf8;font-size:clamp(.85rem,1.1vw,1.5rem);white-space:nowrap}.tv-court-top>span{color:#fbbf24;font-size:clamp(.65rem,.78vw,1rem);font-weight:800;text-align:right}.tv-side{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:1fr;align-items:stretch;gap:.55vw;border-left:0;border-radius:.45vw;min-width:0;padding:.35vw;background:#222}.tv-team-tag{display:flex;align-items:center;justify-content:center;writing-mode:vertical-rl;transform:rotate(180deg);padding:.25vw .15vw;border:1px solid var(--team);border-radius:999px;background:color-mix(in srgb,var(--team) 28%,#222);color:#fff;font-size:clamp(.65rem,.8vw,1rem);font-weight:900;white-space:nowrap}.tv-players{min-width:0;display:flex;flex-direction:column;justify-content:space-evenly;gap:.15vw}.tv-players span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff;font-size:clamp(.8rem,1vw,1.3rem);font-weight:750}.tv-score{grid-column:3;grid-row:1;align-self:center;min-width:2vw;padding:.1em .3em;border:1px solid #555;border-radius:.35em;background:#303030;text-align:center;font-size:clamp(1.4rem,2.3vw,3rem)}' +
    '.tv-versus{font-size:clamp(.7rem,.8vw,1rem);letter-spacing:.1em}.tv-court-footer{display:flex;justify-content:flex-end;align-items:center;gap:.5vw;margin-top:.35vw;color:#34d399;font-weight:800}.tv-court-footer strong{font-variant-numeric:tabular-nums;font-size:clamp(1rem,1.2vw,1.8rem)}' +
    '.tv-sidebar{grid-template-rows:60% 40%}' +
    '.tv-rankings{display:flex;flex-direction:column}' +
    '.tv-ranking-group{overflow:hidden;max-height:none;min-height:0}' +
    '.tv-ranking-group h3{font-size:clamp(.9rem,1.05vw,1.35rem)}' +
    '.tv-ranking-head,.tv-ranking-row{display:grid;grid-template-columns:2vw minmax(0,1fr) 4vw 5.5vw repeat(3,2vw);gap:.35vw;align-items:center}' +
    '.tv-ranking-head{padding:.4vw .3vw;border-bottom:1px solid #45617b;color:#cbd5e1;font-size:clamp(.7rem,.75vw,1rem);font-weight:800}' +
    '.tv-ranking-row{min-height:0;padding:.16vw .3vw;border-bottom:1px solid #1e3349;font-size:clamp(.85rem,1.15vw,1.5rem);font-variant-numeric:tabular-nums}' +
    '.tv-rankings:has(>.tv-ranking-group:only-of-type) .tv-ranking-group{flex:1;min-height:0;max-height:none;display:grid;grid-template-rows:auto repeat(var(--tv-ranking-rows),minmax(0,1fr))}' +
    '.tv-ranking-row>span:not(:first-child),.tv-ranking-head>span:not(:nth-child(2)){text-align:center}' +
    '.tv-ranking-row b{text-align:center;color:#fbbf24;font-size:clamp(1.15rem,1.5vw,2rem)}' +
    '.tv-ranking-team{display:flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:.3em .55em;border:1px solid var(--team);border-left:.3em solid var(--team);border-radius:.5em;background:color-mix(in srgb,var(--team) 16%,#0d1b2e);color:#fff;font-size:clamp(1.1rem,1.4vw,1.85rem)}' +
    '.tv-result-match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:.35vw;align-items:stretch}.tv-result-side{display:flex;align-items:center;gap:.35vw;min-width:0;border-radius:.4vw;background:#222;padding:.25vw;border:1px solid color-mix(in srgb,var(--team) 45%,#444)}.tv-result-left{border-left:.25vw solid var(--team)}.tv-result-right{border-right:.25vw solid var(--team);justify-content:flex-end}.tv-result-team{flex:none;padding:.2vw;border:1px solid var(--team);border-radius:999px;background:color-mix(in srgb,var(--team) 26%,#222);writing-mode:vertical-rl;transform:rotate(180deg);font-size:clamp(.55rem,.65vw,.9rem);font-weight:900}.tv-result-right .tv-result-team{transform:none}.tv-result-players{display:flex;flex-direction:column;justify-content:space-around;min-width:0;gap:.15vw}.tv-result-players span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:clamp(.7rem,.85vw,1.2rem);font-weight:750}.tv-result-score{display:flex;align-items:center;gap:.22vw;font-size:clamp(.8rem,1vw,1.4rem);font-weight:900}.tv-result-score strong{font-size:clamp(1rem,1.5vw,2rem);font-variant-numeric:tabular-nums}.tv-result-win{color:#4ade80}.tv-result-loss{color:#f87171}' +
    '.tv-results{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:1vw}' +
    '.tv-results-main{display:flex;flex-direction:column;min-width:0;min-height:0}.tv-results-main>h2{flex:none}.tv-results-list{min-width:0;min-height:0;flex:1;overflow-y:auto;overscroll-behavior:contain;padding-right:.35vw}' +
    '.tv-result.tv-result-latest{border:2px solid #fbbf24;border-radius:.55vw;background:#16253a;box-shadow:0 0 14px #fbbf2440;padding:.3vw .4vw;margin-bottom:.25vw}.tv-result.tv-result-pinned{position:sticky;top:0;z-index:2;box-shadow:0 3px 18px #000b,0 0 16px #fbbf2466}' +
    '.tv-court.tv-court-latest{border:3px solid #fbbf24;box-shadow:0 0 18px #fbbf2466}' +
    '.tv-court-footer strong.tv-phase-call{color:#38bdf8}.tv-court-footer strong.tv-phase-warmup{color:#fbbf24}.tv-court-footer strong.tv-phase-game{color:#4ade80}.tv-court-footer strong.tv-phase-overdue{color:#f87171}' +
    '.tv-result-left .tv-result-players span{text-align:left}.tv-result>div.tv-result-match .tv-result-left .tv-result-players span{text-align:left}.tv-result-right .tv-result-players span{text-align:right}' +
    '.tv-result>div.tv-result-match .tv-result-score strong{font-size:clamp(1rem,1.5vw,2rem);font-variant-numeric:tabular-nums}.tv-result>div.tv-result-match .tv-result-score strong.tv-result-win{color:#4ade80}.tv-result>div.tv-result-match .tv-result-score strong.tv-result-loss{color:#f87171}' +
    '.tv-qr{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:.55vw;width:clamp(112px,9vw,190px)}' +
    '.tv-qr-code{display:block;width:100%;aspect-ratio:1;background:#fff;padding:.25vw;border-radius:.5vw;object-fit:contain}' +
    '.tv-qr-brand{display:flex;align-items:center;justify-content:center;gap:.3vw;width:100%;color:#e2e8f0;font-size:clamp(.65rem,.75vw,1rem);font-weight:800;line-height:1.1}' +
    '.tv-qr-brand img{width:2vw;min-width:26px;height:auto}' +
    '.tv-results-list>h2{margin:0 0 .18vw}.tv-result{padding:.22vw 0 .28vw}.tv-result>small{display:block;margin:0 0 .18vw;line-height:1.15}.tv-result>div.tv-result-match{display:grid;grid-template-columns:minmax(0,1fr) 2.2vw minmax(0,1fr);gap:.3vw;align-items:stretch}.tv-result-side{min-height:4.8vw;padding:.25vw .35vw}.tv-result-players{flex:1;justify-content:center;gap:.1vw}.tv-result-players span{display:block;white-space:normal;overflow-wrap:anywhere;text-overflow:clip;line-height:1.1}.tv-result-left .tv-result-players{text-align:left}.tv-result-right .tv-result-players{text-align:right}.tv-result>div.tv-result-match strong.tv-result-side-score{flex:none;font-size:clamp(1.2rem,1.65vw,2.2rem);font-variant-numeric:tabular-nums}.tv-result>div.tv-result-match strong.tv-result-win{color:#4ade80}.tv-result>div.tv-result-match strong.tv-result-loss{color:#f87171}.tv-result-versus{display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:clamp(.7rem,.8vw,1rem);font-weight:900}' +
    '.tv-court.tv-court-latest{border:3px solid #fbbf24;box-shadow:0 0 18px #fbbf2466}' +
    '.tv-left{min-height:0;display:grid;grid-template-rows:minmax(0,1fr) clamp(112px,13vh,170px);gap:.75vw}' +
    '.tv-upcoming{min-height:0;overflow:hidden;background:#0d1b2e;border:1px solid #1b3f61;border-radius:1vw;padding:.55vw .8vw}' +
    '.tv-upcoming h2{margin:0;color:#fbbf24;font-size:clamp(.9rem,1.2vw,1.5rem)}.tv-upcoming>small{display:block;margin:.15vw 0;color:#7dd3fc;font-size:clamp(.7rem,.8vw,1rem)}.tv-upcoming>p{color:#cbd5e1;margin:.35vw 0}' +
    '.tv-upcoming .tv-result-match{display:grid;grid-template-columns:minmax(0,1fr) 2.2vw minmax(0,1fr);gap:.3vw;align-items:stretch;height:calc(100% - 2.8vw)}' +
    '.tv-upcoming .tv-result-side{min-height:0}.tv-upcoming .tv-result-left .tv-result-players,.tv-upcoming .tv-result-left .tv-result-players span{text-align:left}.tv-upcoming .tv-result-right .tv-result-players,.tv-upcoming .tv-result-right .tv-result-players span{text-align:right}' +
    '.tv-side{grid-template-rows:minmax(0,1fr);overflow:hidden}.tv-side>.tv-team-tag{min-height:0;max-height:100%;overflow:hidden}.tv-side>.tv-players{min-height:0;overflow:hidden}.tv-side>.tv-score{min-height:0;max-height:100%;overflow:hidden;line-height:1.1}.tv-versus{flex:none;position:relative;z-index:1}' +
    '.tv-result-match,.tv-upcoming .tv-result-match{grid-template-rows:minmax(0,1fr);min-height:0}.tv-result-side{min-height:0;overflow:hidden}.tv-result-team{min-height:0;max-height:100%;overflow:hidden;white-space:nowrap}.tv-result-players{min-height:0;overflow:hidden}.tv-upcoming .tv-result-players span{font-size:clamp(.75rem,.95vw,1.3rem)}' +
    '@media(orientation:portrait){.tv-header time{font-size:clamp(1.2rem,2.8vw,2.4rem)}.tv-sidebar{grid-template-rows:70% 30%}.tv-ranking-head,.tv-ranking-row{grid-template-columns:3vw minmax(0,1fr) 7vw 10vw repeat(3,4vw);gap:.5vw;font-size:clamp(.75rem,1.4vw,1.2rem)}.tv-ranking-row{min-height:2.9vh}.tv-ranking-team{font-size:clamp(.8rem,1.6vw,1.25rem)}.tv-ranking-row b{font-size:clamp(.8rem,1.6vw,1.25rem)}.tv-qr{width:clamp(90px,17vw,180px)}.tv-qr-brand img{width:3vw}}' +
    '#tv-root,.tv-theme{width:100%;height:100%}.tv-theme .tv-header{background:color-mix(in srgb,var(--tv-primary) 24%,#07111f)}.tv-theme .tv-header h1{color:var(--tv-title)}.tv-theme .tv-court,.tv-theme .tv-rankings,.tv-theme .tv-results,.tv-theme .tv-upcoming{background:color-mix(in srgb,var(--tv-primary) 18%,#0d1b2e);border-color:color-mix(in srgb,var(--tv-secondary) 30%,#1b3f61)}.tv-theme .tv-side,.tv-theme .tv-result-side{background:color-mix(in srgb,var(--tv-secondary) 12%,#222)}' +
    '.tv-custom-board{position:relative;width:100%;height:100%;overflow:hidden}.tv-custom-box{position:absolute;min-width:0;min-height:0;overflow:hidden}.tv-custom-box>.tv-header,.tv-custom-box>.tv-courts,.tv-custom-box>.tv-upcoming,.tv-custom-box>.tv-rankings,.tv-custom-box>.tv-brackets,.tv-custom-box>.tv-results,.tv-custom-box>.tv-qr{width:100%;height:100%;min-height:0;overflow:hidden}.tv-custom-box>.tv-header{padding:.35vw .8vw}.tv-custom-box>.tv-courts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}.tv-custom-results .tv-results{display:flex}.tv-custom-results .tv-results-main{width:100%}.tv-custom-qr .tv-qr{justify-content:flex-end}.tv-custom-qr .tv-qr-code{max-height:75%;width:auto;max-width:95%}.tv-custom-logo{display:flex;align-items:center;justify-content:center}.tv-placed-logo{display:block;width:100%;height:100%;object-fit:contain}' +
    '.tv-brackets{display:flex;flex-direction:column;background:#0d1b2e;border:1px solid #1b3f61;border-radius:.7vw;padding:.55vw;overflow:hidden}.tv-brackets h2{flex:none;color:#fbbf24;font-size:clamp(.9rem,1.15vw,1.5rem);margin:0 0 .4vw}.tv-bracket-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12vw),1fr));gap:.5vw;min-height:0;overflow:auto}.tv-bracket-category{min-width:0;border:1px solid #315376;border-radius:.5vw;padding:.4vw;background:#10223a}.tv-bracket-category h3{margin:0;color:#7dd3fc;font-size:clamp(.9rem,1vw,1.3rem)}.tv-bracket-category small{display:block;color:#cbd5e1;margin:.15vw 0 .35vw;font-size:clamp(.65rem,.7vw,.9rem)}.tv-bracket-match{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:.2vw;padding:.2vw;border-top:1px solid #315376;align-items:center;font-size:clamp(.65rem,.75vw,1rem)}.tv-bracket-match>span{grid-column:1/-1;color:#7dd3fc;font-size:.8em}.tv-bracket-match strong{overflow-wrap:anywhere;min-width:0}.tv-bracket-match strong:last-child{text-align:right}.tv-bracket-match b{color:#fbbf24}.tv-series-game.tv-series-latest-result{outline:2px solid #fbbf24;box-shadow:0 0 12px #fbbf2466}' +
    '.tv-custom-courts>.tv-courts{grid-template-rows:none;grid-auto-rows:minmax(115px,auto);align-content:start;overflow-y:auto;scrollbar-width:none}.tv-custom-courts>.tv-courts::-webkit-scrollbar,.tv-bracket-list::-webkit-scrollbar{display:none}.tv-custom-upcoming>.tv-upcoming,.tv-custom-rankings>.tv-rankings{overflow-y:auto;scrollbar-width:none}.tv-custom-rankings .tv-ranking-group{max-height:none;overflow:visible}.tv-brackets>.tv-bracket-rounds{display:flex;align-items:center;gap:.25vw;overflow:hidden;white-space:nowrap;color:#94a3b8;font-size:clamp(.6rem,.7vw,.95rem)}.tv-bracket-rounds span{overflow:hidden;text-overflow:ellipsis}.tv-bracket-rounds .tv-bracket-round-active{color:#fbbf24;font-weight:900}.tv-brackets>small{color:#cbd5e1;font-size:clamp(.65rem,.7vw,.9rem);margin:.2vw 0}.tv-bracket-list{flex:1;min-height:0;overflow-y:auto;scrollbar-width:none}.tv-bracket-match{border:1px solid #315376;border-radius:.3vw;margin-bottom:.25vw;background:#10223a}.tv-bracket-match-in-court{border:2px solid #4ade80;box-shadow:0 0 12px #4ade8066}.tv-series-game.tv-series-latest-result{outline:2px solid #fbbf24;box-shadow:0 0 12px #fbbf2466}' +
    '.tv-courts,.tv-custom-box>.tv-courts{grid-template-rows:repeat(var(--tv-court-rows,3),minmax(0,1fr))}.tv-custom-courts>.tv-courts{grid-template-rows:none;grid-auto-rows:minmax(115px,auto)}' +
    '.tv-court-series{padding:.35vw .55vw}.tv-court-series .tv-court-top{flex:none;min-height:0;padding-bottom:.12vw}.tv-court-series .tv-court-top h2{font-size:clamp(.9rem,1vw,1.35rem)}.tv-series-games{display:grid;grid-template-rows:repeat(3,minmax(0,1fr));flex:1;min-height:0;gap:.15vw}.tv-series-game{display:grid;grid-template-columns:4.2vw minmax(0,1fr) 1.2vw minmax(0,1fr);align-items:center;gap:.25vw;min-width:0;min-height:0;border-radius:.25vw;background:color-mix(in srgb,var(--tv-secondary) 15%,#16253a);padding:.1vw .3vw}.tv-series-game.tv-series-active{outline:1px solid #38bdf8;background:color-mix(in srgb,var(--tv-primary) 22%,#26394d)}.tv-series-game.tv-series-done{opacity:.88}.tv-series-game>b{color:#7dd3fc;font-size:clamp(.7rem,.75vw,1rem);white-space:nowrap}.tv-series-side{display:flex;align-items:center;justify-content:space-between;gap:.2vw;min-width:0;min-height:0;border-radius:.2vw;padding:.1vw .2vw}.tv-series-side.tv-series-win{background:#123b2b}.tv-series-side.tv-series-loss{background:#4b2027}.tv-series-players{display:flex;flex-direction:column;justify-content:center;min-width:0;min-height:0;line-height:1.05}.tv-series-players span{display:block;white-space:normal;overflow-wrap:anywhere;font-size:clamp(.68rem,.78vw,1.04rem);font-weight:750}.tv-series-right{flex-direction:row-reverse}.tv-series-right .tv-series-players{text-align:right}.tv-series-side strong{flex:none;color:#fff;font-size:clamp(.85rem,1vw,1.4rem);font-variant-numeric:tabular-nums}.tv-series-win strong{color:#4ade80}.tv-series-loss strong{color:#f87171}.tv-series-versus{text-align:center;color:#94a3b8;font-weight:900}.tv-court-series .tv-court-footer{flex:none;margin-top:.1vw}.tv-court-series .tv-court-footer strong{font-size:clamp(.8rem,.95vw,1.25rem)}' +
    '</style>');
  styles = styles.replace('</style>',
    '.tv-custom-qr{z-index:20}.tv-focus-card,.tv-focus-standing{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;padding:.7vw;background:color-mix(in srgb,var(--tv-primary) 18%,#0d1b2e);border:1px solid color-mix(in srgb,var(--tv-secondary) 30%,#1b3f61);border-radius:.7vw}' +
    '.tv-focus-card h2,.tv-focus-standing h2{flex:none;margin:0 0 .4vw;color:#7dd3fc;font-size:clamp(.85rem,1.1vw,1.5rem);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.tv-focus-side{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:.4vw;min-height:0;flex:1;padding:.2vw .5vw;background:#222;border-radius:.4vw}.tv-focus-winner{background:#123b2b}' +
    '.tv-focus-players{display:flex;flex-direction:column;justify-content:center;min-width:0;line-height:1.08}.tv-focus-players span{display:block;overflow-wrap:anywhere;font-size:clamp(.72rem,1vw,1.4rem);font-weight:750}' +
    '.tv-focus-side strong{font-size:clamp(1.1rem,1.8vw,2.5rem);font-variant-numeric:tabular-nums}.tv-focus-winner strong{color:#4ade80}.tv-focus-vs{flex:none;text-align:center;color:#94a3b8;font-size:clamp(.65rem,.75vw,1rem);font-weight:900}' +
    '.tv-focus-standing-list{flex:1;min-height:0;overflow:auto;padding-bottom:var(--tv-qr-clearance,2vw)}.tv-focus-standing-row{display:grid;grid-template-columns:2vw minmax(0,1fr);gap:.5vw;align-items:center;min-height:2.3vw;padding:.2vw .4vw;border-bottom:1px solid #39475b;font-size:clamp(.85rem,1.05vw,1.4rem)}.tv-focus-standing-row b{color:#fbbf24}.tv-focus-standing-row span{overflow-wrap:anywhere}' +
    '</style>');
  // O editor usa exatamente o HTML e o CSS da janela No ar. O iframe não
  // executa childScript: relógios e hora recebem o valor deste instante.
  window._tvLivePreviewDocument = function (snapshot) {
    if (!snapshot || !snapshot.tvLayout) return '';
    var now = Date.now();
    var markup = bodyHtml(snapshot)
      .replace('<time id="tv-now"></time>', '<time id="tv-now">' + esc(new Date(now).toLocaleTimeString('pt-BR')) + '</time>')
      .replace(/<strong data-tv-start="([^"]*)">00:00:00<\/strong>/g, function (whole, raw) {
        var start = Number(raw);
        if (!Number.isFinite(start) || !start || !clock) return whole;
        var phase = clock.phaseAt(start, snapshot.timing, now);
        return '<strong data-tv-start="' + esc(raw) + '" class="tv-phase-' + esc(phase.phase) + '" title="' + esc(clock.title(phase.phase)) + '">' + esc(clock.text(phase, now)) + '</strong>';
      });
    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><base href="' + esc(window.location.href) + '">' + styles +
      '</head><body><div id="tv-root">' + markup + '</div></body></html>';
  };
  function isActive() {
    var current = window._currentBracketTournament;
    if (!popup || popup.closed || !current || String(current.id) !== popupTournamentId ||
        !lastHeartbeatVisible || !lastHeartbeatAt || Date.now() - lastHeartbeatAt > 10000) return false;
    try {
      return popup.document.visibilityState === 'visible' && !!popup.document.getElementById('tv-root');
    } catch (e) { return false; }
  }
  function syncButton() {
    var current = window._currentBracketTournament;
    if (popup && current && popupTournamentId && String(current.id) !== popupTournamentId) {
      stop(); return;
    }
    var on = isActive();
    window._tvLiveWindow = on ? popup : null;
    document.querySelectorAll('[data-tv-live-button]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(on));
      button.style.background = on ? '#dc2626' : '#451a1a';
      button.style.boxShadow = on ? '0 0 16px rgba(239,68,68,.7)' : 'none';
    });
  }
  window.addEventListener('message', function (event) {
    if (event.origin !== window.location.origin || !event.data ||
        (event.data.type !== 'scoreplace-tv-heartbeat' && event.data.type !== 'scoreplace-tv-gone')) return;
    var current = window._currentBracketTournament;
    if (!current || String(current.id) !== String(event.data.id)) return;
    var source = event.source, id = String(event.data.id), gen = Number(event.data.gen);
    if (!source || (event.data.type === 'scoreplace-tv-heartbeat' && source.closed) ||
        !Number.isFinite(gen) || gen <= 0) return;
    if (popup && source !== popup) return;
    if (!popup) {
      try { if (source.name !== 'scoreplace-live-tv-' + id) return; } catch (e) { return; }
    }
    if (event.data.type === 'scoreplace-tv-gone') {
      if (popup && source === popup && gen === popupGeneration) stop();
      return;
    }
    var highest = Number(highestGenerationById[id] || 0);
    if (gen < highest || (popup && popupGeneration && gen !== popupGeneration)) return;
    highestGenerationById[id] = Math.max(highest, gen);
    popup = source; popupTournamentId = id; popupGeneration = gen;
    lastHeartbeatAt = Date.now(); lastHeartbeatVisible = event.data.visible === true;
    syncButton();
  });
  function stop() {
    if (liveMatchesUnsubscribe) liveMatchesUnsubscribe();
    liveMatchesUnsubscribe = null; liveMatches = new Map(); liveMatchTournamentId = '';
    if (wakeSentinel && typeof wakeSentinel.release === 'function') wakeSentinel.release().catch(function () {});
    wakeSentinel = null;
    if (tick) clearInterval(tick);
    tick = null; popup = null; popupTournamentId = ''; popupGeneration = 0;
    lastHeartbeatAt = 0; lastHeartbeatVisible = false;
    lastMarkup = ''; lastCompleteTournament = null; window._tvLiveRefresh = null; syncButton();
  }
  window._tvLiveToggle = function () {
    if (isActive()) { popup.close(); stop(); return; }
    var tournament = window._currentBracketTournament;
    if (!tournament) return;
    var id = String(tournament.id || ''), nextPopup;
    try { nextPopup = window.open('about:blank', 'scoreplace-live-tv-' + id, 'popup,width=1920,height=1080'); }
    catch (e) { nextPopup = null; }
    if (!nextPopup) {
      syncButton();
      if (typeof window.showToast === 'function') window.showToast('Permita abrir uma janela para a TV.');
      return;
    }
    popup = nextPopup; popupTournamentId = id;
    popupGeneration = Math.max(Date.now(), Number(highestGenerationById[id] || 0) + 1);
    highestGenerationById[id] = popupGeneration;
    lastHeartbeatAt = 0; lastHeartbeatVisible = false;
    syncButton();
    try {
      popup.document.open();
      popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TV · ' + esc(tournament.name) + '</title>' + styles + '<script src="' + esc(window.location.origin + '/js/domain/match-timing.js?v=' + (window.SCOREPLACE_VERSION || '')) + '"></script><style>#tv-connection{position:fixed;right:1vw;bottom:1vw;z-index:20;padding:.4em .7em;border-radius:.5em;background:#7f1d1d;color:#fff;font-weight:800}#tv-connection[hidden],#tv-fullscreen-action[hidden]{display:none}#tv-fullscreen-action{flex:none;align-self:center;min-height:36px;padding:.3em .65em;border:2px solid #67e8f9;border-radius:.5em;background:#10263b;color:#fff;font:800 clamp(14px,1.1vw,22px) Arial;white-space:nowrap;cursor:pointer}html:fullscreen #tv-fullscreen-action{display:none}</style></head><body><div id="tv-root"></div><div id="tv-connection">Carregando jogos do servidor…</div>' + childScript(tournament.id, popupGeneration) + '</body></html>');
      popup.document.close();
      // O conteúdo de tv-root é substituído a cada atualização; o listener fica no documento.
      popup.document.addEventListener('click', function (event) {
        var button = event.target.closest && event.target.closest('#tv-fullscreen-action');
        if (!button) return;
        var doc = popup.document;
        var requestFullscreen = doc.documentElement.requestFullscreen || doc.documentElement.webkitRequestFullscreen;
        if (!requestFullscreen) { button.textContent = 'Tela cheia indisponível neste navegador'; return; }
        try {
          var request = requestFullscreen.call(doc.documentElement, { navigationUI: 'hide' });
          if (request && request.catch) request.catch(function (error) {
            button.textContent = 'Tela cheia bloqueada — clique novamente';
            button.title = error && error.message || 'O navegador recusou a tela cheia.';
          });
        } catch (error) {
          button.textContent = 'Tela cheia bloqueada — clique novamente';
          button.title = error && error.message || 'O navegador recusou a tela cheia.';
        }
      });
      popup.document.addEventListener('fullscreenchange', function () {
        var button = popup.document.getElementById('tv-fullscreen-action');
        if (button) button.hidden = !!popup.document.fullscreenElement;
      });
      try { popup.history.replaceState(null, '', window.location.origin + '/#tv-live/' + encodeURIComponent(id)); }
      catch (urlError) { /* O navegador pode manter about:blank ao bloquear alteração da URL. */ }
    } catch (e) {
      stop();
      if (typeof window.showToast === 'function') window.showToast('Não foi possível abrir a janela da TV.');
      return;
    }
    function keepTvAwake() {
      try {
        if (!popup || popup.closed || popup.document.visibilityState !== 'visible' || wakeSentinel || wakePending) return;
        if (!popup.navigator.wakeLock || typeof popup.navigator.wakeLock.request !== 'function') return;
      } catch (e) { syncButton(); return; }
      wakePending = true;
      popup.navigator.wakeLock.request('screen').then(function (sentinel) {
        wakeSentinel = sentinel;
        sentinel.addEventListener('release', function () {
          if (wakeSentinel === sentinel) wakeSentinel = null;
          setTimeout(keepTvAwake, 5000);
        });
      }).catch(function () { wakeSentinel = null; }).finally(function () { wakePending = false; });
    }
    try {
      popup.document.addEventListener('visibilitychange', keepTvAwake);
      popup.document.addEventListener('fullscreenchange', keepTvAwake);
    } catch (e) { stop(); return; }
    keepTvAwake();
    lastMarkup = '';
    lastCompleteTournament = completeTournament(tournament) ? tournament : null;
    var matchDb = window.FirestoreDB && window.FirestoreDB.db;
    if (liveMatchesUnsubscribe) liveMatchesUnsubscribe();
    liveMatches = new Map(); liveMatchTournamentId = id;
    if (matchDb) {
      liveMatchesUnsubscribe = matchDb.collection(id.startsWith('sb_') ? 'sandboxes' : 'tournaments')
        .doc(id).collection('matches').onSnapshot(function (snapshot) {
          snapshot.docChanges().forEach(function (change) {
            var matchId = String(change.doc.id);
            if (change.type === 'removed') liveMatches.delete(matchId);
            else {
              var match = (change.doc.data() || {}).jogo;
              if (match && String(match.id) === matchId) liveMatches.set(matchId, match);
            }
          });
          if (typeof window._tvLiveRefresh === 'function') window._tvLiveRefresh();
        }, function (error) {
          if (typeof window._warn === 'function') window._warn('[tv-live] jogos ao vivo indisponíveis', error);
          window._tvLiveEnsureFresh(id);
        });
    }
    window._tvLiveEnsureFresh(tournament.id);
    function refresh() {
      if (!popup || popup.closed) { stop(); return; }
      try {
        var current = typeof window._findTournamentById === 'function' ? window._findTournamentById(tournament.id) : null;
        var tickNow = Date.now();
        if (completeTournament(current)) lastCompleteTournament = current;
        else window._tvLiveEnsureFresh(tournament.id);
        var snapshot = window._tvLiveBuildSnapshot(lastCompleteTournament, tickNow);
        if (!snapshot) { syncButton(); return; }
        var markup = bodyHtml(snapshot);
        var root = popup.document.getElementById('tv-root');
        if (!root) { syncButton(); return; }
        if (markup !== lastMarkup) {
          if (typeof popup.__tvReplaceMarkup === 'function') popup.__tvReplaceMarkup(markup);
          else root.innerHTML = markup;
          lastMarkup = markup; popup.__tvLastMarkup = markup;
        }
        popup.__tvTiming = snapshot.timing;
        popup.__tvLastSync = tickNow;
        popup.__tvParentBeat = tickNow;
        var warning = popup.document.getElementById('tv-connection');
        if (warning) warning.hidden = true;
        popup.document.querySelectorAll('[data-tv-start]').forEach(function (node) {
          var start = Number(node.getAttribute('data-tv-start'));
          var event = clock.phaseAt(start, snapshot.timing, tickNow);
          var phase = event.phase;
          node.className = 'tv-phase-' + phase;
          node.title = clock.title(phase);
          node.textContent = clock.text(event, tickNow);
        });
        var now = popup.document.getElementById('tv-now');
        if (now) now.textContent = new Date().toLocaleTimeString('pt-BR');
        syncButton();
      } catch (e) {
        // Um erro de leitura/render não deve reabrir o documento da TV, o que
        // expulsaria o navegador do fullscreen. A próxima atualização tenta de novo.
        if (e && (e.name === 'SecurityError' || /SecurityError|cross-origin|permission denied/i.test(String(e.message || '')))) { stop(); return; }
        if (typeof window._warn === 'function') window._warn('[tv-live] atualização falhou', e);
      }
    }
    window._tvLiveRefresh = refresh;
    refresh();
    if (!popup) return;
    if (tick) clearInterval(tick);
    tick = setInterval(refresh, 1000);
    try { popup.focus(); } catch (e) { stop(); }
  };
  setInterval(syncButton, 1000);
  window.addEventListener('focus', syncButton);
  window.addEventListener('visibilitychange', syncButton);
})();
