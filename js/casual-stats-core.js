/* casual-stats-core — regras puras das estatísticas de partidas casuais.
 *
 * A sala casual nunca gravou hostUid/guestUid. A identidade canônica está em
 * playerUids, players[].uid e (em salas antigas) participants[].uid; o vencedor
 * está em result.winner, ligado ao time do jogador em players[].team. Este módulo
 * é copiado para js/ e o gate de frescor impede que navegador e Functions voltem
 * a decidir troféus por esquemas diferentes.
 */
(function(root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CasualStatsCore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  function uid(value) { return String(value || '').trim(); }
  function isBot(value) { return /^bot[_\-]|^bot$/i.test(value); }

  function participantUids(match) {
    var seen = {};
    function add(value) {
      value = uid(value);
      if (value) seen[value] = true;
    }
    (Array.isArray(match && match.playerUids) ? match.playerUids : []).forEach(add);
    (Array.isArray(match && match.players) ? match.players : []).forEach(function(player) {
      add(player && player.uid);
    });
    (Array.isArray(match && match.participants) ? match.participants : []).forEach(function(player) {
      add(player && (player.uid || player.userId));
    });
    return Object.keys(seen);
  }

  function timestamp(value) {
    if (value && typeof value.toDate === 'function') value = value.toDate();
    var time = new Date(value).getTime();
    return isNaN(time) ? null : time;
  }

  function isQualified(match) {
    if (!match || match.status !== 'finished') return false;
    var ids = participantUids(match);
    if (ids.length < 2 || ids.some(isBot)) return false;
    var started = timestamp(match.createdAt || match.startedAt);
    var finished = timestamp(match.finishedAt || match.updatedAt);
    if (started !== null && finished !== null && finished > started && finished - started < 3 * 60 * 1000) return false;
    return true;
  }

  function applyDailyLimit(matches, limitPerDay) {
    if (typeof limitPerDay !== 'number') limitPerDay = 5;
    var byDay = {};
    return (matches || []).filter(function(match) {
      var time = timestamp(match.finishedAt || match.updatedAt || match.createdAt);
      if (time === null) return true;
      var date = new Date(time);
      var key = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
      byDay[key] = (byDay[key] || 0) + 1;
      return byDay[key] <= limitPerDay;
    });
  }

  function teamForUid(match, targetUid) {
    targetUid = uid(targetUid);
    var players = Array.isArray(match && match.players) ? match.players : [];
    for (var index = 0; index < players.length; index++) {
      var player = players[index] || {};
      var team = Number(player.team);
      if (uid(player.uid) === targetUid && (team === 1 || team === 2)) return team;
    }
    return null;
  }

  function didUidWin(match, targetUid) {
    var winner = match && match.result && Number(match.result.winner);
    var team = teamForUid(match, targetUid);
    return (winner === 1 || winner === 2) && team === winner;
  }

  return {
    participantUids: participantUids,
    isQualified: isQualified,
    applyDailyLimit: applyDailyLimit,
    teamForUid: teamForUid,
    didUidWin: didUidWin
  };
}));
