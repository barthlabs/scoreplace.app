// Saída de TV da chave: uma segunda janela limpa, alimentada pelo torneio já
// acompanhado pelo listener canônico do app. Não escreve no torneio.
(function () {
  'use strict';
  var popup = null, tick = null, lastMarkup = '';
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
  function elapsed(start) {
    var sec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    return [Math.floor(sec / 3600), Math.floor(sec / 60) % 60, sec % 60]
      .map(function (n) { return String(n).padStart(2, '0'); }).join(':');
  }
  function gameScore(m, side) {
    var first = Array.isArray(m.sets) && m.sets.length ? m.sets[0] : null;
    var value = first ? first[side === 1 ? 'gamesP1' : 'gamesP2'] : m[side === 1 ? 'scoreP1' : 'scoreP2'];
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
  function rankingSections(t, matches, teams) {
    var core = window.ScoreplaceTeamCompetition;
    var configured = t.teamCompetition || ((t.phases || [])[0] || {}).teamCompetition;
    if (!core || !configured || configured.enabled !== true) return [];
    var cfg = core.normalize(configured), pairs = Array.isArray(t.competitionPairs) ? t.competitionPairs : [];
    var categories = cfg.aggregation === 'per_category'
      ? Array.from(new Set(matches.map(function (m) { return String(m.category || ''); }).filter(Boolean)))
      : [''];
    return categories.map(function (category) {
      var selected = category ? matches.filter(function (m) { return String(m.category || '') === category; }) : matches;
      var rows = cfg.classificationUnit === 'pair'
        ? core.pairStandings(pairs, selected, cfg, category || undefined)
        : core.standings(teams, selected, cfg);
      return { title: category || (cfg.classificationUnit === 'pair' ? 'Duplas' : 'Times'), rows: rows, ranking: cfg.ranking };
    });
  }
  window._tvLiveBuildSnapshot = function (t) {
    if (!t) return null;
    var matches = typeof window._collectAllMatches === 'function' ? window._collectAllMatches(t) : (t.matches || []);
    var teams = Array.isArray(t.competitionTeams) ? t.competitionTeams : [];
    var courtNames = courtsOf(t);
    var allActive = matches.filter(function (m) {
      return m && !m.winner && !m.wo && !m.isBye && !m.isSitOut && m.court && (m.courtCalledAt || m.startedAt);
    }).sort(function (a, b) { return timestamp(b.courtCalledAt || b.startedAt) - timestamp(a.courtCalledAt || a.startedAt); });
    if (!courtNames.length) courtNames = Array.from(new Set(allActive.map(function (m) { return String(m.court); })));
    var courtCards = courtNames.map(function (name) {
      var m = allActive.find(function (item) { return String(item.court) === name; });
      if (!m) return { name: name };
      var live = !!m.startedAt;
      return { name: name, number: m._gameNum || m.matchNumber || '', category: String(m.category || m.tierLabel || ''),
        a: String(m.p1 || ''), b: String(m.p2 || ''), ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams),
        scoreA: live ? gameScore(m, 1) : '', scoreB: live ? gameScore(m, 2) : '',
        timerStart: timestamp(live ? m.startedAt : m.courtCalledAt), timerLabel: live ? 'EM JOGO' : 'CHAMADO' };
    });
    var results = matches.filter(function (m) { return m && (m.winner || m.wo) && !m.isBye && !m.isSitOut; })
      .sort(function (a, b) { return timestamp(b.resultAt || b.completedAt || b.updatedAt) - timestamp(a.resultAt || a.completedAt || a.updatedAt); })
      .slice(0, 3).map(function (m) {
        return { number: m._gameNum || m.matchNumber || '', category: String(m.category || ''), a: String(m.p1 || ''), b: String(m.p2 || ''),
          ta: teamFor(m, 1, teams), tb: teamFor(m, 2, teams), scoreA: m.wo ? 'W.O.' : gameScore(m, 1), scoreB: m.wo ? 'W.O.' : gameScore(m, 2) };
      });
    return { name: String(t.name || ''), logo: typeof window._tourLogoSrc === 'function' ? window._tourLogoSrc(t) : '',
      courts: courtCards, rankings: rankingSections(t, matches, teams), results: results };
  };
  function sideHtml(label, team, score) {
    return '<div class="tv-side" style="--team:' + esc(team.color) + '"><span class="tv-team">' + esc(team.name || 'Time') + '</span>' +
      '<span class="tv-pair">' + esc(label) + '</span>' + (score !== '' ? '<strong class="tv-score">' + esc(score) + '</strong>' : '') + '</div>';
  }
  function cardHtml(card) {
    if (!card.number && !card.a && !card.b) return '<article class="tv-court empty"><h2>' + esc(card.name) + '</h2><p>Aguardando chamada</p></article>';
    return '<article class="tv-court"><div class="tv-court-top"><h2>' + esc(card.name) + ' <small>JOGO ' + esc(card.number) + '</small></h2><span>' + esc(card.category) + '</span></div>' +
      sideHtml(card.a, card.ta, card.scoreA) + '<div class="tv-versus">×</div>' + sideHtml(card.b, card.tb, card.scoreB) +
      '<div class="tv-timer"><span>' + esc(card.timerLabel) + '</span><strong data-tv-start="' + card.timerStart + '">00:00:00</strong></div></article>';
  }
  function rankingHtml(section) {
    return '<div class="tv-ranking-group"><h3>' + esc(section.title) + '</h3>' + section.rows.map(function (row, index) {
      var value = section.ranking === 'games_diff' ? (row.gamesDiff >= 0 ? '+' : '') + row.gamesDiff : row.points;
      return '<div class="tv-ranking-row"><span>' + (index + 1) + '</span><strong>' + esc(row.name) + '</strong><b>' + esc(value) + '</b></div>';
    }).join('') + '</div>';
  }
  function resultHtml(result) {
    return '<div class="tv-result"><small>JOGO ' + esc(result.number) + ' · ' + esc(result.category) + '</small><div><span style="color:' + esc(result.ta.color) + '">' + esc(result.ta.name || result.a) + '</span><strong>' + esc(result.scoreA) + ' × ' + esc(result.scoreB) + '</strong><span style="color:' + esc(result.tb.color) + '">' + esc(result.tb.name || result.b) + '</span></div></div>';
  }
  function bodyHtml(snapshot) {
    return '<header class="tv-header">' + (snapshot.logo ? '<img src="' + esc(snapshot.logo) + '" alt="">' : '') + '<h1>' + esc(snapshot.name) + '</h1><time id="tv-now"></time></header>' +
      '<main class="tv-board"><section class="tv-courts">' + snapshot.courts.map(cardHtml).join('') + '</section>' +
      '<aside class="tv-sidebar"><section class="tv-rankings"><h2>CLASSIFICAÇÃO</h2>' +
      (snapshot.rankings.length ? snapshot.rankings.map(rankingHtml).join('') : '<p>Classificação ainda não configurada</p>') +
      '</section><section class="tv-results"><h2>ÚLTIMOS 3 RESULTADOS</h2>' +
      (snapshot.results.length ? snapshot.results.map(resultHtml).join('') : '<p>Aguardando o primeiro resultado</p>') +
      '</section></aside></main>';
  }
  var styles = '<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#060d1a;color:#f8fafc;font-family:Arial,Helvetica,sans-serif}.tv-header{height:9vh;min-height:62px;display:flex;align-items:center;gap:1.2vw;padding:1vh 2vw;border-bottom:2px solid #19314b}.tv-header img{height:100%;max-width:8vw;object-fit:contain}.tv-header h1{font-size:clamp(1.3rem,2.5vw,3rem);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tv-header time{margin-left:auto;color:#67e8f9;font-size:1.25vw;white-space:nowrap}.tv-board{height:91vh;display:grid;grid-template-columns:1fr 1fr;gap:1vw;padding:1vw}.tv-courts{min-height:0;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(3,minmax(0,1fr));gap:.75vw}.tv-court,.tv-rankings,.tv-results{min-height:0;background:#0d1b2e;border:1px solid #1b3f61;border-radius:1vw;padding:.8vw}.tv-court{display:flex;flex-direction:column;overflow:hidden}.tv-court-top{display:flex;align-items:center;justify-content:space-between;gap:.5vw;color:#7dd3fc;min-height:1.5vw}.tv-court h2{font-size:clamp(.8rem,1.2vw,1.5rem);margin:0}.tv-court h2 small{font-size:.7em}.tv-court-top>span{color:#fbbf24;font-size:.85vw;font-weight:700}.tv-side{display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;border-left:.35vw solid var(--team);background:#081321;margin-top:.35vw;padding:.3vw .55vw;min-height:0;flex:1}.tv-team{grid-column:1;font-size:1.2vw;font-weight:900;color:var(--team)}.tv-pair{grid-column:1;font-size:.7vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#cbd5e1}.tv-score{grid-column:2;grid-row:1/span 2;font-size:1.9vw}.tv-versus{text-align:center;color:#94a3b8;font-weight:900;line-height:1}.tv-timer{display:flex;justify-content:space-between;color:#34d399;font-size:.8vw;margin-top:.3vw}.tv-timer strong{font-variant-numeric:tabular-nums;font-size:1vw}.tv-court.empty{align-items:center;justify-content:center;color:#64748b}.tv-court.empty h2{color:#7dd3fc}.tv-sidebar{min-height:0;display:grid;grid-template-rows:1fr 1fr;gap:.75vw}.tv-rankings,.tv-results{overflow:hidden}.tv-sidebar h2{margin:0 0 .5vw;color:#fbbf24;font-size:1.3vw}.tv-ranking-group{overflow:auto;max-height:calc(100% - 2vw)}.tv-ranking-group h3{font-size:.9vw;margin:.4vw 0;color:#7dd3fc}.tv-ranking-row{display:grid;grid-template-columns:2vw 1fr 4vw;gap:.4vw;padding:.24vw;border-bottom:1px solid #1e3349;font-size:.9vw}.tv-ranking-row b{text-align:right;color:#fbbf24}.tv-result{border-bottom:1px solid #1e3349;padding:.4vw 0}.tv-result small{color:#7dd3fc;font-size:.7vw}.tv-result>div{display:grid;grid-template-columns:1fr auto 1fr;gap:.5vw;align-items:center;font-size:.8vw}.tv-result>div strong{text-align:center;font-size:1vw;color:#fff}.tv-result>div span:last-child{text-align:right}@media(orientation:portrait){.tv-header{height:7vh}.tv-header h1{font-size:3vw}.tv-header time{font-size:2vw}.tv-board{height:93vh;grid-template-columns:1fr;grid-template-rows:55% 45%;gap:1vh;padding:1vh}.tv-courts{gap:1vw}.tv-court{padding:1vw}.tv-court h2,.tv-sidebar h2{font-size:2vw}.tv-court-top>span,.tv-team,.tv-score{font-size:1.6vw}.tv-pair,.tv-timer,.tv-timer strong{font-size:1.2vw}.tv-sidebar{grid-template-rows:60% 40%;gap:1vh}.tv-ranking-row,.tv-result>div{font-size:1.3vw}.tv-ranking-group h3{font-size:1.5vw}.tv-result small{font-size:1vw}}</style>';
  function syncButton() {
    var on = !!(popup && !popup.closed);
    window._tvLiveWindow = on ? popup : null;
    document.querySelectorAll('[data-tv-live-button]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(on));
      button.style.background = on ? '#dc2626' : '#451a1a';
      button.style.boxShadow = on ? '0 0 16px rgba(239,68,68,.7)' : 'none';
    });
  }
  function stop() {
    if (tick) clearInterval(tick);
    tick = null; popup = null; lastMarkup = ''; syncButton();
  }
  window._tvLiveToggle = function () {
    if (popup && !popup.closed) { popup.close(); stop(); return; }
    var tournament = window._currentBracketTournament;
    if (!tournament) return;
    popup = window.open('', 'scoreplace-live-tv-' + String(tournament.id || ''), 'popup,width=1920,height=1080');
    if (!popup) { stop(); if (typeof window.showToast === 'function') window.showToast('Permita abrir uma janela para a TV.'); return; }
    popup.document.open();
    popup.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TV · ' + esc(tournament.name) + '</title>' + styles + '</head><body><div id="tv-root"></div></body></html>');
    popup.document.close();
    lastMarkup = '';
    function refresh() {
      if (!popup || popup.closed) { stop(); return; }
      var current = typeof window._findTournamentById === 'function' ? window._findTournamentById(tournament.id) : null;
      var snapshot = window._tvLiveBuildSnapshot(current || tournament);
      if (!snapshot) return;
      var markup = bodyHtml(snapshot);
      if (markup !== lastMarkup) { popup.document.getElementById('tv-root').innerHTML = markup; lastMarkup = markup; }
      popup.document.querySelectorAll('[data-tv-start]').forEach(function (node) { node.textContent = elapsed(Number(node.getAttribute('data-tv-start'))); });
      var now = popup.document.getElementById('tv-now');
      if (now) now.textContent = new Date().toLocaleTimeString('pt-BR');
      syncButton();
    }
    refresh(); tick = setInterval(refresh, 1000);
    popup.focus();
  };
})();
