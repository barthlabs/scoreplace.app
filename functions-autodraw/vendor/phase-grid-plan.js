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
  function expectedSignatures(categories) {
    var result = [];
    (categories || []).forEach(function (cat) {
      var count = Number(cat.groups), size = 1;
      for (var group = 1; group <= count; group++) result.push('groups|' + cat.name + '|0|' + group);
      while (size * 2 <= count) size *= 2;
      var rounds = [];
      if (count > size) rounds.push(count - size);
      for (var pairs = size / 2; pairs >= 2; pairs /= 2) rounds.push(pairs);
      rounds.push(count >= 4 ? 2 : 1);
      rounds.forEach(function (matches, index) {
        for (var match = 0; match < matches; match++) result.push('elimination|' + cat.name + '|' + (index + 1) + '|0');
      });
    });
    return result.sort();
  }
  function signatures(tiles) {
    return tiles.map(function (tile) { return [tile.kind, tile.category, tile.round, tile.groupNumber].join('|'); }).sort();
  }
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
  function gameStarts(tile, tournament) {
    var first = minutes(tile.startTime);
    if (tile.kind !== 'groups') return [first];
    var play = Number(tournament.gameDuration) || 30;
    var preparation = (Number(tournament.callTime) || 0) + (Number(tournament.warmupTime) || 0);
    return [first, first + preparation + play, first + preparation + 2 * play];
  }
  function eliminationLabels(tiles) {
    var result = {}, categories = {};
    tiles.filter(function (tile) { return tile.kind === 'elimination'; }).forEach(function (tile) {
      var rounds = categories[tile.category] || (categories[tile.category] = {});
      (rounds[tile.round] || (rounds[tile.round] = [])).push(tile);
    });
    Object.keys(categories).forEach(function (category) {
      var rounds = categories[category], order = Object.keys(rounds).map(Number).sort(function (a, b) { return a - b; });
      order.forEach(function (round, index) {
        var remaining = order.length - index - 1;
        var name = remaining === 1 ? 'Semifinais' : remaining === 2 ? 'Quartas de final' :
          remaining === 3 ? 'Oitavas de final' : remaining === 4 ? '16 avos de final' : 'Eliminatórias';
        rounds[round].sort(function (a, b) {
          return a.day.localeCompare(b.day) || minutes(a.startTime) - minutes(b.startTime) ||
            a.court - b.court || a.id.localeCompare(b.id);
        }).forEach(function (tile, matchIndex) {
          result[tile.id] = remaining === 0 ? (matchIndex === 0 ? 'Final' :
            matchIndex === 1 ? '3º lugar' : 'Decisão') : name;
        });
      });
    });
    return result;
  }
  function outsideWindow(tile, day) {
    var at = minutes(tile && tile.startTime), start = minutes(day && day.startTime), end = minutes(day && day.endTime);
    return !Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end) ||
      at < start || at + Number(tile.duration) > end;
  }
  function overlapIds(tiles, plan) {
    var ids = new Set(), lanes = {};
    tiles.forEach(function (tile) {
      var key = (tile.day || plan.day) + ':' + tile.court;
      var lane = lanes[key] || (lanes[key] = []);
      var start = minutes(tile.startTime), end = start + tile.duration;
      lane.forEach(function (other) {
        if (start < other.end && end > other.start) { ids.add(tile.id); ids.add(other.id); }
      });
      lane.push({ id:tile.id, start:start, end:end });
    });
    return ids;
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
    var days = daysOf(plan, day), destination = targetDay || target.day || plan.day;
    var at = minutes(startTime);
    if (!Number.isInteger(Number(court)) || Number(court) < 1 || Number(court) > Number(plan.courts) ||
        !Number.isFinite(at) || !days.some(function (d) { return d.day === destination && at >= minutes(d.startTime); }))
      return { error:'Escolha uma quadra e um horário válidos.' };
    target.court = Number(court); target.startTime = startTime;
    target.day = destination;
    var cursor = at + target.duration, shifted = [];
    next.filter(function (tile) { return tile.id !== id && (tile.day || plan.day) === destination && tile.court === target.court; })
      .sort(function (a, b) { return minutes(a.startTime) - minutes(b.startTime) || a.id.localeCompare(b.id); })
      .forEach(function (tile) {
        var tileStart = minutes(tile.startTime);
        if (tileStart >= cursor) return;
        if (tileStart + tile.duration <= at) return;
        if (cursor + tile.duration >= 24 * 60) return;
        tile.startTime = clock(cursor);
        cursor += tile.duration;
        shifted.push(tile.id);
      });
    var warning = validate(next, plan, days, { allowOverflow:true });
    return { tiles:next, shifted:shifted, warning:warning };
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
  // Proposta para Rei/Rainha: quatro atletas por grupo, três jogos na mesma quadra.
  // A agenda é montada em passos de cinco minutos, respeitando quadras e fases.
  function suggest(spec) {
    var days = (spec.days || []).slice().sort(function (a, b) { return a.day.localeCompare(b.day); });
    var courts = Number(spec.courts), play = Number(spec.gameDuration),
      call = Number(spec.callTime), warmup = Number(spec.warmupTime), eliminationPlay = Number(spec.eliminationPlayMinutes);
    if (!days.length || !Number.isInteger(courts) || courts < 1 || !Number.isInteger(play) || play < 1 ||
        !Number.isInteger(call) || call < 0 || !Number.isInteger(warmup) || warmup < 0 ||
        !Number.isInteger(eliminationPlay) || eliminationPlay < 1)
      return { error:'Defina dias, quadras e durações válidos antes de gerar a grade.' };
    var categories = spec.categories || [];
    if (!categories.length || categories.some(function (cat) {
      return !cat.name || !Number.isInteger(cat.groups) || cat.groups < 2 || cat.groups > 32;
    })) return { error:'Informe vagas de quatro atletas por grupo, com ao menos dois grupos por categoria.' };
    var groupDuration = 3 * play + call + warmup, eliminationDuration = eliminationPlay + call + warmup;
    var jobs = [], stages = {}, stageOrder = [];
    function addStage(key, kind, category, round, count, priority) {
      var stage = { key:key, kind:kind, category:category, round:round, count:count,
        remaining:count, finish:0, priority:priority };
      stages[key] = stage; stageOrder.push(stage);
      for (var i = 0; i < count; i++) jobs.push({ id:key + ':' + i, stage:key, index:i,
        kind:kind, category:category, round:round, groupNumber:kind === 'groups' ? i + 1 : 0,
        duration:kind === 'groups' ? groupDuration : eliminationDuration });
    }
    categories.forEach(function (cat, ci) {
      addStage('g' + ci, 'groups', cat.name, 0, cat.groups, ci < 2 ? ci : 100 + ci);
      var size = 1; while (size * 2 <= cat.groups) size *= 2;
      var counts = [];
      if (cat.groups > size) counts.push(cat.groups - size);
      for (var pairs = size / 2; pairs >= 2; pairs /= 2) counts.push(pairs);
      counts.push(cat.groups >= 4 ? 2 : 1); // final e 3º lugar, se houver quatro duplas
      counts.forEach(function (count, roundIndex) {
        addStage('e' + ci + ':' + (roundIndex + 1), 'elimination', cat.name,
          roundIndex + 1, count, ci < 2 ? 10 + ci : 200 + ci);
      });
    });
    function ready(job, at) {
      var ci = categories.findIndex(function (cat) { return cat.name === job.category; });
      if (job.kind === 'groups') {
        if (ci === 0) return true;
        var prev = stages['g' + (ci - 1)];
        if (prev.remaining || prev.finish > at) return false;
        if (ci >= 2) {
          // A categoria seguinte entra quando a primeira rodada eliminatória
          // das anteriores liberou quadras; as demais decisões podem coexistir.
          for (var prior = 0; prior < ci; prior++) {
            var firstElimination = stages['e' + prior + ':1'];
            if (firstElimination && (firstElimination.remaining || firstElimination.finish > at)) return false;
          }
        }
        return true;
      }
      var groups = stages['g' + ci];
      if (groups.remaining || groups.finish > at) return false;
      if (ci < 2 && categories.length > 1) {
        var second = stages.g1;
        if (second.remaining || second.finish > at) return false;
      }
      if (job.round === 1) return true;
      var previous = stages['e' + ci + ':' + (job.round - 1)];
      return previous.remaining === 0 && previous.finish <= at;
    }
    var tiles = [], busy = {};
    days.forEach(function (day) {
      var start = minutes(day.startTime), end = minutes(day.endTime);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
      var dayBase = Date.parse(day.day + 'T00:00:00Z') / 60000;
      for (var minute = start; minute < end && jobs.length; minute += 5) {
        var at = dayBase + minute;
        for (var court = 1; court <= courts; court++) {
          var lane = day.day + ':' + court;
          if ((busy[lane] || 0) > at) continue;
          var available = jobs.filter(function (job) {
            return minute + job.duration <= end && ready(job, at);
          }).sort(function (a, b) {
            return stages[a.stage].priority - stages[b.stage].priority ||
              a.round - b.round || a.index - b.index;
          });
          if (!available.length) continue;
          var job = available[0], stage = stages[job.stage];
          jobs.splice(jobs.indexOf(job), 1);
          stage.remaining--; stage.finish = Math.max(stage.finish, at + job.duration);
          busy[lane] = at + job.duration;
          tiles.push({ id:job.id, kind:job.kind, category:job.category, round:job.round,
            groupNumber:job.groupNumber, day:day.day, court:court, startTime:clock(minute), duration:job.duration });
        }
      }
    });
    if (jobs.length) return { error:'A programação precisa de mais tempo ou mais quadras: faltam ' +
      jobs.length + ' blocos. Amplie a janela de jogos para gerar uma proposta sem sobreposição.' };
    var plan = { schema:1, day:days[0].day, days:days, courts:courts,
      eliminationMinutes:eliminationDuration, eliminationPlayMinutes:eliminationPlay,
      totalGames:tiles.reduce(function (sum, tile) { return sum + (tile.kind === 'groups' ? 3 : 1); }, 0) };
    var error = validate(tiles, plan, days);
    return error ? { error:error } : { plan:toPlan(plan, tiles), tiles:tiles };
  }
  var api = { minutes:minutes, clock:clock, duration:duration, expand:expand, validate:validate,
    move:move, toPlan:toPlan, preset:preset, stageKey:stageKey, groupLabel:groupLabel, numbered:numbered,
    gameStarts:gameStarts, eliminationLabels:eliminationLabels, suggest:suggest,
    expectedSignatures:expectedSignatures, signatures:signatures,
    outsideWindow:outsideWindow, overlapIds:overlapIds, daysOf:daysOf, dayOf:dayOf };
  root.ScoreplacePhaseGridPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
