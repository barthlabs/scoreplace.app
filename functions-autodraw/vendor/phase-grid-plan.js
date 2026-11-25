// Grade editável das reservas de quadra por fase. Uma reserva pode conter uma
// partida ou a série oficial de três combinações do mesmo quarteto.
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
  function civilDay(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value+'T00:00:00Z')) &&
      new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  }
  function absoluteDay(value) { return Date.parse(value+'T00:00:00Z')/60000; }
  function overflowDay(key,plan,days) {
    var last=days.slice().sort((a,b)=>a.day.localeCompare(b.day)).at(-1);
    if (!plan?.allowOverflow || !last || !civilDay(key) || key<=last.day || absoluteDay(key)>absoluteDay(last.day)+400*1440) return null;
    return {day:key,startTime:'00:00',endTime:'23:59',overflow:true};
  }
  function displayDays(plan,tiles,days) {
    var result=days.slice(), last=days.slice().sort((a,b)=>a.day.localeCompare(b.day)).at(-1);
    if (!plan?.allowOverflow || !last) return result;
    var end=tiles.reduce((max,t)=>Math.max(max,absoluteDay(t.day)+minutes(t.startTime)+t.duration-1),absoluteDay(last.day));
    for(var at=absoluteDay(last.day)+1440;at<=end && result.length<days.length+400;at+=1440) {
      var key=new Date(at*60000).toISOString().slice(0,10);result.push(overflowDay(key,plan,days));
    }
    return result;
  }
  function dayOf(tile, plan, days) {
    var key = tile && tile.day || plan && plan.day;
    return days.find(function (day) { return day && day.day === key; }) || overflowDay(key,plan,days);
  }
  function ordinal(tile, plan) { return String(tile.day || plan.day || '') + 'T' + tile.startTime; }
  function expand(plan, tournament) {
    if (!plan || !Array.isArray(plan.blocks)) return [];
    if (plan.schema===2) return bindAssignments(plan.blocks.map(function (block,i) {
      var tile=Object.assign({},block,{id:'p'+i,court:block.courts[0],duration:v2Duration(block,tournament || {})});
      delete tile.courts;
      tile.windows=(plan.categoryPlacement==='grid' ? [] : tournament?.scheduleWindow?.categoryWindows || []).filter(row=>row.category===block.category);
      return tile;
    }),plan.groupAssignments);
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
      next += plan.schema===2 ? tile.games : tile.kind === 'groups' ? 3 : 1;
    });
    return result;
  }
  function gameStarts(tile, tournament) {
    var first = minutes(tile.startTime);
    if (tile.games===1 || tile.kind !== 'groups') return [first];
    if (tile.games === 3) {
      var playMinutes=matchMinutes(tournament,tile.phaseIndex), setup=tile.duration - 3 * playMinutes;
      return [first,first+setup+playMinutes,first+setup+2*playMinutes];
    }
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
    tiles.forEach(function(tile){if(tile.display?.stage) result[tile.id]=tile.display.stage;});
    return result;
  }
  function describeProjectedTiles(t,tiles,context) {
    var descriptions=new Map(project(t,context).jobs.map(job=>[positionKey(job),job.display]));
    return tiles.map(tile=>Object.assign({},tile,{display:descriptions.get(positionKey(tile))}));
  }
  function matchupLabel(tile,tiles) {
    if(!tile.display?.sources?.some(Boolean)) return '';
    var byPosition=new Map(tiles.map(other=>[positionKey(other),other]));
    function sourceLabel(source) {
      if(!source) return 'A definir';
      if(source.groupNumber) {
        var row=tiles.find(other=>other.kind==='groups' && other.phaseIndex===tile.phaseIndex-1 && other.category===tile.category && other.groupNumber===source.groupNumber);
        var code=row?.assignment?.label || groupCode(tile.category,source.groupNumber);
        return source.ranks.map(rank=>rank+'º').join('+')+' · '+code;
      }
      var previous=byPosition.get(source.position);
      return (source.outcome==='winner'?'Vencedor':'Perdedor')+' da '+(previous?.display?.stage || 'partida')+' '+(previous?.sequence || '');
    }
    return tile.display.sources.map(sourceLabel).join(' × ');
  }
  function groupCode(category,number) {
    var code=String(category || '').match(/(?:^|[\s(\[])([A-Za-z])(?:[)\]]|$)$/);
    return (code ? code[1].toUpperCase() : (category || 'Grupo')+' ')+number;
  }
  function outsideWindow(tile, day) {
    var at = minutes(tile && tile.startTime), start = minutes(day && day.startTime), end = minutes(day && day.endTime);
    return !!day?.overflow || !Number.isFinite(at) || !Number.isFinite(start) || !Number.isFinite(end) ||
      at < start || at + Number(tile.duration) > end;
  }
  function overlapIds(tiles, plan) {
    var ids = new Set(), lanes = {};
    tiles.forEach(function (tile) {
      var key = tile.court;
      var lane = lanes[key] || (lanes[key] = []);
      var start = absoluteDay(tile.day || plan.day)+minutes(tile.startTime), end = start + tile.duration;
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
    if (plan.schema===2) return validateReservations(tiles,plan,days);
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
  function move(tiles, id, court, startTime, plan, day, targetDay, targetId) {
    var next = tiles.map(function (tile) { return Object.assign({}, tile, { court:Number(tile.court) }); });
    var target = next.find(function (tile) { return tile.id === id; });
    if (!target) return { error:'Bloco não encontrado.' };
    var days = daysOf(plan, day), destination = targetDay || target.day || plan.day;
    var at = minutes(startTime);
    if (!Number.isInteger(Number(court)) || Number(court) < 1 || Number(court) > Number(plan.courts) ||
        !Number.isFinite(at) || !dayOf({day:destination},plan,days) || at<minutes(dayOf({day:destination},plan,days).startTime))
      return { error:'Escolha uma quadra e um horário válidos.' };
    var original = { court:target.court, startTime:target.startTime, day:target.day || plan.day };
    var lane = next.filter(function (tile) { return tile.id !== id && (tile.day || plan.day) === destination && Number(tile.court) === Number(court); });
    var occupant = targetId ? lane.find(function (tile) { return tile.id === targetId; }) : null;
    if (targetId && !occupant) return { error:'Solte sobre um bloco da quadra escolhida.' };
    if (!occupant) occupant = lane.find(function (tile) {
      var start = minutes(tile.startTime);
      return at >= start && at < start + tile.duration;
    });
    if (!occupant) {
      var overlapping = lane.filter(function (tile) {
        var start = minutes(tile.startTime);
        return at < start + tile.duration && at + target.duration > start;
      });
      if (overlapping.length === 1) occupant = overlapping[0];
    }
    if (occupant) {
      target.court = occupant.court; target.startTime = occupant.startTime; target.day = occupant.day || plan.day;
      occupant.court = original.court; occupant.startTime = original.startTime; occupant.day = original.day;
    } else {
      target.court = Number(court); target.startTime = startTime; target.day = destination;
    }
    var error = validate(next, plan, days);
    if (error) return { error:'Posição não aplicada: ' + error + ' Solte em outra vaga válida.' };
    return { tiles:next, swapped:occupant && occupant.id || null, shifted:[] };
  }
  function toPlan(plan, tiles) {
    var next = Object.assign({}, plan);
    next.blocks = tiles.slice().sort(function (a, b) {
      return ordinal(a, plan).localeCompare(ordinal(b, plan)) || a.court - b.court || a.id.localeCompare(b.id);
    }).map(function (tile) {
      if (plan.schema===2) {
        var position=Object.assign({},tile,{courts:[tile.court]});
        ['id','court','duration','matchIds','windows','assignment','display'].forEach(k=>delete position[k]);
        return position;
      }
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
    if (plan.schema===2) return arrange(tiles,days,plan.courts,mode==='spread',plan.allowOverflow===true);
    function absolute(tile) {
      var key = tile.day || plan.day;
      return Date.parse(key + 'T00:00:00Z') / 60000 + minutes(tile.startTime);
    }
    var original = tiles.map(function (tile) { return Object.assign({}, tile); });
    var keys = [], ranges = {}, baseline = {}, dependencies = {};
    original.forEach(function (tile) {
      var key = stageKey(tile), at = absolute(tile), finish = at + tile.duration;
      if (!ranges[key]) { keys.push(key); ranges[key] = { first:at, last:finish }; }
      ranges[key].first = Math.min(ranges[key].first, at);
      ranges[key].last = Math.max(ranges[key].last, finish);
    });
    (plan.blocks || []).forEach(function (block, index) {
      var tile = original.find(function (candidate) { return candidate.id === 'b' + index + 'c0'; });
      if (!tile) return;
      var key = stageKey(tile), at = Date.parse((block.day || plan.day) + 'T00:00:00Z') / 60000 + minutes(block.startTime);
      if (!baseline[key]) baseline[key] = { first:at, last:at + tile.duration };
      baseline[key].first = Math.min(baseline[key].first, at);
      baseline[key].last = Math.max(baseline[key].last, at + tile.duration);
    });
    keys.sort(function (a, b) {
      return (baseline[a] || ranges[a]).first - (baseline[b] || ranges[b]).first || a.localeCompare(b);
    });
    keys.forEach(function (key) {
      // Concentrar recupera a ordem das etapas da grade salva. Espalhar
      // alterna categorias, mas nunca inicia a eliminatória antes da
      // classificatória da própria categoria.
      dependencies[key] = mode === 'compact' ? keys.filter(function (other) {
        return other !== key && (baseline[other] || ranges[other]).last <= (baseline[key] || ranges[key]).first;
      }) : key.startsWith('elimination\u0000') && ranges['groups\u0000' + key.slice('elimination\u0000'.length)] ?
        ['groups\u0000' + key.slice('elimination\u0000'.length)] : [];
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
  // A posição de uma reserva vem dos eixos esportivos. IDs, nomes e o resultado
  // hipotético da projeção nunca são parte da configuração gravada.
  function positionKey(tile) {
    return JSON.stringify([tile.phaseIndex,tile.category,tile.bracket,tile.groupNumber,tile.round,tile.sequence,tile.requiredDay || '']);
  }
  function memberKeys(match) {
    var keys = [];
    [1,2].forEach(function (side) {
      var names=match['team'+side] || [], ids=match['team'+side+'Uids'] || [], slots=match['team'+side+'SlotIds'] || [];
      if (!names.length && !ids.length && !slots.length) {
        var person=match['p'+side+'Uid'] || match['p'+side];
        if(person && person!=='TBD' && person!=='BYE') keys.push(String(person));
      }
      for (var i=0;i<Math.max(names.length,ids.length,slots.length);i++)
        if (ids[i] || slots[i] || names[i]) keys.push(String(ids[i] || slots[i] || names[i]));
    });
    return keys;
  }
  function technicalPositions(t, list, context, origins) {
    var groups=new Map(), byId=new Map(), jobs=[], fields=new Map();
    var real=(list || []).filter(function (m) {
      if (!m || m.id == null || m.isSitOut || m.isTieBreak || m.isBye || (context._isByeMatch && context._isByeMatch(m)) || byId.has(m.id)) return false;
      byId.set(m.id,m);return true;
    });
    var wave=new Map(), predecessors=new Map();
    real.forEach(m=>[m.nextMatchId,m.loserMatchId,m.loserNextMatchId].filter(Boolean).forEach(id=>{
      if (!predecessors.has(id)) predecessors.set(id,[]);
      predecessors.get(id).push(m.id);
    }));
    real.filter(m=>m.isExtra && m.bracket==='grand').forEach(m=>{
      var previous=real.find(other=>other.bracket==='grand' && !other.isExtra && String(other.id)+'-EXTRA'===String(m.id));
      if (previous) predecessors.set(m.id,[previous.id]);
    });
    function depth(id,visiting) {
      if (wave.has(id)) return wave.get(id);
      if (visiting.has(id)) throw new Error('A chave contém uma dependência circular.');
      visiting.add(id);
      var d=1+(predecessors.get(id)||[]).reduce((n,p)=>Math.max(n,depth(p,visiting)),0);
      visiting.delete(id);wave.set(id,d);return d;
    }
    real.forEach(function (m) {
      var phaseIndex=Number(m.phaseIndex) || 0, phase=t.phases[phaseIndex], isGroup=phase?.kind==='classification';
      var category=String(m.category || m.team1Obj?.category || (t.combinedCategories?.length===1 ? t.combinedCategories[0] : '') || '');
      var bracket=m.bracket || (isGroup ? 'league' : 'main');
      var groupNumber=isGroup ? 1+Number(m.groupIdx ?? m.monarchGroup ?? 0) : 0;
      // No rodízio independente o monarchGroup operacional identifica a partida.
      // O grupo esportivo e a rodada vêm de groupIdx/round.
      if (m.isMonarch && phase?.classification?.partnerRotation !== 'groups' && m.groupIdx==null &&
          (t.superEight || phase.superEight)) groupNumber=1;
      var round=Math.max(1,Number(m.round) || Number(m.roundIndex || 0)+1);
      var stage=isGroup ? round : Math.max(depth(m.id,new Set()),round);
      var field={phaseIndex:phaseIndex,kind:isGroup?'groups':'elimination',category:category,groupNumber:groupNumber,
        bracket:bracket,round:round,wave:stage};
      var key=JSON.stringify([phaseIndex,category,bracket,groupNumber,round,m.requiredDay || '']);
      fields.set(key,field);
      if (!groups.has(key)) groups.set(key,[]);
      groups.get(key).push(m);
    });
    groups.forEach(function (items,key) {
      var base=fields.get(key);
      items.sort((a,b)=>String(a.id).localeCompare(String(b.id),'en',{numeric:true}));
      var quartet=items.length===3 && items.every(m=>m.isMonarch && (m.rotationSeries || !t.phases[base.phaseIndex]?.classification?.partnerRotation));
      if (quartet) {
        var roster=memberKeys(items[0]).sort().join('\0');
        var partitions=new Set(items.map(m=>{
          var members=memberKeys(m);
          return JSON.stringify([members.slice(0,2).sort(),members.slice(2).sort()].sort());
        }));
        quartet=new Set(memberKeys(items[0])).size===4 && partitions.size===3 && items.every(m=>memberKeys(m).sort().join('\0')===roster);
      }
      var waves=[];
      (quartet?[items]:items.map(m=>[m])).forEach(function (part,sequence) {
        var job=Object.assign({},base,{sequence:sequence+1,games:part.length,matchIds:part.map(m=>String(m.id))});
        if (base.kind!=='groups') job.wave=Math.max(depth(part[0].id,new Set()),job.round);
        if (base.kind==='groups') {
          var people=memberKeys(part[0]);
          var batch=waves.findIndex(used=>people.every(person=>!used.has(person)));
          if (batch<0) {batch=waves.length;waves.push(new Set());}
          people.forEach(person=>waves[batch].add(person));
          job.wave=base.wave;
          if (batch) job.wave+=batch/(items.length+1);
        }
        if (base.phaseIndex>0 && canInterleave(t)) job.categoryAdvance=true;
        if (part[0].requiredDay) job.requiredDay=part[0].requiredDay;
        if (part.every(m=>m.condicional===true || m.conditional===true || (m.bracket==='grand' && m.isExtra))) job.optional=true;
        jobs.push(job);
      });
    });
    var jobByMatch=new Map();
    jobs.forEach(job=>job.matchIds.forEach(id=>jobByMatch.set(id,job)));
    jobs.filter(job=>job.kind==='elimination').forEach(function(job) {
      var m=byId.get(job.matchIds[0]);
      var peers=jobs.filter(other=>other.phaseIndex===job.phaseIndex && other.category===job.category && other.bracket===job.bracket);
      var last=Math.max(...peers.map(other=>other.round));
      var stage=m.isThirdPlace ? '3º lugar' : job.round===last ? 'Final' :
        job.round===last-1 ? 'Semifinal' : job.round===last-2 ? 'Quartas de final' : 'Eliminatória';
      job.display={stage:stage,sources:[null,null]};
      [1,2].forEach(function(side) {
        var team=m['team'+side+'Obj'];
        var ids=m['team'+side+'Uids'] || team?.participants?.map(p=>p.uid) || [];
        var rows=ids.map(id=>origins?.get(JSON.stringify([job.category,String(id)]))).filter(Boolean);
        if(rows.length===ids.length && rows.length && rows.every(row=>row.groupNumber===rows[0].groupNumber))
          job.display.sources[side-1]={category:job.category,groupNumber:rows[0].groupNumber,ranks:rows.map(row=>row.rank).sort((a,b)=>a-b)};
        if(job.display.sources[side-1]) return;
        var slot='p'+side;
        var before=real.find(other=>other.nextMatchId===m.id && other.nextSlot===slot ||
          (other.loserNextMatchId || other.loserMatchId)===m.id && (other.loserNextSlot || other.loserSlot)===slot);
        var previous=before && jobByMatch.get(String(before.id));
        if(previous) job.display.sources[side-1]={outcome:before.nextMatchId===m.id?'winner':'loser',position:positionKey(previous)};
      });
    });
    return jobs;
  }
  function project(tournament,context) {
    var ctx=context || root, engine=ctx._phasesEngine, format=ctx.FORMAT2;
    if (!engine || !format || !tournament) throw new Error('Defina o formato da fase antes de gerar a grade.');
    var cats=tournament.combinedCategories?.length ? tournament.combinedCategories.slice() : [''];
    var fmt=tournament.fmt2 || format.configFromTournament(tournament,tournament.sport);
    var compiled=format.compileToPhases(fmt,{sport:tournament.sport,categories:cats.filter(Boolean)});
    var phases=compiled.phases.map(function (phase,i) {
      var saved=tournament.phases?.[i];
      if (!saved || saved.kind!==phase.kind) return phase;
      return Object.assign({},phase,{scoring:phase.scoring || saved.scoring,gameDuration:saved.gameDuration});
    }), first=phases[0], roster=[], units=[], capacities=[];
    var t=Object.assign({},tournament,compiled.topLevel,{phases:phases,fmt2:compiled.cfg,combinedCategories:cats.filter(Boolean),
      scheduleWindow:{interleavedPlan:{schema:2}},participants:roster,rounds:[],groups:[],matches:[],standings:[],checkedIn:{},absent:{},
      currentPhaseIndex:0,status:'closed',phaseCategoryMaterialized:{},_phaseMaterialized:0});
    var tc=compiled.cfg.teamCompetition, pairDays=new Map((tc?.schedule?.pairDayAssignments || []).map(row=>[row.fixedPairId,row.day]));
    function completeBracket(built, phaseIndex) {
      if (built.needsDoubleElim && ctx._buildDoubleElimBracket) {
        var parts=phaseIndex && cats.length>1 ? (built.categoryBuilds || []).filter(part=>part.built?.needsDoubleElim) : [];
        if (parts.length) parts.forEach(part=>ctx._buildDoubleElimBracket(t,{phaseIndex,category:part.category}));
        else ctx._buildDoubleElimBracket(t,{phaseIndex});
      }
      if (built.needsRepechageDoubleElim && ctx._buildRepechageDoubleElim) {
        var metas=built.repMetaByCat?.length ? built.repMetaByCat : [built.repMeta];
        metas.forEach(meta=>ctx._buildRepechageDoubleElim(t,meta,{phaseIndex}));
      }
    }
    cats.forEach(function (cat,ci) {
      var n=Number(tournament.maxParticipantsByCategory?.[cat] || tournament.maxParticipantsPerCategory ||
          (cats.length===1 ? tournament.maxParticipants : 0)) || ctx.ScoreplaceSuperEight?.categoryPopulation(tournament,cat);
      if (!Number.isSafeInteger(n) || n<2 || n>2048) throw new Error('Informe a quantidade de pessoas de '+(cat || 'classificação geral')+'.');
      if (roster.length+n>4096) throw new Error('A grade ultrapassa o limite de 400 posições.');
      var fixed=fmt.disputa==='dupla' && (first.kind==='elimination' || first.fixedPairs) && !first.reiRainha && !first.superEight;
      if (fixed && n%2) throw new Error('O número de pessoas precisa formar duplas completas em '+(cat||'classificação geral')+'.');
      capacities.push(n);
      var categoryId=(tournament.categoryDefinitions || []).find(d=>d.label===cat)?.id;
      var datedPairs=(tc?.schedule?.rosterSnapshot || []).filter(row=>row.categoryId===categoryId);
      var dayCounts=new Map();
      for (var i=0;i<n;i++) {
        var name='Vaga '+ci+'-'+i,person={uid:'grid-'+ci+'-'+i,name:name,displayName:name,category:cat,categories:cat?[cat]:[],ligaActive:true};
        roster.push(person);
        if (!fixed) units.push(person);
        else if (i%2) {
          var p=roster[roster.length-2];
          var team={name:p.name+' / '+name,displayName:p.name+' / '+name,p1Name:p.name,p2Name:name,p1Uid:p.uid,p2Uid:person.uid,
            category:cat,categories:cat?[cat]:[],participants:[p,person]};
          if (tc?.enabled && tc.teamCount) {
            var position=Math.floor(i/2), pair=datedPairs[position], day=pairDays.get(pair?.fixedPairId);
            if (day) {
              team.competitionPlayDay=day;
              position=dayCounts.get(day)||0;dayCounts.set(day,position+1);
            }
            team.fixedPairId='grid-pair-'+ci+'-'+i;
            team.competitionTeamId='team-'+(position%tc.teamCount);
          }
          units.push(team);
        }
      }
    });
    t.participants=units;
    var cfg=ctx._buildPhase0Cfg(t);
    cfg.maxDrawOperations=400;
    if (cfg.classification?.structure==='groups' && !tc?.enabled) {
      var initialMatches=cats.reduce(function (sum,cat) {
        var size=units.filter(person=>person.category===cat).length;
        return sum+format.groupPlanForCategory(cfg,cat,size,false).matches;
      },0);
      if (initialMatches>1200) throw new Error('A grade ultrapassa o limite de 400 posições.');
    }
    var built=engine.generatePhase(units,cfg,{t:t,phaseIndex:0,ordered:true,idPrefix:'grid0',catOf:p=>p.category || ''});
    if (!built.appliedToT) {
      var stored=engine.storePhase(t,0,built);
      if (!stored.ok) throw new Error('A formação não produziu partidas oficiais para a grade.');
      completeBracket(built,0);
    }
    function gamesOfPhase(index) {
      var result=(t.matches || []).filter(m=>(m.phaseIndex || 0)===index);
      var rounds=index ? t.phaseRounds?.[index]?.rounds : t.rounds;
      (rounds || []).forEach(r=>(r.matches || []).forEach(m=>{m.phaseIndex=index;result.push(m);}));
      return result;
    }
    var jobs=[], origins=new Map();
    for (var index=0;index<phases.length;index++) {
      var nativeRounds=index ? t.phaseRounds?.[index]?.rounds : t.rounds;
      var requested=Number(phases[index].rounds || (index===0 ? fmt.rodadas?.n : 0)) || 1;
      if (index && t.phaseRounds?.[index] && !nativeRounds?.length) {
        ctx._phaseGenNextLeagueRound(t,index,{rnd:()=>0.37});
        nativeRounds=t.phaseRounds[index].rounds;
      }
      if (nativeRounds?.length) {
        var latestRound=()=>Math.max(...nativeRounds.map(r=>Number(r.round) || 1));
        while (latestRound()<requested) {
          nativeRounds.filter(r=>r.status!=='finished').forEach(function (round) {
            (round.matches || []).forEach(m=>{if (!m.winner) {m.winner=m.p1;m.scoreP1=4;m.scoreP2=3;}});
            round.status='finished';
          });
          var count=nativeRounds.length;
          if (index) ctx._phaseGenNextLeagueRound(t,index,{rnd:()=>0.37}); else ctx._generateNextRound(t);
          if (nativeRounds.length===count) throw new Error('A fase não conseguiu formar a rodada seguinte.');
          if (nativeRounds.length>400) throw new Error('A grade ultrapassa o limite de 400 posições.');
        }
      }
      var games=gamesOfPhase(index);
      if (phases[index].grandFinalReset===true) {
        games.filter(m=>m.bracket==='grand' && !m.isExtra).forEach(function (m) {
          var reset=ctx._grandFinalResetMatch(m);
          if (!games.some(other=>other.id===reset.id)) games.push(reset);
        });
      }
      var section=technicalPositions(t,games,ctx,origins);
      jobs.push.apply(jobs,section);
      if (jobs.length>400) throw new Error('A grade ultrapassa o limite de 400 posições.');
      if (index+1===phases.length) break;
      games.forEach(m=>{if(!m.winner){m.winner=m.p1;m.winnerUids=m.team1Uids || [];m.scoreP1=4;m.scoreP2=3;}});
      var ind=phases[index].reiRainha || phases[index].superEight || !!phases[index].classification?.partnerRotation;
      origins=new Map();
      var sourceGroups=index===0 ? engine.prevPhaseGroups(t) : engine.bracketPhaseGroups(t,index);
      (sourceGroups || []).forEach(function(group) {
        var category=String(group.category || '');
        engine.standingsDaFaseAnterior(group,t,{},ind,index).forEach(function(row,rank) {
          if(row.uid) origins.set(JSON.stringify([category,String(row.uid)]),{groupNumber:Number(group.groupIdx || 0)+1,rank:rank+1});
        });
      });
      var next=engine.materializeNextPhase(t,g=>engine.standingsDaFaseAnterior(g,t,{},ind,index),'grid'+(index+1),
        {agoraIso:'2000-01-01T00:00:00Z',rnd:()=>0.37});
      if (!next.ok) throw new Error('Confira os classificados da fase '+(index+1)+' ('+next.error+').');
      completeBracket(next.built || {},index+1);
    }
    if (!jobs.length) throw new Error('A configuração não produz partidas para agendar.');
    return {jobs:jobs,capacities:capacities,phases:phases,people:capacities.reduce((a,b)=>a+b,0)};
  }
  function matchMinutes(t,phase) {
    var cfg=t.phases?.[phase], scoring=cfg?.scoring || t.scoring;
    var sets=root._setsEsperadosDe?.(scoring?.setsToWin) || root._setsEsperadosDaFase?.(t,cfg) || 1;
    return Math.max(1,Math.round((Number(cfg?.gameDuration || t.gameDuration) || 30)*sets));
  }
  function v2Duration(job,t) {
    var play=matchMinutes(t,job.phaseIndex),first=t.setupScope==='first_round' || t.superEightSetupScope==='first_round';
    return play*job.games+(first && job.round>1 ? 0 : (Number(t.callTime)||0)+(Number(t.warmupTime)||0));
  }
  function canInterleave(t) {
    var phases=t.phases || [], next=phases[1];
    return phases.length===2 && phases[0].kind==='classification' && next.kind==='elimination' &&
      (t.combinedCategories || []).length>1 && next.source?.scope==='per_group' && next.source.flatOverall!==true;
  }
  function groupKey(row) {
    return JSON.stringify([row.phaseIndex,row.category,row.groupNumber]);
  }

  function sportGroups(tiles) {
    var groups=new Map();
    for (var tile of tiles) {
      if (tile.kind!=='groups') continue;
      var key=groupKey(tile);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(tile);
    }
    return groups;
  }

  function suggestedAssignments(tiles, courts, tournament) {
    var phases=new Map(), result=[], categories=tournament?.combinedCategories || [];
    for (var list of sportGroups(tiles).values()) {
      var first=list[0], waves=new Map();
      list.forEach(tile=>waves.set(tile.wave,(waves.get(tile.wave)||0)+1));
      var code=String(first.category || '').match(/(?:^|[\s(\[])([A-Za-z])(?:[)\]]|$)$/);
      var group={phaseIndex:first.phaseIndex,category:first.category,groupNumber:first.groupNumber,
        label:groupCode(first.category,first.groupNumber),
        demand:Math.min(courts,Math.max(...waves.values()))};
      if (!phases.has(first.phaseIndex)) phases.set(first.phaseIndex,[]);
      phases.get(first.phaseIndex).push(group);
    }
    for (var groups of phases.values()) {
      groups.sort((a,b)=>categories.indexOf(a.category)-categories.indexOf(b.category) ||
        a.category.localeCompare(b.category) || a.groupNumber-b.groupNumber);
      var count=Math.ceil(groups.reduce((n,g)=>n+g.demand,0)/courts), filled=[];
      for (var group of groups) {
        var siblings=groups.filter(g=>g.category===group.category);
        var entry=Math.floor(siblings.indexOf(group)*count/siblings.length);
        while ((filled[entry] || 0)+group.demand>courts) entry++;
        var start=filled[entry] || 0;
        filled[entry]=start+group.demand;
        result.push({phaseIndex:group.phaseIndex,category:group.category,groupNumber:group.groupNumber,
          label:group.label,entry:entry+1,courts:Array.from({length:group.demand},(_,i)=>start+i+1)});
      }
    }
    return result;
  }

  function canonicalGroupLabel(value) {
    if (typeof value!=='string') return '';
    var label=value.replace(/[\p{Zs}\t\n\r\u2028\u2029]+/gu,' ').trim().normalize('NFC');
    return /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(label) ||
      Array.from(label).length>48 ? '' : label;
  }

  function validatedAssignments(tiles,rows,courts) {
    if (!Array.isArray(rows) || rows.length>400) throw new Error('Distribuição de grupos inválida.');
    if (!rows.length) return [];
    var groups=sportGroups(tiles), names=new Set(), reservations=new Set(), entries=new Map();
    var normalized=rows.map(function (row) {
      if (!row || Object.keys(row).sort().join(',')!=='category,courts,entry,groupNumber,label,phaseIndex' ||
          !groups.delete(groupKey(row))) throw new Error('Confira a fase, a categoria e o grupo de cada distribuição.');
      var name=canonicalGroupLabel(row.label);
      var nameKey=JSON.stringify([row.phaseIndex,row.category,name.toLowerCase().normalize('NFD').replace(/\p{M}/gu,'')]);
      if (!name || names.has(nameKey)) throw new Error('Use nomes distintos de até 48 caracteres para os grupos de cada categoria.');
      names.add(nameKey);
      if (!Number.isSafeInteger(row.entry) || row.entry<1 || row.entry>400 ||
          !Array.isArray(row.courts) || !row.courts.length || row.courts.length>courts)
        throw new Error('Escolha uma entrada e pelo menos uma quadra para cada grupo.');
      if (!entries.has(row.phaseIndex)) entries.set(row.phaseIndex,new Set());
      entries.get(row.phaseIndex).add(row.entry);
      for (var court of row.courts) {
        var key=JSON.stringify([row.phaseIndex,row.entry,court]);
        if (!Number.isSafeInteger(court) || court<1 || court>courts || reservations.has(key))
          throw new Error('Cada quadra deve pertencer a um único grupo na mesma entrada.');
        reservations.add(key);
      }
      return Object.assign({},row,{label:name,courts:row.courts.slice().sort((a,b)=>a-b)});
    });
    if (groups.size) throw new Error('Distribua todos os grupos classificatórios desta grade.');
    for (var set of entries.values()) if (set.size!==Math.max(...set))
      throw new Error('Numere as entradas consecutivamente, começando em 1.');
    return normalized;
  }

  function bindAssignments(tiles,rows) {
    var assignments=new Map((rows || []).map(row=>[groupKey(row),row]));
    return tiles.map(function (tile) {
      var copy=Object.assign({},tile);
      delete copy.assignment;
      if (copy.kind==='groups' && assignments.has(groupKey(copy))) copy.assignment=assignments.get(groupKey(copy));
      return copy;
    });
  }

  function applyAssignments(tiles,plan,days,rows) {
    try {
      var assignments=validatedAssignments(tiles,rows,plan.courts);
      var nextPlan=Object.assign({},plan,{groupAssignments:assignments});
      var result=arrange(bindAssignments(tiles,assignments),days,plan.courts,false,plan.allowOverflow===true);
      if (result.error) return result;
      var error=validateReservations(result.tiles,nextPlan,days);
      return error ? {error:error} : {tiles:result.tiles,plan:toPlan(nextPlan,result.tiles)};
    } catch(error) { return {error:error.message}; }
  }

  function precedes(a,b) {
    if (a.phaseIndex!==b.phaseIndex) return a.phaseIndex<b.phaseIndex && (!b.categoryAdvance || a.category===b.category);
    if (a.assignment && b.assignment) {
      if (a.assignment.entry!==b.assignment.entry) return a.assignment.entry<b.assignment.entry;
      if (a.groupNumber!==b.groupNumber || a.category!==b.category) return false;
    }
    if (a.category!==b.category) return false;
    return (a.kind!=='groups' || a.groupNumber===b.groupNumber || a.bracket==='league') && a.wave<b.wave;
  }
  function windowAllows(tile, day, start, allowOverflow) {
    if(allowOverflow) {
      var at=absoluteDay(day)+start;
      if(tile.requiredDay && at<absoluteDay(tile.requiredDay)) return false;
      if((!tile.requiredDay || tile.requiredDay===day) && (!tile.windows?.length || tile.windows.some(row=>row.day===day && start>=minutes(row.startTime)))) return true;
      var last=tile.windows?.slice().sort((a,b)=>a.day.localeCompare(b.day) || a.endTime.localeCompare(b.endTime)).at(-1);
      return last ? at>=absoluteDay(last.day)+minutes(last.endTime) : !!tile.requiredDay && at>=absoluteDay(tile.requiredDay)+1440;
    }
    return (!tile.requiredDay || tile.requiredDay===day) && (!tile.windows?.length ||
      tile.windows.some(row=>row.day===day && start>=minutes(row.startTime) && start+tile.duration<=minutes(row.endTime)));
  }
  function arrange(jobs,days,courts,spread,allowOverflow) {
    var categories=Array.from(new Set(jobs.map(job=>job.category)));
    var pending=jobs.slice().sort((a,b)=>a.phaseIndex-b.phaseIndex || a.wave-b.wave ||
      categories.indexOf(a.category)-categories.indexOf(b.category) || a.groupNumber-b.groupNumber || a.sequence-b.sequence);
    var placed=[],cursor=0;
    var remaining=new Map(), successors=new Map(), readyAt=new Map();
    jobs.forEach(function (job) {
      remaining.set(job,0); successors.set(job,[]); readyAt.set(job,0);
    });
    jobs.forEach(function (before) {
      jobs.forEach(function (after) {
        if (!precedes(before,after)) return;
        successors.get(before).push(after);
        remaining.set(after,remaining.get(after)+1);
      });
    });
    for (var day of days) {
      var origin=Date.parse(day.day+'T00:00:00Z')/60000;
      var end=origin+minutes(day.endTime), start=origin+minutes(day.startTime);
      var lanes=Array(courts).fill(start);
      for (var at=start; at<end && pending.length;) {
        for (var court=0;court<courts && pending.length;court++) {
          if (lanes[court]>at) continue;
          var ready=pending.filter(job=>(!job.assignment || job.assignment.courts.includes(court+1)) && windowAllows(job,day.day,at-origin) && at+job.duration<=end &&
            remaining.get(job)===0 && readyAt.get(job)<=at);
          if (!ready.length) continue;
          var item=ready[spread ? (cursor++ % ready.length) : 0];
          pending.splice(pending.indexOf(item),1);
          var finish=at+item.duration;
          lanes[court]=finish;
          placed.push(Object.assign({},item,{day:day.day,court:court+1,startTime:clock(at-origin)}));
          successors.get(item).forEach(function (after) {
            remaining.set(after,remaining.get(after)-1);
            readyAt.set(after,Math.max(readyAt.get(after),finish));
          });
        }
        var openings=pending.flatMap(job=>(job.windows || []).filter(row=>row.day===day.day).map(row=>origin+minutes(row.startTime)));
        var next=Math.min(...lanes.concat(openings).filter(finish=>finish>at));
        if (!Number.isFinite(next)) break;
        at=next;
      }
    }
    // O fim proposto é uma referência visual: complete as reservas sem alterar
    // durações, quadras, entradas ou precedência esportiva.
    if(allowOverflow && pending.length) {
      var laneEnds=Array(courts).fill(0), lastDay=days.at(-1);
      placed.forEach(tile=>laneEnds[tile.court-1]=Math.max(laneEnds[tile.court-1],absoluteDay(tile.day)+minutes(tile.startTime)+tile.duration));
      var horizon=absoluteDay(lastDay.day)+1440+Math.min(400*1440,jobs.reduce((n,j)=>n+j.duration,0)+1440);
      while(pending.length) {
        var candidates=[];
        pending.forEach(function(job) {
          if(remaining.get(job)!==0) return;
          var eligible=days.filter(day=>(!job.requiredDay || day.day===job.requiredDay) && (!job.windows?.length || job.windows.some(w=>w.day===day.day)));
          var base=eligible.at(-1);if(!base) return;
          for(var lane=0;lane<courts;lane++) {
            if(job.assignment && !job.assignment.courts.includes(lane+1)) continue;
            var start=Math.max(absoluteDay(base.day)+minutes(base.startTime),laneEnds[lane],readyAt.get(job));
            candidates.push({job:job,lane:lane,at:start});
          }
        });
        candidates.sort((a,b)=>a.at-b.at || pending.indexOf(a.job)-pending.indexOf(b.job) || a.lane-b.lane);
        var chosen=candidates[0];
        if(!chosen || chosen.at+chosen.job.duration>horizon) return {error:'A distribuição contém dependências ou durações inválidas. Confira as fases e as quadras.'};
        var item=chosen.job,finish=chosen.at+item.duration;
        pending.splice(pending.indexOf(item),1);laneEnds[chosen.lane]=finish;
        placed.push(Object.assign({},item,{day:new Date(chosen.at*60000).toISOString().slice(0,10),court:chosen.lane+1,startTime:clock(chosen.at%1440)}));
        successors.get(item).forEach(function(after) {remaining.set(after,remaining.get(after)-1);readyAt.set(after,Math.max(readyAt.get(after),finish));});
      }
    }
    if(pending.length) return {error:'A janela de jogos não comporta '+pending.length+' reservas. Amplie o horário ou a quantidade de quadras.'};
    return {tiles:placed};
  }
  function suggestProjected(t,days,context,projection) {
    try {
      projection=projection || project(t,context);
      var courts=Number(t.courtCount);
      if (!Number.isSafeInteger(courts) || courts<1 || courts>128 || !days.length) throw new Error('Informe os dias e as quadras disponíveis.');
      var jobs=projection.jobs.map((job,i)=>{var tile=Object.assign({},job,{id:'p'+i,duration:v2Duration(job,Object.assign({},t,{phases:projection.phases}))});delete tile.matchIds;return tile;});
      jobs.forEach(job=>{job.windows=[];});
      var total=jobs.reduce((n,j)=>n+j.games,0);
      var plan={schema:2,editorVersion:2,allowOverflow:true,categoryPlacement:'grid',day:days[0].day,days:days.map(d=>({day:d.day,startTime:d.startTime,endTime:d.endTime})),courts:courts,totalGames:total,capacities:projection.capacities};
      plan.inputSignature=signatureOf(t,projection,plan);
      var saved=t.scheduleWindow?.interleavedPlan;
      if (saved && Object.hasOwn(saved,'groupAssignments')) return applyAssignments(jobs,plan,days,saved.groupAssignments);
      var defaults=suggestedAssignments(jobs,courts,t);
      if(defaults.length) return applyAssignments(jobs,plan,days,defaults);
      var result=arrange(jobs,days,courts,false,true);
      return result.error ? result : {tiles:result.tiles,plan:toPlan(plan,result.tiles)};
    } catch(error) {return {error:error.message};}
  }
  function validateReservations(tiles,plan,days) {
    var keys=new Set(),placed=[];
    var lastDay=days.slice().sort((a,b)=>a.day.localeCompare(b.day)).at(-1);
    var horizon=absoluteDay(lastDay.day)+1440+Math.min(400*1440,tiles.reduce((n,t)=>n+t.duration,0)+1440);
    for(var tile of tiles) {
      var day=dayOf(tile,plan,days), at=minutes(tile.startTime);
      if (tile.assignment && !tile.assignment.courts.includes(tile.court)) return 'A quadra escolhida pertence a outro grupo nesta entrada.';
      if (!day || !civilDay(tile.day) || !Number.isFinite(at) || at<minutes(day.startTime) || (!plan.allowOverflow && outsideWindow(tile,day)) || (plan.allowOverflow && absoluteDay(tile.day)+at+tile.duration>horizon) || !Number.isInteger(tile.court) ||
          tile.court<1 || tile.court>plan.courts || !Number.isInteger(tile.duration) || tile.duration<=0 ||
          !windowAllows(tile,tile.day,at,plan.allowOverflow===true)) return 'Confira o dia, horário e a quadra de cada partida.';
      var key=positionKey(tile);
      if (keys.has(key)) return 'Há uma posição de jogo duplicada na grade.';
      keys.add(key);
      var start=Date.parse(tile.day+'T00:00:00Z')/60000+at,end=start+tile.duration;
      for(var other of placed) {
        if (tile.court===other.tile.court && start<other.end && end>other.start) return 'Dois jogos ocupam a mesma quadra.';
        if (precedes(other.tile,tile) && other.end>start || precedes(tile,other.tile) && end>other.start)
          return 'Uma partida começa antes de terminar a fase ou rodada que a precede.';
      }
      placed.push({tile:tile,start:start,end:end});
    }
    return null;
  }
  function signatureOf(t,projected,plan) {
    var values=[projected.capacities,(plan?.categoryPlacement==='grid' ? [] : t.scheduleWindow?.categoryWindows || []).map(r=>[r.category,r.day,r.startTime,r.endTime]),
      projected.phases.map(p=>[p.kind,p.formatCode,p.classification,p.elimination,p.groupFormation,p.gruposCount,p.source,
        p.gameDuration,p.scoring?.setsToWin,p.rounds,p.fixedPairs,p.grandFinalPolicy,p.grandFinalReset,p.finalSeriesBestOf,
        p.teamCompetition?.schedule,p.teamCompetition?.teamCount]),
      t.scoring?.setsToWin || 0,t.gameDuration || 30,t.callTime || 0,t.warmupTime || 0,t.setupScope || t.superEightSetupScope || '',
      projected.jobs.map(j=>[positionKey(j),j.wave,j.games,j.optional || false,j.requiredDay || '']).sort()];
    if(projected.phases.some(p=>p.groupCrossSeeding)) values.push(['groupCrossSeeding',projected.phases.map(p=>p.groupCrossSeeding===true)]);
    var raw=JSON.stringify(values,function (_,v) {
      if (!v || typeof v!=='object' || Array.isArray(v)) return v;
      return Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]]));
    }), hash=2166136261;
    for (var i=0;i<raw.length;i++) hash=Math.imul(hash^raw.charCodeAt(i),16777619);
    return (hash>>>0).toString(16);
  }
  function assertPlan(t,plan,days,ctx) {
    function reject(msg) {throw new Error(msg);}
    function closed(o,keys) {return o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).every(k=>keys.includes(k));}
    if (!closed(plan,['schema','editorVersion','day','days','courts','totalGames','capacities','inputSignature','blocks','groupAssignments','allowOverflow','categoryPlacement']) ||
        plan.schema!==2 || plan.editorVersion!==2 || (Object.hasOwn(plan,'allowOverflow') && plan.allowOverflow!==true) || (Object.hasOwn(plan,'categoryPlacement') && plan.categoryPlacement!=='grid') || !Array.isArray(plan.blocks) || !plan.blocks.length || plan.blocks.length>400 ||
        !Number.isSafeInteger(plan.courts) || Number(t.courtCount)!==plan.courts || Number(plan.courts)<1 ||
        !Array.isArray(days) || !days.length || plan.day!==days[0].day || !Array.isArray(plan.days) || plan.days.length!==days.length ||
        !plan.days.every((d,i)=>closed(d,['day','startTime','endTime']) && ['day','startTime','endTime'].every(k=>d[k]===days[i][k])) ||
        JSON.stringify(plan).length>256*1024) reject('Grade inválida, excessiva ou incompatível com a janela de jogos.');
    var projected=project(t,ctx), expected=new Map(projected.jobs.map(j=>[positionKey(j),j]));
    if (plan.blocks.length!==expected.size || plan.totalGames!==projected.jobs.reduce((n,j)=>n+j.games,0) ||
        JSON.stringify(plan.capacities)!==JSON.stringify(projected.capacities) || plan.inputSignature!==signatureOf(t,projected,plan))
      reject('A grade está desatualizada para as regras e o elenco desta edição. Gere a proposta novamente.');
    if (Object.hasOwn(plan,'groupAssignments')) {
      var assignments=validatedAssignments(projected.jobs,plan.groupAssignments,plan.courts);
      if (assignments.some((row,i)=>row.label!==plan.groupAssignments[i].label)) reject('Confira os nomes dos grupos na distribuição.');
    }
    for (var block of plan.blocks) {
      if (!closed(block,['phaseIndex','kind','category','bracket','round','wave','groupNumber','sequence','games','requiredDay','optional','categoryAdvance','day','startTime','courts']) ||
          !Array.isArray(block.courts) || block.courts.length!==1 || !Number.isSafeInteger(block.courts[0])) reject('Reserva de quadra inválida.');
      var key=positionKey(block),job=expected.get(key);
      if (!job || job.games!==block.games || job.wave!==block.wave || job.kind!==block.kind ||
          job.optional!==block.optional || job.categoryAdvance!==block.categoryAdvance || job.requiredDay!==block.requiredDay) reject('A grade diverge das posições reais da fase.');
      expected.delete(key);
    }
    var error=validate(expand(plan,Object.assign({},t,{phases:projected.phases})),plan,days);
    if(error) reject(error);
  }
  var api = {displayDays:displayDays, suggestedAssignments:suggestedAssignments,applyAssignments:applyAssignments,bindAssignments:bindAssignments,precedes:precedes,v2Duration:v2Duration,canInterleave:canInterleave,assertPlan:assertPlan,project:project,technicalPositions:technicalPositions,positionKey:positionKey,suggestProjected:suggestProjected, minutes:minutes, clock:clock, duration:duration, expand:expand, validate:validate,
    move:move, toPlan:toPlan, preset:preset, stageKey:stageKey, groupLabel:groupLabel, numbered:numbered,
    gameStarts:gameStarts, eliminationLabels:eliminationLabels,describeProjectedTiles:describeProjectedTiles,matchupLabel:matchupLabel, suggest:suggest,
    expectedSignatures:expectedSignatures, signatures:signatures,
    outsideWindow:outsideWindow, overlapIds:overlapIds, daysOf:daysOf, dayOf:dayOf };
  root.ScoreplacePhaseGridPlan = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
