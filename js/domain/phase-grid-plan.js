// Grade editável das reservas de quadra por fase. Cada célula classificatória
// representa uma série de três partidas; cada célula eliminatória, uma partida.
(function (root) {
  'use strict';
  function minutes(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''))) return NaN;
    var parts = value.split(':'); return Number(parts[0]) * 60 + Number(parts[1]);
  }
  function clock(value) { return String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(value % 60).padStart(2, '0'); }
  function duration(tile, tournament, plan) {
    return tile.kind === 'groups' ? 3 * (Number(tournament.gameDuration) || 30) +
      (Number(tournament.callTime) || 0) + (Number(tournament.warmupTime) || 0) : Number(plan.eliminationMinutes);
  }
  function daysOf(plan, fallback) {
    var days = Array.isArray(fallback) ? fallback : (fallback ? [fallback] : []);
    if (days.length) return days;
    return plan && Array.isArray(plan.days) ? plan.days : [];
  }
  function dayOf(tile, plan, days) {
    var key = tile && tile.day || plan && plan.day;
    return days.find(function (day) { return day && day.day === key; }) || null;
  }
  function ordinal(tile, plan) { return String(tile.day || plan.day || '') + 'T' + tile.startTime; }
  function expand(plan, tournament) {
    if (!plan || !Array.isArray(plan.blocks)) return [];
    var tiles = [];
    plan.blocks.forEach(function (block, bi) {
      (block.courts || []).forEach(function (court, ci) {
        var tile = { id:'b' + bi + 'c' + ci, kind:block.kind, category:block.category,
          day:block.day || plan.day, startTime:block.startTime, court:Number(court), round:Number(block.round) || 0,
          groupNumber:block.kind === 'groups' ? Number(block.groupStart) + ci : 0 };
        tile.duration = duration(tile, tournament || {}, plan);
        tiles.push(tile);
      });
    });
    return tiles;
  }
  function stageKey(tile) { return tile.kind + '\u0000' + tile.category; }
  function groupLabel(tile) {
    if (tile.kind !== 'groups') return '';
    var number = Number(tile.groupNumber), letter = String.fromCharCode(64 + number);
    var tier = /diamante/i.test(tile.category) ? '1' : /ouro/i.test(tile.category) ? '2' : /prata/i.test(tile.category) ? '3' : '';
    return number >= 1 && number <= 26 ? letter + tier : 'Grupo ' + number;
  }
  function numbered(tiles, plan) {
    var result = {}, next = 1;
    tiles.slice().sort(function (a, b) {
      return ordinal(a, plan).localeCompare(ordinal(b, plan)) || a.court - b.court || a.id.localeCompare(b.id);
    }).forEach(function (tile) {
      result[tile.id] = next;
      next += tile.kind === 'groups' ? 3 : 1;
    });
    return result;
  }
  function outsideWindow(tile, day) {
    var at = minutes(tile && tile.startTime), start = minutes(day && day.startTime), end = minutes(day && day.endTime);
    return !Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end) ||
      at < start || at + Number(tile.duration) > end;
  }
  function validate(tiles, plan, day, options) {
    if (!Array.isArray(tiles) || !tiles.length || !plan) return 'Grade vazia.';
    var days = daysOf(plan, day);
    if (!days.length || days.some(function (d) {
      return !/^\d{4}-\d{2}-\d{2}$/.test(d.day || '') || !Number.isFinite(minutes(d.startTime)) ||
        !Number.isFinite(minutes(d.endTime)) || minutes(d.endTime) <= minutes(d.startTime);
    })) return 'Defina os dias de jogo com início e fim válidos.';
    var byCourt = {}, byStage = {}, groupNumbers = {};
    for (var i = 0; i < tiles.length; i++) {
      var tile = tiles[i], dayForTile = dayOf(tile, plan, days), at = minutes(tile.startTime), finish = at + tile.duration;
      var start = minutes(dayForTile && dayForTile.startTime), end = minutes(dayForTile && dayForTile.endTime);
      if (!Number.isInteger(tile.court) || tile.court < 1 || tile.court > Number(plan.courts) ||
          !dayForTile || !Number.isFinite(at) || at < start ||
          ((!options || options.allowOverflow !== true) && finish > end) ||
          !Number.isFinite(tile.duration) || tile.duration <= 0)
        return 'Um bloco está fora do horário ou da quadra disponível.';
      var occupied = byCourt[dayForTile.day + ':' + tile.court] || (byCourt[dayForTile.day + ':' + tile.court] = []);
      if (occupied.some(function (slot) { return at < slot.end && finish > slot.start; }))
        return 'Dois blocos ocupam a mesma quadra no mesmo horário.';
      occupied.push({ start:at, end:finish });
      var abs = Date.parse(dayForTile.day + 'T00:00:00Z') / 60000 + at;
      var key = stageKey(tile), stage = byStage[key] || (byStage[key] = { first:abs, last:abs + tile.duration, rounds:{} });
      stage.first = Math.min(stage.first, abs); stage.last = Math.max(stage.last, abs + tile.duration);
      if (tile.kind === 'groups') {
        if (!Number.isInteger(tile.groupNumber) || tile.groupNumber < 1 || groupNumbers[key + tile.groupNumber])
          return 'Há grupo repetido ou ausente na grade.';
        groupNumbers[key + tile.groupNumber] = true;
      } else {
        if (!Number.isInteger(tile.round) || tile.round < 1) return 'Rodada eliminatória inválida.';
        var round = stage.rounds[tile.round] || (stage.rounds[tile.round] = { first:abs, last:abs + tile.duration });
        round.first = Math.min(round.first, abs); round.last = Math.max(round.last, abs + tile.duration);
      }
    }
    for (var sk in byStage) {
      var stage = byStage[sk];
      if (!sk.startsWith('elimination\u0000')) continue;
      var cat = sk.slice('elimination\u0000'.length), groups = byStage['groups\u0000' + cat];
      if (groups && groups.last > stage.first) return 'A eliminatória começa antes de concluir a classificatória da categoria.';
      var rounds = Object.keys(stage.rounds).map(Number).sort(function (a, b) { return a - b; });
      for (var ri = 1; ri < rounds.length; ri++) if (stage.rounds[rounds[ri - 1]].last > stage.rounds[rounds[ri]].first)
        return 'Uma rodada eliminatória começa antes de terminar a anterior.';
    }
    return null;
  }
  function move(tiles, id, court, startTime, plan, day, targetDay) {
    var next = tiles.map(function (tile) { return Object.assign({}, tile); });
    var target = next.find(function (tile) { return tile.id === id; });
    if (!target) return { error:'Bloco não encontrado.' };
    target.court = Number(court); target.startTime = startTime;
    if (targetDay) target.day = targetDay;
    var error = validate(next, plan, day, { allowOverflow:true });
    return error ? { error:error } : { tiles:next };
  }
  function toPlan(plan, tiles) {
    var next = Object.assign({}, plan);
    next.blocks = tiles.slice().sort(function (a, b) {
      return ordinal(a, plan).localeCompare(ordinal(b, plan)) || a.court - b.court || a.id.localeCompare(b.id);
    }).map(function (tile) {
      var block = { kind:tile.kind, category:tile.category, day:tile.day || plan.day,
        startTime:tile.startTime, courts:[tile.court] };
      if (tile.kind === 'groups') block.groupStart = tile.groupNumber;
      else block.round = tile.round;
      return block;
    });
    return next;
  }
  function preset(tiles, plan, day, mode) {
    if (mode !== 'compact' && mode !== 'spread') return { error:'Modo de distribuição inválido.' };
    var days = daysOf(plan, day).slice().sort(function (a, b) { return a.day.localeCompare(b.day); });
    if (!days.length) return { error:'Defina os dias do torneio.' };
    function absolute(tile) {
      var key = tile.day || plan.day;
      return Date.parse(key + 'T00:00:00Z') / 60000 + minutes(tile.startTime);
    }
    var original = tiles.map(function (tile) { return Object.assign({}, tile); });
    var keys = [], ranges = {}, dependencies = {};
    original.forEach(function (tile) {
      var key = stageKey(tile), at = absolute(tile), finish = at + tile.duration;
      if (!ranges[key]) { keys.push(key); ranges[key] = { first:at, last:finish }; }
      ranges[key].first = Math.min(ranges[key].first, at);
      ranges[key].last = Math.max(ranges[key].last, finish);
    });
    keys.sort(function (a, b) { return ranges[a].first - ranges[b].first || a.localeCompare(b); });
    keys.forEach(function (key) {
      dependencies[key] = keys.filter(function (other) {
        return other !== key && ranges[other].last <= ranges[key].first;
      });
    });
    var pending = original.slice().sort(function (a, b) {
      return keys.indexOf(stageKey(a)) - keys.indexOf(stageKey(b)) || a.round - b.round ||
        a.groupNumber - b.groupNumber || a.court - b.court || a.id.localeCompare(b.id);
    });
    var placed = [], courtUntil = {};
    var spreadCursor = 0;
    for (var di = 0; di < days.length && pending.length; di++) {
      var currentDay = days[di], origin = Date.parse(currentDay.day + 'T00:00:00Z') / 60000;
      var start = minutes(currentDay.startTime), end = minutes(currentDay.endTime);
      for (var minute = start; minute < end && pending.length; minute += 5) {
        var at = origin + minute;
        for (var court = 1; court <= Number(plan.courts); court++) {
          var courtKey = currentDay.day + ':' + court;
          if ((courtUntil[courtKey] || origin + start) > at) continue;
          var ready = pending.filter(function (tile) {
            var key = stageKey(tile);
            if (minute + tile.duration > end) return false;
            if (dependencies[key].some(function (before) {
              return pending.some(function (p) { return stageKey(p) === before; }) ||
                placed.some(function (p) { return stageKey(p) === before && p.finish > at; });
            })) return false;
            if (tile.kind === 'elimination' && placed.some(function (p) {
              return stageKey(p) === key && p.round < tile.round && p.finish > at;
            })) return false;
            return tile.kind !== 'elimination' || !pending.some(function (p) {
              return stageKey(p) === key && p.round < tile.round;
            });
          });
          if (!ready.length) continue;
          var chosen;
          if (mode === 'spread') {
            var availableKeys = keys.filter(function (key) { return ready.some(function (tile) { return stageKey(tile) === key; }); });
            var chosenKey = availableKeys[spreadCursor % availableKeys.length];
            chosen = ready.find(function (tile) { return stageKey(tile) === chosenKey; });
            spreadCursor++;
          } else chosen = ready[0];
          chosen.day = currentDay.day; chosen.court = court; chosen.startTime = clock(minute);
          placed.push(Object.assign({ finish:at + chosen.duration }, chosen));
          courtUntil[courtKey] = at + chosen.duration;
          pending.splice(pending.indexOf(chosen), 1);
        }
      }
    }
    if (pending.length) return { error:'Esta distribuição ultrapassa os dias disponíveis. Amplie o horário ou reorganize a grade.' };
    var result = placed.map(function (tile) { delete tile.finish; return tile; });
    var error = validate(result, plan, days);
    return error ? { error:error } : { tiles:result };
  }
  var api = { minutes:minutes, clock:clock, duration:duration, expand:expand, validate:validate,
    move:move, toPlan:toPlan, preset:preset, stageKey:stageKey, groupLabel:groupLabel, numbered:numbered,
    outsideWindow:outsideWindow, daysOf:daysOf, dayOf:dayOf };
  root.ScoreplacePhaseGridPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
