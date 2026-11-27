(function(root) {
  'use strict';
  var cache = new Map();
  function key(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim().toLocaleLowerCase('pt-BR');
  }
  function letter(value) {
    var label = String(value || '').trim();
    var match = label.match(/^(?:Grupo\s+)?([A-Z])(?:\b|\s*[·–-])/i);
    return match ? match[1].toUpperCase() : '';
  }
  function sameGroup(a, b) {
    var left = letter(a), right = letter(b);
    return !!left && left === right;
  }
  function forAthlete(events, name, group) {
    var target = key(name), g = letter(group);
    return (Array.isArray(events) ? events : []).filter(function(event) {
      return event && event.kind === 'substitution' && key(event.toName) === target &&
        (!event.group || !g || sameGroup(event.group, g));
    }).sort(function(a, b) { return String(a.at).localeCompare(String(b.at)); }).at(-1) || null;
  }
  function dateLabel(value) {
    var date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('pt-BR', {timeZone:'America/Sao_Paulo',
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
      hourCycle:'h23'}).format(date) + ' (Brasília)';
  }
  function description(event) {
    if (!event) return '';
    var at = dateLabel(event.at);
    if (event.kind === 'substitution') return event.toName + ' entrou em substituição a ' + event.fromName + (at ? ' em ' + at : '') + '.';
    if (event.kind === 'spelling') return 'Grafia corrigida: ' + event.fromName + ' → ' + event.toName + (at ? ' em ' + at : '') + '.';
    return 'Nome alterado: ' + event.fromName + ' → ' + event.toName + (at ? ' em ' + at : '') + '.';
  }
  async function load(tournamentId, fresh) {
    var id = String(tournamentId || '');
    if (!id || !root.FirestoreDB?.loadTournamentRosterHistory) throw new Error('Histórico do elenco indisponível.');
    var hit = cache.get(id);
    if (!fresh && hit && Date.now() - hit.at < 10000) return hit.promise;
    var promise = root.FirestoreDB.loadTournamentRosterHistory(id).then(function(result) {
      if (!result || !Array.isArray(result.events)) throw new Error('Histórico do elenco incompleto.');
      return result.events;
    });
    cache.set(id, {at:Date.now(),promise:promise});
    promise.catch(function() { if (cache.get(id)?.promise === promise) cache.delete(id); });
    return promise;
  }
  root.ScoreplaceRosterProvenance = { load:load, forAthlete:forAthlete, sameGroup:sameGroup,
    description:description, dateLabel:dateLabel };
})(typeof window !== 'undefined' ? window : globalThis);
