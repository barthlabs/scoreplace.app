// Saída de TV da chave: uma segunda janela limpa, alimentada pelo torneio já
// acompanhado pelo listener canônico do app. Não escreve no torneio.
(function () {
  'use strict';
  var popup = null, tick = null, lastMarkup = '', wakeSentinel = null, wakePending = false;
  var popupTournamentId = '', popupGeneration = 0, lastHeartbeatAt = 0, lastHeartbeatVisible = false;
  var highestGenerationById = Object.create(null);
  var lastCompleteTournament = null, loadingTournament = false, lastLoadAttempt = 0;
  var clock = window.ScoreplaceMatchTiming;
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function timestamp(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value === 'number') return value;
    var n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
  }
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
  function rankingSections(t, matches, teams) {
    var core = window.ScoreplaceTeamCompetition;
    var configured = window._isNeonTournament && window._isNeonTournament(t) && core && typeof core.configurationForTournament === 'function'
      ? core.configurationForTournament(t) : (t.teamCompetition || ((t.phases || [])[0] || {}).teamCompetition);
    if (!core || !configured || configured.enabled !== true) return [];
    var cfg = typeof core.rankingConfigForTournament === 'function' ? core.rankingConfigForTournament(t) : core.normalize(configured);
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
  window._tvLiveBuildSnapshot = function (t, nowMs) {
    if (!t) return null;
    // O listener recebe uma cópia nova. Use a numeração canônica da chave.
    if (typeof window._assignGlobalGameNumbers === 'function') window._assignGlobalGameNumbers(t);
    var matches = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) : (t.matches || []);
    var teams = Array.isArray(t.competitionTeams) ? t.competitionTeams : [];
    var courtNames = courtsOf(t);
    var timing = clock.config(t);
    var now = nowMs == null ? Date.now() : nowMs;
    var allActive = matches.filter(function (m) {
      return m && !m.winner && !m.wo && !m.isBye && !m.isSitOut && m.court && (m.courtCalledAt || m.startedAt);
    }).sort(function (a, b) { return timestamp(b.courtCalledAt || b.startedAt) - timestamp(a.courtCalledAt || a.startedAt); });
    if (!courtNames.length) courtNames = Array.from(new Set(allActive.map(function (m) { return String(m.court); })));
    // A borda anuncia a próxima oportunidade de chamar pelo microfone. Cada
    // transição automática compete com uma chamada nova pelo instante em que
    // ocorreu; não basta lembrar qual jogo recebeu OK por último.
    var latestPhaseId = '', latestTransitionAt = 0;
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
        a: sideName(t, m, 'p1'), b: sideName(t, m, 'p2'), ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams),
        scoreA: gameScore(m, 1) === '–' ? '0' : gameScore(m, 1),
        scoreB: gameScore(m, 2) === '–' ? '0' : gameScore(m, 2),
        timerStart: timestamp(m.courtClockBaseAt || m.courtCalledAt || m.startedAt) };
    });
    var results = matches.filter(function (m) { return m && (m.winner || m.wo) && !m.isBye && !m.isSitOut; })
      .sort(function (a, b) { return timestamp(b.resultAt || b.completedAt || b.updatedAt) - timestamp(a.resultAt || a.completedAt || a.updatedAt); })
      .map(function (m) {
        var ended = timestamp(m.resultAt || m.completedAt);
        var anchor = timestamp(m.courtClockBaseAt || m.courtCalledAt);
        var gameStart = anchor ? anchor + (timing.call + timing.warmup) * 60000 : 0;
        if (!gameStart) gameStart = timestamp(m.startedAt);
        var duration = !m.wo && ended > gameStart && gameStart > 0 ? clock.elapsed(gameStart, ended) : '';
        return { number: m._gameNum || m.scheduledGameNumber || m.matchNumber || '', category: String(m.category || ''), a: sideName(t, m, 'p1'), b: sideName(t, m, 'p2'),
          ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams), scoreA: m.wo ? 'W.O.' : gameScore(m, 1, true), scoreB: m.wo ? 'W.O.' : gameScore(m, 2, true), duration: duration };
      });
    var site = String(window.SCOREPLACE_URL || 'https://scoreplace.app').replace(/\/$/, '');
    var qrUrl = t.id ? (typeof window._tournamentUrl === 'function' ? window._tournamentUrl(t.id) : site + '/#tournaments/' + encodeURIComponent(t.id)) : site;
    return { name: String(t.name || ''), logo: typeof window._tourLogoSrc === 'function' ? window._tourLogoSrc(t) : '',
      qrUrl: qrUrl, qrImage: typeof window._qrCodeUrl === 'function' ? window._qrCodeUrl(qrUrl, 320, false) :
        'https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=' + encodeURIComponent(qrUrl) + '&bgcolor=ffffff&color=1a1e2e&margin=10',
      scoreplaceLogo: site + '/icons/logo-podium.svg',
      courts: courtCards, rankings: rankingSections(t, matches, teams), results: results,
      timing: timing };
  };
  function sideHtml(label, team, score) {
    var players = String(label || '').split(' / ').map(function (name) { return name.trim(); }).filter(Boolean);
    return '<div class="tv-side" style="--team:' + esc(team.color) + '"><span class="tv-team-tag">' + esc(team.name || 'Time') + '</span>' +
      '<div class="tv-players">' + players.map(function (name) { return '<span>' + esc(name) + '</span>'; }).join('') + '</div>' +
      (score !== '' ? '<strong class="tv-score">' + esc(score) + '</strong>' : '') + '</div>';
  }
  function cardHtml(card) {
    if (!card.number && !card.a && !card.b) return '<article class="tv-court empty"><h2>' + esc(card.name) + '</h2><p>Aguardando chamada</p></article>';
    return '<article class="tv-court tv-court-active' + (card.latest ? ' tv-court-latest' : '') + '"><div class="tv-court-top"><h2>' + esc(card.name) + ' · JOGO ' + esc(card.number) + '</h2><span>' + esc(card.category) + '</span></div>' +
      sideHtml(card.a, card.ta, card.scoreA) + '<div class="tv-versus">VS</div>' + sideHtml(card.b, card.tb, card.scoreB) +
      '<div class="tv-court-footer"><strong data-tv-start="' + card.timerStart + '">00:00:00</strong></div></article>';
  }
  function rankingHtml(section, showTitle) {
    var byGames = section.ranking === 'games_diff';
    return '<div class="tv-ranking-group" style="--tv-ranking-rows:' + section.rows.length + '">' + (showTitle ? '<h3>' + esc(section.title) + '</h3>' : '') + '<div class="tv-ranking-head"><span>#</span><span>' + (section.title === 'Duplas' ? 'DUPLA' : 'TIME') + '</span><span>' + (byGames ? 'SALDO' : 'PTS') + '</span><span>GAMES</span><span class="tv-win">V</span><span class="tv-loss">D</span><span>J</span></div>' + section.rows.map(function (row, index) {
      var value = section.ranking === 'games_diff' ? (row.gamesDiff >= 0 ? '+' : '') + row.gamesDiff : row.points;
      var color = section.colors[String(row.teamId || row.id)] || '#94a3b8';
      return '<div class="tv-ranking-row"><span>' + (index + 1) + '</span><strong class="tv-ranking-team" style="--team:' + esc(color) + '">' + esc(row.name) + '</strong><b>' + esc(value) + '</b><span>' + esc(row.gamesWon) + ' - ' + esc(row.gamesLost) + '</span><span class="tv-win">' + esc(row.wins) + '</span><span class="tv-loss">' + esc(row.losses) + '</span><span>' + esc(row.played) + '</span></div>';
    }).join('') + '</div>';
  }
  function resultHtml(result) {
    function players(label) {
      return String(label || '').split(' / ').map(function (name) { return '<span>' + esc(name.trim()) + '</span>'; }).join('');
    }
    var a = Number(result.scoreA), b = Number(result.scoreB);
    var scoreAClass = Number.isFinite(a) && Number.isFinite(b) && a !== b ? (a > b ? ' tv-result-win' : ' tv-result-loss') : '';
    var scoreBClass = Number.isFinite(a) && Number.isFinite(b) && a !== b ? (b > a ? ' tv-result-win' : ' tv-result-loss') : '';
    return '<div class="tv-result"><small>JOGO ' + esc(result.number) + ' · ' + esc(result.category) + (result.duration ? ' · ' + esc(result.duration) : '') + '</small>' +
      '<div class="tv-result-match"><div class="tv-result-side tv-result-left" style="--team:' + esc(result.ta.color) + '"><span class="tv-result-team">' + esc(result.ta.name || 'Time') + '</span><div class="tv-result-players">' + players(result.a) + '</div><strong class="tv-result-side-score' + scoreAClass + '">' + esc(result.scoreA) + '</strong></div>' +
      '<div class="tv-result-versus">VS</div>' +
      '<div class="tv-result-side tv-result-right" style="--team:' + esc(result.tb.color) + '"><strong class="tv-result-side-score' + scoreBClass + '">' + esc(result.scoreB) + '</strong><div class="tv-result-players">' + players(result.b) + '</div><span class="tv-result-team">' + esc(result.tb.name || 'Time') + '</span></div></div></div>';
  }
  function bodyHtml(snapshot) {
    return '<header class="tv-header">' + (snapshot.logo ? '<img src="' + esc(snapshot.logo) + '" alt="">' : '') + '<h1>' + esc(snapshot.name) + '</h1><time id="tv-now"></time><button id="tv-fullscreen-action" type="button" title="Mover para a tela HDMI e ocultar a barra do navegador">⛶ Tela cheia</button></header>' +
      '<main class="tv-board"><section class="tv-courts">' + snapshot.courts.map(cardHtml).join('') + '</section>' +
      '<aside class="tv-sidebar"><section class="tv-rankings"><h2>CLASSIFICAÇÃO</h2>' +
      (snapshot.rankings.length ? snapshot.rankings.map(function (section) { return rankingHtml(section, snapshot.rankings.length > 1); }).join('') : '<p>Classificação ainda não configurada</p>') +
      '</section><section class="tv-results"><div class="tv-results-list"><h2>ÚLTIMOS RESULTADOS</h2>' +
      snapshot.results.map(resultHtml).join('') +
      '</div><div class="tv-qr"><img class="tv-qr-code" src="' + esc(snapshot.qrImage) + '" alt="QR para abrir o torneio no Scoreplace"><div class="tv-qr-brand"><img src="' + esc(snapshot.scoreplaceLogo) + '" alt=""><span>Abra no<br>Scoreplace</span></div></div>' +
      '</section></aside></main>';
  }
  // A janela continua viva durante o reload automático da aba principal. O
  // script nela mantém os relógios e volta a ler o estado assim que o opener
  // termina de carregar a versão nova.
  window._tvLiveBodyHtml = bodyHtml;
  function childScript(tournamentId, generation) {
    var id = JSON.stringify(String(tournamentId || '')).replace(/</g, '\\u003c');
    var origin = JSON.stringify(window.location.origin).replace(/</g, '\\u003c');
    return '<script>(function(){"use strict";var id=' + id + ',gen=' + Number(generation) + ',origin=' + origin + ';window.__tvGeneration=gen;var timer;' +
      'function signal(type){try{if(window.opener&&!window.opener.closed)window.opener.postMessage({type:type,id:id,gen:gen,visible:document.visibilityState==="visible"},origin);}catch(e){}}' +
      'function tick(){if(window.__tvGeneration!==gen){clearInterval(timer);return;}var now=Date.now();' +
      'if(now-(window.__tvParentBeat||0)>1800){try{var owner=window.opener;' +
      'var t=owner&&owner._findTournamentById&&owner._findTournamentById(id);' +
      'if(owner&&owner._tvLiveEnsureFresh&&(!t||!owner._tvLiveIsComplete(t)))owner._tvLiveEnsureFresh(id);' +
      'if(t&&owner._tvLiveIsComplete&&owner._tvLiveIsComplete(t)&&owner._tvLiveBuildSnapshot&&owner._tvLiveBodyHtml){var snap=owner._tvLiveBuildSnapshot(t,now);' +
      'var html=owner._tvLiveBodyHtml(snap);if(html!==window.__tvLastMarkup){document.getElementById("tv-root").innerHTML=html;window.__tvLastMarkup=html;}' +
      'window.__tvTiming=snap.timing;window.__tvLastSync=now;}}catch(e){}}' +
      'var clock=window.ScoreplaceMatchTiming,timing=window.__tvTiming;' +
      'if(clock&&timing)document.querySelectorAll("[data-tv-start]").forEach(function(node){' +
      'var state=clock.phaseAt(Number(node.getAttribute("data-tv-start")),timing,now);' +
      'node.className="tv-phase-"+state.phase;node.title=clock.title(state.phase);node.textContent=clock.text(state,now);});' +
      'var current=document.getElementById("tv-now");if(current)current.textContent=new Date(now).toLocaleTimeString("pt-BR");' +
      'signal("scoreplace-tv-heartbeat");' +
      'var warning=document.getElementById("tv-connection");if(warning)warning.hidden=!!window.__tvLastSync&&now-window.__tvLastSync<10000;' +
      '}document.addEventListener("click",function(event){var btn=event.target&&event.target.closest&&event.target.closest("#tv-fullscreen-action");if(!btn)return;' +
      'var target=document.documentElement;var action=document.fullscreenElement?document.exitFullscreen():target.requestFullscreen();' +
      'Promise.resolve(action).then(function(){btn.textContent=document.fullscreenElement?"⛶ Sair da tela cheia":"⛶ Tela cheia";})' +
      '.catch(function(){btn.textContent="Tela cheia indisponível · tente de novo";});});' +
      'window.addEventListener("pagehide",function(){signal("scoreplace-tv-gone");});timer=setInterval(tick,1000);tick();})();</script>';
  }
  var styles = '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#060d1a;color:#ffffff;font-family:Arial,Helvetica,sans-serif}.tv-header{height:9vh;min-height:62px;display:flex;align-items:center;gap:1.2vw;padding:1vh 2vw;border-bottom:2px solid #19314b}.tv-header img{height:100%;max-width:8vw;object-fit:contain}.tv-header h1{font-size:clamp(1.3rem,2.5vw,3rem);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-header time{margin-left:auto;color:#67e8f9;font-size:1.25vw;white-space:nowrap}.tv-board{height:91vh;display:grid;grid-template-columns:1fr 1fr;gap:1vw;padding:1vw}.tv-courts{min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,minmax(0,1fr));gap:.75vw}.tv-court,.tv-rankings,.tv-results{min-height:0;background:#0d1b2e;border:1px solid #1b3f61;border-radius:1vw;padding:.8vw}.tv-court{display:flex;flex-direction:column;overflow:hidden}.tv-court-top{display:flex;align-items:center;justify-content:space-between;gap:.5vw;color:#7dd3fc;min-height:1.5vw}.tv-court h2{font-size:clamp(.8rem,1.2vw,1.5rem);margin:0}.tv-court h2 small{font-size:.7em}.tv-court-top>span{color:#fbbf24;font-size:.85vw;font-weight:700}.tv-side{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;border-left:.35vw solid var(--team);background:#081321;margin-top:.35vw;padding:.3vw .55vw;min-height:0;flex:1}.tv-team{grid-column:1;font-size:1.2vw;font-weight:900;color:var(--team)}.tv-pair{grid-column:1;font-size:.7vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1}.tv-score{grid-column:2;grid-row:1/span 2;font-size:1.9vw}.tv-versus{text-align:center;color:#94a3b8;font-weight:900;line-height:1}.tv-timer{display:flex;justify-content:space-between;color:#34d399;font-size:.8vw;margin-top:.3vw}.tv-timer strong{font-variant-numeric:tabular-nums;font-size:1vw}.tv-court.empty{align-items:center;justify-content:center;color:#64748b}.tv-court.empty h2{color:#7dd3fc}.tv-sidebar{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:.75vw}.tv-rankings,.tv-results{overflow:hidden}.tv-sidebar h2{margin:0 0 .5vw;color:#fbbf24;font-size:1.3vw}.tv-ranking-group{overflow:auto;max-height:calc(100% - 2vw)}.tv-ranking-group h3{font-size:.9vw;margin:.4vw 0;color:#7dd3fc}.tv-ranking-row{display:grid;grid-template-columns:2vw 1fr 4vw;gap:.4vw;padding:.24vw;border-bottom:1px solid #1e3349;font-size:.9vw}.tv-ranking-row b{text-align:right;color:#fbbf24}.tv-result{border-bottom:1px solid #1e3349;padding:.4vw 0}.tv-result small{color:#7dd3fc;font-size:.7vw}.tv-result>div{display:grid;grid-template-columns:1fr auto 1fr;gap:.5vw;align-items:center;font-size:.8vw}.tv-result>div strong{text-align:center;font-size:1vw;color:#fff}.tv-result>div span:last-child{text-align:right}#tv-fullscreen-action{position:fixed;z-index:100;right:1vw;bottom:1vw;padding:.65em 1em;border:1px solid #67e8f9;border-radius:.5em;background:#123047;color:#fff;font:700 16px Arial,sans-serif;cursor:pointer;box-shadow:0 2px 12px #0009}#tv-fullscreen-action:focus-visible{outline:3px solid #fbbf24}html:fullscreen #tv-fullscreen-action{display:none}@media(orientation:portrait){.tv-header{height:7vh}.tv-header h1{font-size:3vw}.tv-header time{font-size:2vw}.tv-board{height:93vh;grid-template-columns:1fr;grid-template-rows:55% 45%;gap:1vh;padding:1vh}.tv-courts{gap:1vw}.tv-court{padding:1vw}.tv-court h2,.tv-sidebar h2{font-size:2vw}.tv-court-top>span,.tv-team,.tv-score{font-size:1.6vw}.tv-pair,.tv-timer,.tv-timer strong{font-size:1.2vw}.tv-sidebar{grid-template-rows:60% 40%;gap:1vh}.tv-ranking-row,.tv-result>div{font-size:1.3vw}.tv-ranking-group h3{font-size:1.5vw}.tv-result small{font-size:1vw}}</style>';
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
    '.tv-results-list{min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding-right:.35vw}' +
    '.tv-court.tv-court-latest{border:3px solid #fbbf24;box-shadow:0 0 18px #fbbf2466}' +
    '.tv-court-footer strong.tv-phase-call{color:#38bdf8}.tv-court-footer strong.tv-phase-warmup{color:#fbbf24}.tv-court-footer strong.tv-phase-game{color:#4ade80}.tv-court-footer strong.tv-phase-overdue{color:#f87171}' +
    '.tv-result-left .tv-result-players span{text-align:left}.tv-result-right .tv-result-players span{text-align:right}' +
    '.tv-result>div.tv-result-match .tv-result-score strong{font-size:clamp(1rem,1.5vw,2rem);font-variant-numeric:tabular-nums}.tv-result>div.tv-result-match .tv-result-score strong.tv-result-win{color:#4ade80}.tv-result>div.tv-result-match .tv-result-score strong.tv-result-loss{color:#f87171}' +
    '.tv-qr{display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:.55vw;width:clamp(112px,9vw,190px)}' +
    '.tv-qr-code{display:block;width:100%;aspect-ratio:1;background:#fff;padding:.25vw;border-radius:.5vw;object-fit:contain}' +
    '.tv-qr-brand{display:flex;align-items:center;justify-content:center;gap:.3vw;width:100%;color:#e2e8f0;font-size:clamp(.65rem,.75vw,1rem);font-weight:800;line-height:1.1}' +
    '.tv-qr-brand img{width:2vw;min-width:26px;height:auto}' +
    '.tv-results-list>h2{margin:0 0 .18vw}.tv-result{padding:.22vw 0 .28vw}.tv-result>small{display:block;margin:0 0 .18vw;line-height:1.15}.tv-result>div.tv-result-match{display:grid;grid-template-columns:minmax(0,1fr) 2.2vw minmax(0,1fr);gap:.3vw;align-items:stretch}.tv-result-side{min-height:4.8vw;padding:.25vw .35vw}.tv-result-players{flex:1;justify-content:center;gap:.1vw}.tv-result-players span{display:block;white-space:normal;overflow-wrap:anywhere;text-overflow:clip;line-height:1.1}.tv-result-left .tv-result-players{text-align:left}.tv-result-right .tv-result-players{text-align:right}.tv-result>div.tv-result-match strong.tv-result-side-score{flex:none;font-size:clamp(1.2rem,1.65vw,2.2rem);font-variant-numeric:tabular-nums}.tv-result>div.tv-result-match strong.tv-result-win{color:#4ade80}.tv-result>div.tv-result-match strong.tv-result-loss{color:#f87171}.tv-result-versus{display:flex;align-items:center;justify-content:center;color:#cbd5e1;font-size:clamp(.7rem,.8vw,1rem);font-weight:900}' +
    '.tv-court.tv-court-active{border:3px solid #22c55e}.tv-court.tv-court-latest{border:3px solid #fbbf24;box-shadow:0 0 18px #fbbf2466}' +
    '#tv-fullscreen-action{position:static;flex:none;white-space:nowrap;box-shadow:none;padding:.45em .7em;font-size:clamp(.8rem,.85vw,1rem)}html:fullscreen #tv-fullscreen-action{display:block}' +
    '@media(orientation:portrait){.tv-header time{font-size:clamp(1.2rem,2.8vw,2.4rem)}.tv-sidebar{grid-template-rows:70% 30%}.tv-ranking-head,.tv-ranking-row{grid-template-columns:3vw minmax(0,1fr) 7vw 10vw repeat(3,4vw);gap:.5vw;font-size:clamp(.75rem,1.4vw,1.2rem)}.tv-ranking-row{min-height:2.9vh}.tv-ranking-team{font-size:clamp(.8rem,1.6vw,1.25rem)}.tv-ranking-row b{font-size:clamp(.8rem,1.6vw,1.25rem)}.tv-qr{width:clamp(90px,17vw,180px)}.tv-qr-brand img{width:3vw}}' +
    '</style>');
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
      popup = null; popupTournamentId = ''; popupGeneration = 0; lastHeartbeatAt = 0; lastHeartbeatVisible = false;
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
      popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TV · ' + esc(tournament.name) + '</title>' + styles + '<script src="' + esc(window.location.origin + '/js/domain/match-timing.js?v=' + (window.SCOREPLACE_VERSION || '')) + '"></script><style>#tv-connection{position:fixed;right:1vw;bottom:1vw;z-index:20;padding:.4em .7em;border-radius:.5em;background:#7f1d1d;color:#fff;font-weight:800}#tv-connection[hidden]{display:none}</style></head><body><div id="tv-root"></div><div id="tv-connection">Carregando jogos do servidor…</div>' + childScript(tournament.id, popupGeneration) + '</body></html>');
      popup.document.close();
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
        if (markup !== lastMarkup) { root.innerHTML = markup; lastMarkup = markup; popup.__tvLastMarkup = markup; }
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
      } catch (e) { stop(); }
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
