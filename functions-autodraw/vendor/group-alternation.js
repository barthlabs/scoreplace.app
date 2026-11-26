// Fast 8: planned court queues are suggestions; occupancy is enforced by the server.
(function (root) {
  'use strict';
  function eightConfig(cfg, populationFor) {
    if (!cfg || cfg.classifAtiva === false) return false;
    if (cfg.parceria === 'super_eight' || cfg.parceria === 'rotation_groups_8') return true;
    return cfg.parceria === 'rotation_groups' && Array.isArray(cfg.rotationCategoryRules) &&
      cfg.rotationCategoryRules.length > 0 && cfg.rotationCategoryRules.every(function (r) {
        if(!r || !r.groupFormation) return false;
        if(r.groupFormation.mode==='size') return Number(r.groupFormation.value)===8;
        var count=Number(r.groupFormation.value), people=typeof populationFor==='function'?Number(populationFor(r.category)):0;
        return r.groupFormation.mode==='count' && Number.isSafeInteger(count) && count>0 && people===count*8;
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
    if(c.partnerRotation!=='groups' || !rule || !rule.groupFormation) return false;
    if(rule.groupFormation.mode==='size') return Number(rule.groupFormation.value)===8;
    var count=(t.scheduleWindow?.interleavedPlan?.groupAssignments || []).filter(function(g) {
      return Number(g.phaseIndex || 0)===Number(row.phaseIndex || 0) && g.category===row.category;
    }).length;
    var people=population(t,row.category), requested=Number(rule.groupFormation.value);
    return rule.groupFormation.mode==='count' && Number.isSafeInteger(requested) && requested>0 &&
      (!count || count===requested) && people===requested*8;
  }
  function population(t,category) {
    var core=root.ScoreplaceSuperEight;
    if(!core && typeof require==='function') {
      try {core=require('./super-eight-core.js');} catch(error) {core=require('../views/super-eight-core.js');}
    }
    return core && core.categoryPopulation(t,category) || Number(t.maxParticipantsByCategory?.[category] ||
      t.maxParticipantsPerCategory || (!(t.combinedCategories || []).length || t.combinedCategories.length===1?t.maxParticipants:0)) || 0;
  }
  function groupKey(row) { return JSON.stringify([Number(row.phaseIndex || 0), String(row.category || ''), Number(row.groupNumber)]); }
  function categoryRules(t, phaseIndex) {
    var index=Number(phaseIndex || 0), phase=(t && t.phases || [])[index];
    if(index!==0) return [];
    return Array.isArray(t && t.fmt2 && t.fmt2.rotationCategoryRules)
      ? t.fmt2.rotationCategoryRules : phase && phase.classification && phase.classification.rotationCategoryRules || [];
  }
  function categoryEnabled(t, category, phaseIndex) {
    return categoryRules(t,phaseIndex).some(function (rule) {
      return String(rule.category || '')===String(category || '') && rule.groupAlternation===true;
    });
  }
  function categoryEligibility(rule, sizes) {
    if (!Array.isArray(sizes) || sizes.length<2)
      return {eligible:false,reason:'Alternar grupos exige pelo menos dois grupos efetivos nesta categoria.'};
    if (sizes.some(function (size) {return Number(size)!==8;}))
      return {eligible:false,reason:'O Fast 8 exige grupos completos de oito atletas.'};
    return {eligible:true,reason:''};
  }
  function legacyPending(t) {
    return !!(t && t.scheduleWindow && t.scheduleWindow.groupAlternation===true &&
      !categoryRules(t,0).some(function (rule) {return Object.hasOwn(rule,'groupAlternation');}));
  }
  function enabled(t) {
    // An obsolete enabled flag is an incomplete configuration, never normal mode.
    return legacyPending(t) || categoryRules(t,0).some(function(rule) {return rule.groupAlternation===true;}) || (t && t.phases || []).some(function (_,index) {
      return categoryRules(t,index).some(function (rule) {return rule.groupAlternation===true;});
    });
  }
  function compareQueue(a,b) {
    function at(m) {var time=Date.parse(m.scheduledAt || '');return Number.isFinite(time)?time:Infinity;}
    function number(m,key,fallback) {return Number(m[key] == null?fallback:m[key]) || 0;}
    var left=[at(a),number(a,'phaseIndex',0),number(a,'round',1),String(a.category || ''),
      number(a,'groupNumber',number(a,'groupIdx',-1)+1),number(a,'scheduledGameNumber',number(a,'sequence',0)),String(a.id)];
    var right=[at(b),number(b,'phaseIndex',0),number(b,'round',1),String(b.category || ''),
      number(b,'groupNumber',number(b,'groupIdx',-1)+1),number(b,'scheduledGameNumber',number(b,'sequence',0)),String(b.id)];
    for (var i=0;i<left.length;i++) if (left[i]!==right[i]) return left[i]<right[i]?-1:1;
    return 0;
  }
  function config(t) {
    var schedule = t && t.scheduleWindow || {}, plan = schedule.interleavedPlan;
    var names = Array.isArray(t && t.courtNames) ? t.courtNames.map(String) : [];
    var count = Number(t && t.courtCount) || names.length;
    if (!names.length) for (var i = 1; i <= count; i++) names.push('Quadra ' + i);
    function bad(reason) { return { eligible:false, reason:reason, groups:[], courts:names }; }
    if (legacyPending(t)) return bad('Atualize a configuração de alternância por categoria antes de chamar os jogos.');
    if (!plan || plan.schema !== 2 || !Array.isArray(plan.groupAssignments) || !plan.groupAssignments.length)
      return bad('Distribua os grupos nas quadras antes de ativar o Fast 8.');
    if (names.length !== count || new Set(names).size !== names.length || names.some(function (n) { return !n.trim(); }))
      return bad('Confira os nomes e a quantidade de quadras.');
    var allRows=plan.groupAssignments;
    var rows = allRows.filter(function(row) {return categoryEnabled(t,row.category,row.phaseIndex);});
    var seen = new Set(), reserved = new Set(), entries = new Map();
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
      var planned=new Set(plan.blocks.filter(function (block) {return block.kind==='groups' && categoryEnabled(t,block.category,block.phaseIndex);}).map(groupKey));
      if (planned.size!==seen.size || Array.from(planned).some(function (key) {return !seen.has(key);}))
        return bad('Distribua todos os grupos antes de ativar o Fast 8.');
    }
    var categories=new Map();
    rows.forEach(function(row) {var key=JSON.stringify([row.phaseIndex,row.category]);categories.set(key,(categories.get(key)||0)+1);});
    for (var index=0;index<Math.max(1,(t.phases || []).length);index++) {
      for (var rule of categoryRules(t,index)) if (rule.groupAlternation===true &&
        (categories.get(JSON.stringify([index,rule.category])) || 0)<2)
        return bad('Distribua pelo menos dois grupos efetivos de cada categoria ativada.');
    }
    for (var size of categories.values()) {
      if (size<2) return bad('Alternar grupos exige pelo menos dois grupos efetivos em cada categoria ativada.');
    }
    for(var sample of rows) {
      var groupCount=categories.get(JSON.stringify([sample.phaseIndex,sample.category])), people=population(t,sample.category);
      if(people && !categoryEligibility(null,Array(groupCount).fill(people/groupCount)).eligible)
        return bad('A formação efetiva da categoria deve ter pelo menos dois grupos completos de oito atletas.');
    }
    return { eligible:true, reason:'', courts:names, groups:rows.map(function (r) {
      return Object.assign({}, r, { key:groupKey(r), courts:r.courts.map(function (n) { return names[n - 1]; }) });
    }) };
  }
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
        compareQueue(a.match,b.match);
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
    function courts() { return settings.courts.slice(); }
    function plannedCourt(m) {
      if (m.scheduledCourt) return String(m.scheduledCourt);
      var g=groupFor(m,settings.groups);
      if (m.court && !m.courtCalledAt) return String(m.court);
      if (!g) return String(m.court || '');
      var peers=rows.filter(function(e) {return e.group.key===g.key && Number(e.match.round || 1)===Number(m.round || 1);})
        .map(function(e) {return e.match;}).sort(compareQueue);
      return g.courts[Math.max(0,peers.findIndex(function(peer) {return String(peer.id)===String(m.id);})) % g.courts.length];
    }
    function check(m, court) {
      var g = groupFor(m, settings.groups);
      if (!categoryEnabled(t,m && m.category,m && m.phaseIndex) && !legacyPending(t)) return {ok:true};
      if (incomplete) return { ok:false, reason:'fast8-incomplete-draw', message:'Aguarde carregar todos os jogos do Fast 8; se persistir, confira o sorteio na ficha.' };
      if (!settings.eligible) return { ok:false, reason:'fast8-incomplete-draw', message:settings.reason };
      if (!occupancy || !next) return { ok:false, reason:'fast8-incomplete-draw', message:'Atualize a ficha para carregar as regras do Fast 8.' };
      if (!g) return { ok:true };
      if (Number(m.phaseIndex || 0) !== phaseIndex)
        return { ok:false, reason:'fast8-turn', message:'Este jogo pertence a outra fase.' };
      if (issued(m)) return { ok:false, reason:'fast8-turn', message:'Este jogo já foi chamado ou encerrado. Atualize a ficha.' };
      if (!next.knownSide(m.p1 || (m.team1 || []).join(' / ')) || !next.knownSide(m.p2 || (m.team2 || []).join(' / ')))
        return { ok:false, reason:'fast8-turn', message:'Aguarde a definição das duas duplas.' };
      if (rows.some(function (e) { return e.group.key === g.key && Number(e.match.round || 1) < Number(m.round || 1) && !finished(e.match); }))
        return { ok:false, reason:'fast8-player-busy', message:'Fast 8: aguarde terminar a rodada anterior deste grupo.' };
      if (next.conflictsWithActive(m, active)) return { ok:false, reason:'fast8-player-busy', message:'Uma das duplas já está em quadra. Aguarde a liberação.' };
      if (court && settings.courts.indexOf(String(court)) === -1)
        return { ok:false, reason:'fast8-wrong-court', message:'Escolha uma quadra válida.' };
      if (court && occupancy.occupant(active, court, m.id)) return { ok:false, reason:'fast8-wrong-court', message:'A quadra escolhida já está ocupada.' };
      return { ok:true };
    }
    // Include independent categories too: activating one must not hide the other.
    var seenWaiting=new Set();
    var waiting=(matches || []).filter(function(m) {
      if(!m || m.id==null || Number(m.phaseIndex || 0)!==phaseIndex || m.isBye || m.isSitOut || issued(m) || seenWaiting.has(String(m.id))) return false;
      seenWaiting.add(String(m.id));return true;
    }).sort(compareQueue);
    var free = occupancy ? occupancy.freeCourts(settings.courts, active) : [];
    var byCourt={};
    settings.courts.forEach(function(court) {
      byCourt[court]=waiting.filter(function(m) {return plannedCourt(m)===court;});
    });
    var heads=settings.courts.map(function(court) {return byCourt[court][0];}).filter(Boolean);
    var releasedByCourt=helpers && helpers.lastReleasedByCourt || {};
    heads.sort(function(a,b) {
      var ac=plannedCourt(a),bc=plannedCourt(b),af=free.includes(ac),bf=free.includes(bc);
      if(af!==bf) return af?-1:1;
      var at=Date.parse(releasedByCourt[ac]?.releasedAt || '') || 0,bt=Date.parse(releasedByCourt[bc]?.releasedAt || '') || 0;
      return bt-at || compareQueue(a,b) || settings.courts.indexOf(ac)-settings.courts.indexOf(bc);
    });
    var available=heads.filter(function(m) {
      return free.includes(plannedCourt(m)) && check(m,plannedCourt(m)).ok && !next.conflictsWithActive(m,active);
    });
    var suggested=available[0] || heads[0] || null;
    return { incomplete:incomplete, eligible:settings.eligible, reason:settings.reason, groups:settings.groups, courts:settings.courts,
      waiting:waiting, batch:heads, available:available, next:suggested, byCourt:byCourt, plannedCourt:plannedCourt,
      freeCourts:free, active:active, groupFor:function (m) { return groupFor(m, settings.groups); }, allowedCourts:courts, check:check };
  }
  var api = { thirdPlace:thirdPlace, enabled:enabled, categoryRules:categoryRules,categoryEnabled:categoryEnabled,
    categoryEligibility:categoryEligibility,legacyPending:legacyPending,compareQueue:compareQueue,
    config:config, population:population, phaseEight:phaseEight, eightConfig:eightConfig, groupKey:groupKey, groupFor:groupFor, sequence:sequence, selection:selection };
  root.ScoreplaceGroupAlternation = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
