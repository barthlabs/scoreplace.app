// Fast 8: a global queue of entries, shared by the controller and the server.
(function (root) {
  'use strict';
  function eightConfig(cfg) {
    if (!cfg || cfg.classifAtiva === false) return false;
    if (cfg.parceria === 'super_eight' || cfg.parceria === 'rotation_groups_8') return true;
    return cfg.parceria === 'rotation_groups' && Array.isArray(cfg.rotationCategoryRules) &&
      cfg.rotationCategoryRules.length > 0 && cfg.rotationCategoryRules.every(function (r) {
        return r && r.groupFormation && r.groupFormation.mode === 'size' && Number(r.groupFormation.value) === 8;
      });
  }
  function thirdPlace(phase) {
    return !(phase && phase.thirdPlacePolicy === 'optional_super8' && phase.thirdPlace === false);
  }
  function phaseEight(t, row) {
    var phase = (t.phases || [])[row.phaseIndex], c = phase && phase.classification || {};
    if (!phase || phase.kind !== 'classification') return false;
    if (phase.superEight === true || c.partnerRotation === 'unique_8') return true;
    var rule = (c.rotationCategoryRules || []).find(function (r) { return r.category === row.category; });
    return c.partnerRotation === 'groups' && !!rule && rule.groupFormation &&
      rule.groupFormation.mode === 'size' && Number(rule.groupFormation.value) === 8;
  }
  function groupKey(row) { return JSON.stringify([Number(row.phaseIndex || 0), String(row.category || ''), Number(row.groupNumber)]); }
  function config(t) {
    var schedule = t && t.scheduleWindow || {}, plan = schedule.interleavedPlan;
    var names = Array.isArray(t && t.courtNames) ? t.courtNames.map(String) : [];
    var count = Number(t && t.courtCount) || names.length;
    if (!names.length) for (var i = 1; i <= count; i++) names.push('Quadra ' + i);
    function bad(reason) { return { eligible:false, reason:reason, groups:[], courts:names }; }
    if (!plan || plan.schema !== 2 || !Array.isArray(plan.groupAssignments) || !plan.groupAssignments.length)
      return bad('Distribua os grupos em pelo menos duas entradas antes de ativar o Fast 8.');
    if (names.length !== count || new Set(names).size !== names.length || names.some(function (n) { return !n.trim(); }))
      return bad('Confira os nomes e a quantidade de quadras.');
    var rows = plan.groupAssignments, seen = new Set(), reserved = new Set(), entries = new Map();
    for (var row of rows) {
      if (!row || !phaseEight(t, row) || !Number.isSafeInteger(row.entry) || row.entry < 1 ||
          !Number.isSafeInteger(row.groupNumber) || row.groupNumber < 1 || !Array.isArray(row.courts) || row.courts.length !== 2)
        return bad('O Fast 8 exige grupos completos de oito atletas, com duas quadras na distribuição inicial.');
      var key = groupKey(row);
      if (seen.has(key)) return bad('A distribuição repete um grupo.');
      seen.add(key);
      if (!entries.has(row.phaseIndex)) entries.set(row.phaseIndex, new Set());
      entries.get(row.phaseIndex).add(row.entry);
      for (var court of row.courts) {
        var place = JSON.stringify([row.phaseIndex, row.entry, court]);
        if (!Number.isSafeInteger(court) || court < 1 || court > count || reserved.has(place))
          return bad('Cada quadra deve pertencer a um único grupo em cada entrada.');
        reserved.add(place);
      }
    }
    if (Array.isArray(plan.blocks) && plan.blocks.length) {
      var planned=new Set(plan.blocks.filter(function (block) {return block.kind==='groups';}).map(groupKey));
      if (planned.size!==seen.size || Array.from(planned).some(function (key) {return !seen.has(key);}))
        return bad('Distribua todos os grupos antes de ativar o Fast 8.');
    }
    for (var list of entries.values()) {
      if (list.size < 2 || list.size !== Math.max.apply(null, Array.from(list)))
        return bad('O Fast 8 exige pelo menos duas entradas consecutivas de grupos.');
    }
    return { eligible:true, reason:'', courts:names, groups:rows.map(function (r) {
      return Object.assign({}, r, { key:groupKey(r), courts:r.courts.map(function (n) { return names[n - 1]; }) });
    }) };
  }
  function enabled(t) { return !!(t && t.scheduleWindow && t.scheduleWindow.groupAlternation === true); }
  function groupFor(match, groups) {
    if (!match || !match.isMonarch || match.isBye || match.isSitOut || match.isTieBreak) return null;
    var peers = groups.filter(function (g) {
      return Number(g.phaseIndex || 0) === Number(match.phaseIndex || 0) && String(g.category || '') === String(match.category || '');
    });
    if (match.groupIdx != null) return peers.find(function (g) { return Number(g.groupNumber) === Number(match.groupIdx) + 1; }) || null;
    if (match.scheduledGroupLabel) return peers.find(function (g) { return g.label === match.scheduledGroupLabel; }) || null;
    return peers.length === 1 ? peers[0] : null;
  }
  function sequence(t, matches) {
    var settings = config(t), seen = new Set();
    if (!settings.eligible) return [];
    return (matches || []).filter(function (m) {
      if (!m || m.id == null || seen.has(String(m.id)) || !groupFor(m, settings.groups)) return false;
      seen.add(String(m.id)); return true;
    }).map(function (m) { return { match:m, group:groupFor(m, settings.groups) }; }).sort(function (a, b) {
      return Number(a.match.phaseIndex || 0) - Number(b.match.phaseIndex || 0) ||
        Number(a.match.round || 1) - Number(b.match.round || 1) || a.group.entry - b.group.entry ||
        Number(a.match.scheduledGameNumber || a.match._gameNum || 0) - Number(b.match.scheduledGameNumber || b.match._gameNum || 0) ||
        a.group.category.localeCompare(b.group.category) || a.group.groupNumber - b.group.groupNumber || String(a.match.id).localeCompare(String(b.match.id));
    });
  }
  function selection(t, matches, released, helpers) {
    var settings = config(t), occupancy = helpers && helpers.occupancy || root.ScoreplaceCourtOccupancy;
    var next = helpers && helpers.next || root.ScoreplaceNextMatch;
    var phaseIndex = Number(t && t.currentPhaseIndex || 0), rows = sequence(t, matches).filter(function (e) {
      return Number(e.match.phaseIndex || 0) === phaseIndex;
    });
    released = released || {};
    var active = occupancy && occupancy.activeMatches(matches, released, t) || [];
    function finished(m) { return !!(released[String(m.id)] || occupancy && occupancy.isFinished(m) || m.courtReleasedAt); }
    function issued(m) { return finished(m) || !!(m.courtCalledAt || m.startedAt || occupancy && occupancy.occupiesCourt(m)); }
    var incomplete = !!(t && Number(t._nJogos) > new Set((matches || []).filter(Boolean).map(function (m) { return String(m.id); })).size);
    var initialPassed=rows.some(function(e) {return issued(e.match) && (Number(e.match.round || 1)>1 || e.group.entry>1);});
    var first = rows.find(function (e) { return !issued(e.match); });
    var batch = first ? rows.filter(function (e) { return Number(e.match.round || 1) === Number(first.match.round || 1) && e.group.entry === first.group.entry; }) : [];
    function courts(m) {
      var g = groupFor(m, settings.groups);
      return g && !initialPassed && Number(m.round || 1) === 1 && g.entry === 1 ? g.courts.slice() : settings.courts.slice();
    }
    function check(m, court) {
      if (incomplete) return { ok:false, reason:'fast8-incomplete-draw', message:'Aguarde carregar todos os jogos do Fast 8; se persistir, confira o sorteio na ficha.' };
      if (!settings.eligible) return { ok:false, reason:'fast8-incomplete-draw', message:settings.reason };
      if (!occupancy || !next) return { ok:false, reason:'fast8-incomplete-draw', message:'Atualize a ficha para carregar as regras do Fast 8.' };
      var g = groupFor(m, settings.groups);
      if (!g) return { ok:true };
      if (Number(m.phaseIndex || 0) !== phaseIndex || !first || !batch.some(function (e) { return String(e.match.id) === String(m.id); }))
        return { ok:false, reason:'fast8-turn', message:'Fast 8: chame primeiro os jogos da entrada atual antes da próxima rodada.' };
      if (issued(m)) return { ok:false, reason:'fast8-turn', message:'Este jogo já foi chamado ou encerrado. Atualize a ficha.' };
      if (!next.knownSide(m.p1 || (m.team1 || []).join(' / ')) || !next.knownSide(m.p2 || (m.team2 || []).join(' / ')))
        return { ok:false, reason:'fast8-turn', message:'Aguarde a definição das duas duplas.' };
      if (rows.some(function (e) { return e.group.key === g.key && Number(e.match.round || 1) < Number(m.round || 1) && !finished(e.match); }))
        return { ok:false, reason:'fast8-player-busy', message:'Fast 8: aguarde terminar a rodada anterior deste grupo.' };
      if (next.conflictsWithActive(m, active)) return { ok:false, reason:'fast8-player-busy', message:'Uma das duplas já está em quadra. Aguarde a liberação.' };
      if (court && courts(m).indexOf(String(court)) === -1)
        return { ok:false, reason:'fast8-wrong-court', message:'Na entrada inicial, respeite as quadras distribuídas para este grupo.' };
      if (court && occupancy.occupant(active, court, m.id)) return { ok:false, reason:'fast8-wrong-court', message:'A quadra escolhida já está ocupada.' };
      return { ok:true };
    }
    var waiting = rows.filter(function (e) { return !issued(e.match); }).map(function (e) { return e.match; });
    var candidates = batch.filter(function (e) { return !issued(e.match); }).map(function (e) { return e.match; });
    var free = occupancy ? occupancy.freeCourts(settings.courts, active) : [];
    var available = candidates.filter(function (m) { return check(m).ok && free.some(function (c) { return courts(m).indexOf(c) >= 0; }); });
    return { incomplete:incomplete, eligible:settings.eligible, reason:settings.reason, groups:settings.groups, courts:settings.courts,
      waiting:waiting, batch:candidates, available:available, next:available[0] || candidates[0] || null,
      freeCourts:free, active:active, groupFor:function (m) { return groupFor(m, settings.groups); }, allowedCourts:courts, check:check };
  }
  var api = { thirdPlace:thirdPlace, enabled:enabled, config:config, eightConfig:eightConfig, groupKey:groupKey, groupFor:groupFor, sequence:sequence, selection:selection };
  root.ScoreplaceGroupAlternation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
