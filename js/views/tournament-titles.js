/* Títulos são derivados da última fase decidida. O nome comercial do torneio
 * nunca escolhe uma regra. Este módulo roda no navegador e no servidor. */
(function (root) {
  'use strict';
  function namesOf(match, side) {
    var ids = side === 'p1' ? match.team1Uids : match.team2Uids;
    if (Array.isArray(ids) && ids.length) return ids.filter(Boolean).map(String);
    var id = side === 'p1' ? match.p1Uid : match.p2Uid;
    return id ? [String(id)] : [];
  }
  function awardFromMatch(match, scope, label) {
    if (!match || !match.winner) return null;
    var winner = String(match.winner);
    var wonIds = Array.isArray(match.winnerUids) ? match.winnerUids.filter(Boolean).map(String)
      : (match.winnerUid ? [String(match.winnerUid)] : []);
    var p1Ids = namesOf(match, 'p1'), p2Ids = namesOf(match, 'p2');
    var sameIds = function (ids) { return wonIds.length && ids.length === wonIds.length &&
      ids.every(function (id) { return wonIds.indexOf(id) !== -1; }); };
    var side = sameIds(p1Ids) ? 'p1' : sameIds(p2Ids) ? 'p2'
      : winner === 'p1' || (winner === String(match.p1) && winner !== String(match.p2)) ? 'p1'
      : winner === 'p2' || (winner === String(match.p2) && winner !== String(match.p1)) ? 'p2' : null;
    if (!side) return null;
    return { scope: scope, label: label || '', winnerName: String(match[side]),
      winnerUids: namesOf(match, side), sourceMatchId: String(match.id || '') };
  }
  function awardFromRow(row, scope, label) {
    if (!row) return null;
    var ids = [row.uid, row.p1Uid, row.p2Uid, row.p3Uid, row.p4Uid].filter(Boolean).map(String);
    return { scope: scope, label: label || '', winnerName: String(row.displayName || row.name || ''),
      winnerUids: ids, winnerId: row.id ? String(row.id) : '', sourceMatchId: '' };
  }
  function phaseMatches(t, index) {
    var out = [], seen = {};
    function add(m) {
      if (!m) return;
      var key = m.id != null ? String(m.id) : '';
      if (key && seen[key]) return;
      if (key) seen[key] = true;
      out.push(m);
    }
    (t.matches || []).forEach(function (m) { if ((m.phaseIndex || 0) === index) add(m); });
    if (index === 0) {
      (t.rounds || []).forEach(function (r) {
        (r && r.matches || []).forEach(add);
        (r && r.monarchGroups || []).forEach(function (g) { (g && g.matches || []).forEach(add); });
      });
      (t.groups || []).forEach(function (g) { (g && g.matches || []).forEach(add); });
    }
    var slot = t.phaseRounds && t.phaseRounds[index];
    (slot && slot.rounds || []).forEach(function (r) { (r && r.matches || []).forEach(add); });
    return out;
  }
  function resolve(t, deps) {
    deps = deps || {};
    var phases = Array.isArray(t && t.phases) ? t.phases : [];
    if (!phases.length) return { ok: false, reason: 'no-phases', titles: [] };
    var index = t.currentPhaseIndex || 0;
    if (index !== phases.length - 1) return { ok: false, reason: 'more-phases', titles: [] };
    var phase = phases[index], matches = phaseMatches(t, index);
    var complete = deps.engine && typeof deps.engine.phaseComplete === 'function' && deps.engine.phaseComplete(t);
    if (!complete && phase.kind === 'elimination' && index === 0) {
      complete = matches.length > 0 && matches.every(function (m) {
        return m.isBye || (m.winner && m.p1 && m.p1 !== 'TBD' && m.p2 && m.p2 !== 'TBD');
      });
    }
    if (!complete) {
      return { ok: false, reason: 'phase-incomplete', titles: [] };
    }
    var titles = [];
    if (phase.kind === 'elimination') {
      var grandMatches = matches.filter(function (m) { return m.bracket === 'grandfinal' || m.bracket === 'grand'; });
      var gf = grandMatches.filter(function (m) { return m.winner; }).sort(function (a, b) {
        return Number(b.seriesGameNumber || (b.isExtra ? 2 : 1)) - Number(a.seriesGameNumber || (a.isExtra ? 2 : 1));
      })[0] || grandMatches[0];
      if (gf) {
        var global = awardFromMatch(gf, 'overall', '');
        if (global) titles.push(global);
      } else {
        var byLine = {};
        matches.forEach(function (m) {
          if (!m || m.isThirdPlace || m.bracket === 'thirdplace' || m.bracket === 'finalstage') return;
          var key = String(m.bracket || 'main');
          (byLine[key] || (byLine[key] = [])).push(m);
        });
        Object.keys(byLine).forEach(function (key) {
          var finals = byLine[key].filter(function (m) { return !m.nextMatchId && m.winner &&
            (!m.isBye || byLine[key].length === 1); });
          var roots = new Set(finals.map(function (m) { return String(m.seriesRootId || m.id); }));
          if (roots.size !== 1) return;
          finals.sort(function (a, b) { return Number(b.seriesGameNumber || 1) - Number(a.seriesGameNumber || 1); });
          var classicDouble = phase.elimination && phase.elimination.bracketType === 'double';
          var lineLabel = classicDouble && key === 'upper' ? 'Chave superior'
            : classicDouble && key === 'lower' ? 'Chave inferior' : finals[0].tierLabel || '';
          var title = awardFromMatch(finals[0], Object.keys(byLine).length > 1 ? 'line' : 'overall',
            lineLabel);
          if (title) titles.push(title);
        });
      }
    } else if (phase.kind === 'classification') {
      var teamCore = deps.teamCore;
      var teamConfig = teamCore && teamCore.rankingConfigForTournament && teamCore.rankingConfigForTournament(t);
      if (teamConfig && teamConfig.enabled) {
        var pairs = t.competitionPairs || [];
        var categories = teamConfig.aggregation === 'per_category'
          ? Array.from(new Set(matches.map(function (m) { return m.category; }).filter(Boolean))).sort() : [null];
        categories.forEach(function (category) {
          var chosen = category ? matches.filter(function (m) { return m.category === category; }) : matches;
          var rows = teamConfig.classificationUnit === 'pair'
            ? teamCore.pairStandings(pairs, chosen, teamConfig, category || undefined)
            : teamCore.standings(t.competitionTeams || [], chosen, teamConfig);
          var title = awardFromRow(rows[0], category ? 'category' : 'overall', category || '');
          if (title) titles.push(title);
        });
      } else if (phase.classification && phase.classification.structure === 'groups' &&
          Number(phase.gruposCount || t.gruposCount || 1) > 1) {
        var groups = deps.engine.prevPhaseGroups(t);
        groups.forEach(function (g, i) {
          var rows = deps.engine.groupTeamStandings(g, { tiebreakers: t.tiebreakers });
          var title = awardFromRow(rows[0], 'group', String(g.name || 'Grupo ' + (i + 1)));
          if (title) titles.push(title);
        });
      } else if (typeof deps.standings === 'function') {
        var ranking = deps.standings(t);
        var leader = awardFromRow(ranking && ranking[0], 'overall', '');
        if (leader) titles.push(leader);
      }
    }
    return titles.length ? { ok: true, titles: titles } : { ok: false, reason: 'no-title', titles: [] };
  }
  var api = { resolve: resolve, phaseMatches: phaseMatches };
  root.ScoreplaceTournamentTitles = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
