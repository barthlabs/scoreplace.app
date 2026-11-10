/* Súmula operacional: PDF local, somente leitura. Não altera a grade nem inscrições. */
(function (root) {
  'use strict';

  function text(value) { return String(value == null ? '' : value).trim(); }
  function timestamp(value) {
    if (value && typeof value.toMillis === 'function') return Number(value.toMillis());
    if (value && typeof value.seconds === 'number') return value.seconds * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1000000);
    var ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  function localDay(value) {
    var d = new Date(timestamp(value));
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function localTime(value) {
    var d = new Date(timestamp(value));
    return isNaN(d.getTime()) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dayLabel(day) {
    var parts = day.split('-');
    return parts.length === 3 ? parts[2] + '/' + parts[1] + '/' + parts[0] : day;
  }
  function displaySide(t, m, slot) {
    var raw = text(m[slot]);
    var uids = m[slot === 'p1' ? 'team1Uids' : 'team2Uids'] || m[slot + 'Uid'] || '';
    var live = typeof root._resolveSideLive === 'function' ? root._resolveSideLive(t, raw, uids) : raw;
    return text(live) || 'A definir';
  }
  function teamName(t, m, slot) {
    if (typeof root._competitionTeamNameForMatch === 'function') return text(root._competitionTeamNameForMatch(t, m, slot));
    var obj = m[slot === 'p1' ? 'team1Obj' : 'team2Obj'] || {};
    var id = text(m[slot + 'CompetitionTeamId'] || obj.competitionTeamId);
    if (!id) return '';
    var team = (t.competitionTeams || []).find(function (item, i) { return text(item.id || item.teamId || 'team-' + (i + 1)) === id; });
    return team ? text(team.name || team.displayName) : '';
  }
  function members(name) {
    return text(name).split(/\s+\/\s+/).map(text).filter(function (part) {
      return part && !/^(?:A definir|TBD|BYE)$/i.test(part);
    });
  }
  function matchNumber(m) {
    var n = Number(m.scheduledGameNumber || m.number || m.matchNumber || m._gameNum);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  function originGroupForSide(t, m, slot) {
    var side = slot === 'p1' ? 'team1Obj' : 'team2Obj';
    var team = m[side] || {};
    var raw = Array.isArray(team.participants) && team.participants.length
      ? team.participants : members(displaySide(t, m, slot));
    function personName(person) {
      return text(typeof person === 'string' ? person : person &&
        (person.displayName || person.name || person.fullName)).normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }
    var names = raw.map(personName).filter(Boolean);
    if (names.length !== 2) return '';
    var category = text(m.category || m.categoryName);
    var groups = (Array.isArray(t.groups) ? t.groups : []).filter(function (group) {
      if (category && text(group && (group.category || group.categoryName)) !== category) return false;
      var roster = group && (group.players || group.participants || group.standings) || [];
      var known = roster.map(personName);
      return names.every(function (name) { return known.indexOf(name) >= 0; });
    });
    return groups.length === 1 ? text(groups[0].name || groups[0].label) : '';
  }
  function scoringFor(t) {
    var defaults = typeof root._sportScoringDefaultsMap === 'function'
      ? root._sportScoringDefaultsMap() : {};
    var scoring = t.scoring || (t.phases && t.phases[0] && t.phases[0].scoring)
      || defaults[t.sport] || defaults._default || {};
    var setsToWin = Math.max(1, Math.min(3, parseInt(scoring.setsToWin, 10) || 1));
    return {
      slots: Math.min(5, 2 * setsToWin - 1),
      gamesPerSet: Math.max(1, parseInt(scoring.gamesPerSet, 10) || 6),
      type: text(scoring.type)
    };
  }
  function collect(t, allMatches) {
    var seen = new Set();
    var plannedCourts = {}, plannedNumbers = {};
    if (typeof root._operationalSchedulePlan === 'function') {
      var plan = root._operationalSchedulePlan(t);
      (plan && plan.items || []).forEach(function (item) {
        plannedCourts[text(item.matchId)] = text(item.court);
        plannedNumbers[text(item.matchId)] = Number(item.scheduledGameNumber) || null;
      });
    }
    var real = (allMatches || []).filter(function (m) {
      if (!m || m.isBye || m.isSitOut || m.p1 === 'BYE' || m.p2 === 'BYE') return false;
      var dated = !!(m.scheduledAt && localDay(m.scheduledAt));
      var key = text(m.id) || (dated
        ? [m.scheduledAt, m.court, m.p1, m.p2].join('|')
        : [m.scheduledAt, m.court, m.p1, m.p2, m.phaseIndex || 0, m.category || m.categoryName || '', m.round || ''].join('|'));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(function (m) {
      var dated = !!(m.scheduledAt && localDay(m.scheduledAt));
      return {
        id: text(m.id), day: dated ? localDay(m.scheduledAt) : '', time: dated ? localTime(m.scheduledAt) : '',
        at: dated ? timestamp(m.scheduledAt) : NaN, phaseIndex:Number(m.phaseIndex) || 0,
        court: text(m.court) || plannedCourts[text(m.id)] || '',
        number:Number(m.scheduledGameNumber) || plannedNumbers[text(m.id)] || matchNumber(m), category: text(m.category || m.categoryName),
        round: m.round == null ? '' : String(m.round), bracket:text(m.bracket || 'main'),
        elimination: typeof root._isEliminationPhase === 'function' && root._isEliminationPhase(t, Number(m.phaseIndex) || 0),
        isThirdPlace:!!m.isThirdPlace, nextMatchId:text(m.nextMatchId), nextSlot:text(m.nextSlot),
        loserNextMatchId:text(m.loserNextMatchId), loserNextSlot:text(m.loserNextSlot),
        p1: displaySide(t, m, 'p1'), p2: displaySide(t, m, 'p2'),
        source1:originGroupForSide(t, m, 'p1'), source2:originGroupForSide(t, m, 'p2'),
        team1: teamName(t, m, 'p1'), team2: teamName(t, m, 'p2'),
        uids1: m.team1Uids || (m.p1Uid ? [m.p1Uid] : []), uids2: m.team2Uids || (m.p2Uid ? [m.p2Uid] : [])
      };
    });
    var matches = real.filter(function (m) { return !!m.day; }).sort(function (a, b) {
      return a.at - b.at || a.court.localeCompare(b.court, 'pt-BR', { numeric:true }) || (a.number || 0) - (b.number || 0) || a.id.localeCompare(b.id);
    });
    var undated = real.filter(function (m) { return !m.day; }).sort(function (a, b) {
      return a.phaseIndex - b.phaseIndex || a.category.localeCompare(b.category, 'pt-BR') ||
        Number(a.round || 0) - Number(b.round || 0) || (a.number || 0) - (b.number || 0);
    });
    var days = [];
    matches.forEach(function (m) { if (days.indexOf(m.day) < 0) days.push(m.day); });
    var future = null, pending = [];
    var next = (Number(t.currentPhaseIndex) || 0) + 1;
    if (Array.isArray(t.phases) && t.phases[next]) {
      if (typeof root._sumulaUpcomingBracket === 'function') future = root._sumulaUpcomingBracket(t, next);
      if (!future) pending.push('A estrutura da próxima fase ainda não está disponível.');
    }
    if (future && future.pending) pending.push(future.pending);
    if (future && future.categories) {
      var realNext = real.filter(function (m) { return m.phaseIndex === next; });
      if (future.categories.length > 1 && realNext.some(function (m) { return !m.category; })) {
        future.categories = [];
        pending.push('Jogos da próxima fase sem categoria: roteiro pendente.');
      } else future.categories = future.categories.filter(function (bucket) {
        var existing = realNext.filter(function (m) { return m.category === bucket.category; });
        if (!existing.length) return true;
        if (existing.length < bucket.matches.length) pending.push(bucket.category + ': ' +
          (bucket.matches.length - existing.length) + ' confronto(s) ainda não materializado(s).');
        return false;
      });
    }
    if (Array.isArray(t.phases) && t.phases.length > next + 1)
      pending.push('Fases posteriores à próxima serão definidas após os resultados.');
    var tiebreakGroups = [];
    if (typeof root._sorteioDaFaseEhReiRainha === 'function' &&
        root._sorteioDaFaseEhReiRainha(t, 0) &&
        t.fmt2 && t.fmt2.tieResolution === 'singles_then_draw' &&
        root._phasesEngine && typeof root._phasesEngine.prevPhaseGroups === 'function') {
      try { tiebreakGroups = (root._phasesEngine.prevPhaseGroups(t) || []).map(function (g, i) {
        var first = g && Array.isArray(g.matches) && g.matches[0];
        return { name:text(g && g.name) || 'Grupo ' + (i+1),
          category:text(g && (g.category || g.categoryName) || first && (first.category || first.categoryName)),
          court:text(first && (first.court || plannedCourts[text(first.id)])) };
      }); } catch (e) { tiebreakGroups = []; }
    }
    return { tournament: text(t.name || t.title || 'Torneio'), matches: matches, undated: undated,
      days: days, future:future, pending:pending, tiebreakGroups:tiebreakGroups,
      tiePoints:Math.max(1, Math.min(99, Number(t.fmt2 && t.fmt2.tieSinglesPoints) || 5)),
      tieMargin:t.fmt2 && t.fmt2.tieSinglesMargin === 2 ? 2 : 1,
      scoring: scoringFor(t) };
  }
  function attendance(model, day) {
    var first = new Map();
    var present = new Set();
    model.matches.forEach(function (m) {
      [['p1', 'p2', 'team1', 'uids1'], ['p2', 'p1', 'team2', 'uids2']].forEach(function (side) {
        var people = members(m[side[0]]), partner = people.length === 2 ? people : [];
        var uids = Array.isArray(m[side[3]]) ? m[side[3]] : [];
        people.forEach(function (name, index) {
          var key = text(uids[index]) ? 'uid:' + text(uids[index]) : 'name:' + name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          if (!first.has(key)) first.set(key, {
            name:name, partner:partner.length === 2 ? partner[1 - index] : '',
            team:m[side[2]], opponents:m[side[1]], firstGame:m.number, firstDay:m.day
          });
          if (m.day === day) present.add(key);
        });
      });
    });
    return Array.from(present).map(function (key) { return first.get(key); })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity:'base' }) || a.partner.localeCompare(b.partner, 'pt-BR'); });
  }

  // PDF 1.4 vetorial mínimo. Helvetica/WinAnsi mantém os nomes portugueses selecionáveis
  // e o arquivo independente de CDN, servidor, login ou envio de dados pessoais.
  var unicode = { '\u2013':'-', '\u2014':'-', '\u2018':"'", '\u2019':"'", '\u201c':'"', '\u201d':'"', '\u2026':'...', '\u00a0':' ' };
  function latin(value) {
    return String(value).replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2026\u00a0]/g, function (c) { return unicode[c]; })
      .replace(/[^\x20-\x7e\xa0-\xff]/g, '?');
  }
  function pdfString(value) {
    return '(' + latin(value).replace(/[\\()]/g, '\\$&').replace(/[\x80-\xff]/g, function (c) {
      return '\\' + c.charCodeAt(0).toString(8).padStart(3, '0');
    }) + ')';
  }
  function pdfPage(width, height) {
    var commands = [];
    function line(x1, y1, x2, y2, gray) {
      commands.push((gray == null ? '0.7' : gray) + ' G 0.6 w ' + x1 + ' ' + (height-y1) + ' m ' + x2 + ' ' + (height-y2) + ' l S');
    }
    function rect(x, y, w, h, fill) {
      commands.push((fill == null ? '0.95' : fill) + ' g ' + x + ' ' + (height-y-h) + ' ' + w + ' ' + h + ' re f');
    }
    function fillRect(x, y, w, h, rgb) {
      commands.push(rgb + ' rg ' + x + ' ' + (height-y-h) + ' ' + w + ' ' + h + ' re f');
    }
    function logo(x, y, size) {
      var scale = size / 36;
      commands.push('q ' + scale + ' 0 0 ' + scale + ' ' + x + ' ' + (height-y-size) + ' cm /OfficialLogo Do Q');
    }
    function box(x, y, w, h) {
      commands.push('0.3 G 0.7 w ' + x + ' ' + (height-y-h) + ' ' + w + ' ' + h + ' re S');
    }
    function write(value, x, y, size, bold, maxChars, rgb) {
      var str = latin(value);
      if (maxChars && str.length > maxChars) str = str.slice(0, maxChars - 3) + '...';
      commands.push((rgb || '0 0 0') + ' rg BT /F' + (bold ? '2' : '1') + ' ' + (size || 9) + ' Tf 1 0 0 1 ' + x + ' ' + (height-y) + ' Tm ' + pdfString(str) + ' Tj ET');
    }
    return { width:width, height:height, commands:commands, line:line, rect:rect,
      fillRect:fillRect, logo:logo, box:box, write:write };
  }
  // Forma vetorial gerada do SVG canônico no cabeçalho do app (index.html).
  // Gerar novamente com scripts/generate-sumula-logo.py se o cabeçalho mudar.
  // BEGIN OFFICIAL PDF LOGO
  var officialLogoSourceSha256 = 'b4d9b4333a0b09f5f1f0460ee49d8db61bf7304c8417c46d4bba02a58d963fb9';
  var officialLogoVector =
    'MSAwIDAgLTEgMCAzNiBjbQpxCjAuNzk2MDc4IDAuODM1Mjk0IDAuODgyMzUzIHJnIC9hMCBncwo2IDE5LjUgbSAxMC41IDE5LjUg' +
    'bCAxMS4zMjggMTkuNSAxMiAyMC4xNzIgMTIgMjEgYyAxMiAyOC41IGwgMTIgMjkuMzI4IAoxMS4zMjggMzAgMTAuNSAzMCBjIDYg' +
    'MzAgbCA1LjE3MiAzMCA0LjUgMjkuMzI4IDQuNSAyOC41IGMgNC41IDIxIGwgNC41IDIwLjE3MgogNS4xNzIgMTkuNSA2IDE5LjUg' +
    'YyBoCjYgMTkuNSBtIGYKMC45NjA3ODQgMC42MTk2MDggMC4wNDMxMzczIHJnIDE1Ljc1IDEyIG0gMjAuMjUgMTIgbCAyMS4wNzgg' +
    'MTIgMjEuNzUgMTIuNjcyIDIxLjc1IDEzLjUgYyAyMS43NSAyOC41IGwgCjIxLjc1IDI5LjMyOCAyMS4wNzggMzAgMjAuMjUgMzAg' +
    'YyAxNS43NSAzMCBsIDE0LjkyMiAzMCAxNC4yNSAyOS4zMjggMTQuMjUKIDI4LjUgYyAxNC4yNSAxMy41IGwgMTQuMjUgMTIuNjcy' +
    'IDE0LjkyMiAxMiAxNS43NSAxMiBjIGgKMTUuNzUgMTIgbSBmCjAuOTg0MzE0IDAuNTcyNTQ5IDAuMjM1Mjk0IHJnIDI1LjUgMjIu' +
    'NSBtIDMwIDIyLjUgbCAzMC44MjggMjIuNSAzMS41IDIzLjE3MiAzMS41IDI0IGMgMzEuNSAyOC41IGwgMzEuNQogMjkuMzI4IDMw' +
    'LjgyOCAzMCAzMCAzMCBjIDI1LjUgMzAgbCAyNC42NzIgMzAgMjQgMjkuMzI4IDI0IDI4LjUgYyAyNCAyNCAKbCAyNCAyMy4xNzIg' +
    'MjQuNjcyIDIyLjUgMjUuNSAyMi41IGMgaAoyNS41IDIyLjUgbSBmCjAuOTYwNzg0IDAuNjE5NjA4IDAuMDQzMTM3MyByZyAxOCA2' +
    'LjYwMiBtIDE4Ljc1IDguNjk5IGwgMjAuODUyIDguNjk5IGwgMTkuMTk5IDEwLjA1MSBsIDE5LjgwMSAxMiBsIDE4IAoxMC44MDEg' +
    'bCAxNi4xOTkgMTIgbCAxNi44MDEgMTAuMDUxIGwgMTUuMTQ4IDguNjk5IGwgMTcuMjUgOC42OTkgbCBoCjE4IDYuNjAyIG0gZgpR' +
    'Cg==';
  // END OFFICIAL PDF LOGO
  function binaryFromBase64(value) {
    if (typeof atob === 'function') return atob(value);
    return Buffer.from(value, 'base64').toString('latin1');
  }
  function uniqueAthletes(matches) {
    var found = new Map();
    matches.forEach(function (m) {
      [['p1','uids1'],['p2','uids2']].forEach(function (side) {
        var names = members(m[side[0]]), uids = m[side[1]] || [];
        names.forEach(function (name, i) {
          var key = text(uids[i]) ? 'uid:' + text(uids[i])
            : 'name:' + name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
          if (!found.has(key)) found.set(key, name);
        });
      });
    });
    return Array.from(found.values()).sort(function (a,b) { return a.localeCompare(b, 'pt-BR', { sensitivity:'base' }); });
  }
  function splitLabel(value, limit) {
    var label = text(value);
    if (label.length <= limit) return [label];
    var cut = label.lastIndexOf(' ', limit);
    if (cut < Math.floor(limit * 0.55)) cut = limit;
    var tail = label.slice(cut).trim();
    return [label.slice(0, cut).trim(), tail];
  }
  // Larguras médias da Helvetica em pontos por mil. Servem tanto para manter
  // os nomes dentro da coluna quanto para alinhar a dupla da direita ao limite.
  function labelWidth(value, size, bold) {
    return Array.from(latin(value)).reduce(function (sum, ch) {
      if (/[ilI1.,:;!'| ]/.test(ch)) return sum + (ch === ' ' ? 278 : 250);
      if (/[MW@%]/.test(ch)) return sum + (bold ? 944 : 889);
      if (/[mw]/.test(ch)) return sum + (bold ? 833 : 778);
      if (/[A-Z0-9]/.test(ch)) return sum + (bold ? 667 : 611);
      return sum + (bold ? 556 : 500);
    }, 0) * size / 1000;
  }
  function fitLabel(value, width, size, bold) {
    var label = text(value);
    if (labelWidth(label, size, bold) <= width) return label;
    while (label.length > 1 && labelWidth(label + '...', size, bold) > width) label = label.slice(0, -1).trimEnd();
    return label + '...';
  }
  function sideLines(value, width, size, bold) {
    var label = text(value);
    if (labelWidth(label, size, bold) <= width) return [label];
    var words = label.split(/\s+/);
    for (var cut=words.length-1;cut>0;cut--) {
      var first = words.slice(0, cut).join(' '), second = words.slice(cut).join(' ');
      if (labelWidth(first, size, bold) <= width && labelWidth(second, size, bold) <= width)
        return [first, second];
    }
    return null;
  }
  function sideWrite(p, label, x, y, width, size, bold, right, rgb) {
    var fitted = fitLabel(label, width - 6, size, bold);
    var position = right ? x + width - 3 - labelWidth(fitted, size, bold) : x + 3;
    p.write(fitted, position, y, size, bold, null, rgb);
  }
  function writeSide(p, team, names, x, top, width, portrait, right, dense) {
    var people = members(names);
    if (!people.length) people = [names];
    var playerSize = portrait ? 8.5 : 9.3;
    var compact = !portrait && people.some(function (name) {
      return labelWidth(name, playerSize, true) > width - 6;
    });
    sideWrite(p, team || '', x, top + (compact ? 7 : 8), width,
      portrait ? 7 : compact ? 6.4 : 7.2, false, right, '0.32 0.40 0.48');
    people.slice(0, 2).forEach(function (name, i) {
      var size = compact ? 7.8 : playerSize, lines;
      while (size >= 6.8 && !(lines = sideLines(name, width - 6, size, true))) size -= 0.2;
      if (!lines) { size = 6.8; lines = [fitLabel(name, width - 6, size, true)]; }
      var y = top + (dense ? 18 + 17*i : portrait ? 21 + 19*i : compact ? 15 + 14*i : 17 + 13*i);
      sideWrite(p, lines[0], x, y, width, size, true, right);
      if (lines[1]) sideWrite(p, lines[1], x, y + (portrait ? 8 : 7), width,
        Math.min(size, portrait ? 7.8 : 7.3), true, right);
    });
  }
  function categoriesLabel(categories, width, size) {
    var prefix = 'Categorias: ', shown = [];
    for (var i = 0; i < categories.length; i++) {
      var next = shown.concat(categories[i]);
      var remaining = categories.length - next.length;
      var candidate = prefix + next.join(', ') + (remaining ? ' +' + remaining : '');
      if (labelWidth(candidate, size, false) > width) break;
      shown = next;
    }
    if (!shown.length) return fitLabel(prefix + (categories[0] || 'Sem categoria'), width, size, false);
    return prefix + shown.join(', ') + (categories.length > shown.length ? ' +' + (categories.length - shown.length) : '');
  }
  // Quadras com 13 ou 14 jogos usam a altura da folha vertical sem perder placar ou assinaturas.
  function scorePage(model, day, courtLabel, matches, part, total, orientation, dense) {
    var portrait = orientation === 'portrait';
    var p = portrait ? pdfPage(595, 842) : pdfPage(842, 595);
    var left = portrait ? 18 : 20, right = p.width - left;
    var divider = portrait ? 397 : 559, top = 86, bodyTop = 105;
    var rowHeight = dense ? 50 : portrait ? 54 : 38;
    var bodyRows = dense ? 14 : 12;
    var slots = model.scoring && model.scoring.slots || 1;
    var gamesPerSet = model.scoring && model.scoring.gamesPerSet || 6;
    var gameLabel = slots === 1 ? '1 set de ' + gamesPerSet + ' games' : 'melhor de ' + slots + ' sets';
    var headerWidth = right - 68 - left;
    var categories = Array.from(new Set(matches.map(function (m) { return m.category || 'Sem categoria'; })));
    p.fillRect(0, 0, p.width, 76, '0.071 0.133 0.220');
    p.write(fitLabel(model.tournament, headerWidth, portrait ? 11 : 13, true),
      left, 22, portrait ? 11 : 13, true, null, '1 1 1');
    p.write(fitLabel(dayLabel(day) + '  |  ' + gameLabel + '  |  Página ' + part + '/' + total,
      headerWidth, 8, false), left, 38, 8, false, null, '1 1 1');
    p.write(fitLabel(courtLabel, headerWidth, 8, true), left, 51, 8, true, null, '1 1 1');
    p.write(categoriesLabel(categories, headerWidth, portrait ? 6.7 : 7.2),
      left, 65, portrait ? 6.7 : 7.2, false, null, '1 1 1');
    p.logo(right - 60, 4, 60);
    p.line(divider, 79, divider, bodyTop + bodyRows*rowHeight, 0.55);
    p.rect(left, top, divider-left-8, 19, 0.92);
    p.rect(divider+8, top, right-divider-8, 19, 0.92);
    var hourX = left + (portrait ? 22 : 24);
    var courtX = left + (portrait ? 59 : 64);
    var namesX = left + (portrait ? 99 : 111);
    var contentRight = divider - 8;
    var scoreWidth = slots === 1 ? (portrait ? 61 : 69) : Math.min(154, slots*29 + 6);
    var sideWidth = (contentRight - namesX - scoreWidth) / 2;
    var scoreX = namesX + sideWidth, secondX = scoreX + scoreWidth;
    p.write('Nº', left+3, top+13, 7, true);
    p.write('Hora', hourX+3, top+13, 7, true);
    p.write('Quadra', courtX+3, top+13, 7, true);
    p.write('Placar', scoreX + (scoreWidth - labelWidth('Placar', 7, true))/2, top+13, 7, true);
    p.write('ASSINATURAS DOS ATLETAS', divider+12, top+13, 7, true);
    matches.forEach(function (m, i) {
      var y = bodyTop + i*rowHeight;
      if (!(i%2)) p.rect(left, y, contentRight-left, rowHeight, 0.97);
      p.line(left, y+rowHeight, contentRight, y+rowHeight, 0.75);
      p.write(String(m.number || '-'), left+3, y+rowHeight/2+3, 8, true);
      p.write(m.time, hourX+3, y+rowHeight/2+3, 7.5);
      var categoryWidth = namesX - courtX - 14;
      var categoryLines = sideLines(m.category || 'Sem categoria', categoryWidth, 5.5, false)
        || [fitLabel(m.category || 'Sem categoria', categoryWidth, 5.5, false)];
      p.write(categoryLines[0], courtX+3, y+10, 5.5);
      if (categoryLines[1]) p.write(categoryLines[1], courtX+3, y+17, 5.5);
      p.line(courtX+7, y+rowHeight-10, namesX-10, y+rowHeight-10, 0.55);
      writeSide(p, m.team1, m.p1, namesX, y, sideWidth, portrait, false, dense);
      writeSide(p, m.team2, m.p2, secondX, y, sideWidth, portrait, true, dense);
      var cellWidth = scoreWidth / slots;
      for (var s=0;s<slots;s++) {
        var sx = scoreX + s*cellWidth, bw = slots === 1 ? 22 : Math.max(7, Math.floor((cellWidth-12)/2));
        var boxY = y + (rowHeight - 19)/2;
        if (slots > 1) p.write(String(s+1), sx+cellWidth/2-2, y+9, 6, true);
        p.box(sx+3, boxY, bw, 19);
        p.write('x', sx + (cellWidth-labelWidth('x', 7, true))/2, boxY+13, 7, true);
        p.box(sx+cellWidth-bw-3, boxY, bw, 19);
      }
    });
    var people = uniqueAthletes(matches);
    var step = Math.min(24, (bodyRows*rowHeight-14) / Math.max(1, people.length));
    people.forEach(function (name, i) {
      var y = bodyTop + 11 + i*step;
      var limit = portrait ? 22 : 29;
      var labels = step < 16 ? [name] : splitLabel(name, limit);
      p.write(labels[0], divider+12, y, portrait ? 6.3 : (step < 12 ? 6.3 : 7), false, limit);
      if (labels[1]) p.write(labels[1], divider+12, y+7, portrait ? 6 : 6.4, false, limit);
      p.line(divider + (portrait ? 106 : 141), y+3, right-3, y+3, 0.45);
    });
    p.write('scoreplace.app  |  Quadra prevista; anote mudança na coluna. Após o placar, cada atleta assina uma vez.',
      left, p.height-24, portrait ? 6 : 7);
    return p;
  }
  function attendancePage(model, day, rows, part, total) {
    var p = pdfPage(842, 595), x = 28;
    p.write('LISTA DE PRESENÇA', x, 35, 16, true);
    p.write(model.tournament + '   |   ' + dayLabel(day) + (total > 1 ? '   |   Folha ' + part + '/' + total : ''), x, 54, 9, false, 125);
    p.line(x, 63, 814, 63, 0.2);
    var cols = [x, x+180, x+323, x+426, x+696, 814];
    ['ATLETA', 'PARCEIRO(A)', 'EQUIPE', 'ADVERSÁRIOS NO 1º JOGO', 'PRESENÇA'].forEach(function (label, i) { p.write(label, cols[i]+3, 79, 7, true, 39); });
    p.line(x, 85, 814, 85);
    rows.forEach(function (r, i) {
      var y = 104 + i*20;
      if (i%2 === 0) p.rect(x, y-13, 786, 19, 0.97);
      p.write(r.name, cols[0]+3, y, 8, false, 34);
      p.write(r.partner, cols[1]+3, y, 8, false, 27);
      p.write(r.team, cols[2]+3, y, 8, false, 20);
      p.write(r.opponents, cols[3]+3, y, 8, false, 51);
      p.line(cols[4]+8, y+2, cols[5]-10, y+2, 0.55);
      p.line(x, y+6, 814, y+6, 0.85);
    });
    p.write('1º jogo = primeiro confronto cronológico da dupla no torneio. Assinatura ou visto na coluna Presença.', x, 566, 7);
    p.write('scoreplace.app  |  Gerado da grade publicada', x, 583, 7);
    return p;
  }
  function callList(model) {
    var games = (model.matches || []).concat(model.undated || []);
    var knownIds = new Map(), entries = new Map(), skipped = new Map();
    function nameKey(category, name) {
      return (category || 'Sem categoria').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR') + '|' +
        name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
    }
    games.forEach(function (m) {
      [['p1','uids1'],['p2','uids2']].forEach(function (side) {
        var names = members(m[side[0]]), ids = m[side[1]];
        if (!Array.isArray(ids) || ids.length !== names.length) return;
        names.forEach(function (name, i) {
          var id = text(ids[i]), key = nameKey(m.category, name);
          if (id) {
            if (!knownIds.has(key)) knownIds.set(key, new Set());
            knownIds.get(key).add(id);
          }
        });
      });
    });
    games.forEach(function (m) {
      var category = m.category || 'Sem categoria';
      var sides = [members(m.p1), members(m.p2)];
      if (sides.some(function (people, i) {
        var raw = i ? m.p2 : m.p1;
        return !people.length || people.length > 2 ||
          /(?:^|\s)(?:A definir|TBD|BYE)(?:$|\s)/i.test(raw) ||
          /^(?:Vencedor|Perdedor|Classificado|Repescado)(?:\s|$)/i.test(text(raw));
      })) {
        if (!skipped.has(category)) skipped.set(category, []);
        skipped.get(category).push(m.number || m.id || 'sem número');
        return;
      }
      sides.forEach(function (people, sideIndex) {
        var ids = sideIndex ? m.uids2 : m.uids1;
        if (!Array.isArray(ids) || ids.length !== people.length) ids = [];
        people.forEach(function (name, i) {
          var base = nameKey(category, name), id = text(ids[i]);
          var matches = knownIds.get(base), resolved = id || (matches && matches.size === 1 ? Array.from(matches)[0] : 'sem-id');
          var key = base + '|' + resolved;
          if (!entries.has(key)) entries.set(key, { name:name, category:category, games:[] });
          entries.get(key).games.push({ number:m.number || m.id || '-', day:m.day, time:m.time,
            court:m.court || 'A definir', partner:people.length === 2 ? people[1-i] : '-',
            opponents:sides[1-sideIndex].join(' / '), at:m.at });
        });
      });
    });
    var byCategory = new Map();
    entries.forEach(function (entry) {
      if (!byCategory.has(entry.category)) byCategory.set(entry.category, []);
      entry.games.sort(function (a,b) { return (a.at || Infinity) - (b.at || Infinity) || Number(a.number)-Number(b.number); });
      byCategory.get(entry.category).push(entry);
    });
    skipped.forEach(function (_, category) { if (!byCategory.has(category)) byCategory.set(category, []); });
    return Array.from(byCategory, function (pair) {
      pair[1].sort(function (a,b) { return a.name.localeCompare(b.name, 'pt-BR', { sensitivity:'base' }); });
      return { category:pair[0], athletes:pair[1], skipped:skipped.get(pair[0]) || [] };
    }).sort(function (a,b) { return a.category.localeCompare(b.category, 'pt-BR', { sensitivity:'base' }); });
  }
  function callListPage(model, category, rows, part, total, note) {
    var p = pdfPage(842, 595), x = [20, 160, 207, 303, 393, 530, 822];
    p.fillRect(0, 0, p.width, 77, '0.071 0.133 0.220');
    p.write(fitLabel(model.tournament, 680, 12, true), 20, 23, 12, true, null, '1 1 1');
    p.write(fitLabel('LISTA DE CHAMADA  |  ' + category + '  |  Folha ' + part + '/' + total, 680, 9, true),
      20, 48, 9, true, null, '1 1 1');
    p.logo(763, 8, 54);
    ['ATLETA', 'JOGO', 'DIA / HORA', 'QUADRA', 'PARCEIRO(A)', 'ADVERSÁRIOS'].forEach(function (label, i) {
      p.write(label, x[i]+3, 94, 7, true);
    });
    p.line(20, 101, 822, 101);
    rows.forEach(function (row, i) {
      var y = 117 + i*17;
      if (i%2 === 0) p.rect(20, y-12, 802, 16, 0.96);
      p.write(fitLabel(row.name, x[1]-x[0]-7, 7, true), x[0]+3, y, 7, true);
      p.write(String(row.game.number), x[1]+3, y, 7);
      p.write(row.game.day ? dayLabel(row.game.day).slice(0,5) + ' ' + row.game.time : 'A definir', x[2]+3, y, 7);
      p.write(fitLabel(row.game.court, x[4]-x[3]-6, 7), x[3]+3, y, 7);
      p.write(fitLabel(row.game.partner, x[5]-x[4]-6, 7), x[4]+3, y, 7);
      p.write(fitLabel(row.game.opponents, x[6]-x[5]-6, 7), x[5]+3, y, 7);
      p.line(20, y+4, 822, y+4, 0.85);
    });
    if (note) p.write(fitLabel(note, 795, 7, true), 22, 562, 7, true);
    p.write('scoreplace.app  |  Horários e quadras previstos podem mudar durante o evento.', 22, 581, 7);
    return p;
  }
  function makeCallListPages(model) {
    var pages = [];
    callList(model).forEach(function (bucket) {
      var rows = [];
      bucket.athletes.forEach(function (athlete) {
        athlete.games.forEach(function (game) { rows.push({ name:athlete.name, game:game }); });
      });
      var total = Math.max(1, Math.ceil(rows.length / 26));
      var note = bucket.skipped.length ? 'Jogos sem participantes definidos: ' + bucket.skipped.join(', ') : '';
      for (var i=0;i<total;i++) pages.push(callListPage(model, bucket.category,
        rows.slice(i*26, (i+1)*26), i+1, total, i === total-1 ? note : ''));
    });
    return pages;
  }
  function structuralRows(bucket) {
    var matches = bucket.matches.slice().sort(function (a, b) {
      return Number(a.round || 0) - Number(b.round || 0) ||
        Number(a.isThirdPlace) - Number(b.isThirdPlace) || a.id.localeCompare(b.id, 'pt-BR', {numeric:true});
    });
    var refs = {}, incoming = {};
    matches.forEach(function (m, i) { refs[m.id] = m.number ? 'JOGO ' + m.number : 'C' + (i+1); });
    function originLabel(value) {
      var name = text(value);
      return name.replace(/^Grupo\s+/i, '');
    }
    function winnerLabel(ref) {
      return /^JOGO /i.test(ref) ? 'Vencedor do ' + ref : 'Vencedor do confronto ' + ref;
    }
    matches.forEach(function (m) {
      if (m.nextMatchId && m.nextSlot) {
        (incoming[m.nextMatchId] = incoming[m.nextMatchId] || {})[m.nextSlot] = winnerLabel(refs[m.id]);
      }
      if (m.loserNextMatchId && m.loserNextSlot) {
        (incoming[m.loserNextMatchId] = incoming[m.loserNextMatchId] || {})[m.loserNextSlot] = 'Perdedor ' + refs[m.id];
      }
    });
    return matches.map(function (m) {
      var source = incoming[m.id] || {};
      (m.repFill || []).forEach(function (rep) {
        source[rep.slot] = 'Repescado da rodada ' + (Number(rep.srcRound || 0) + 1);
      });
      return { id:m.id, ref:m.number ? 'JOGO ' + m.number : refs[m.id], round:m.round,
        third:m.isThirdPlace, final:!m.isThirdPlace && !m.nextMatchId,
        nextMatchId:m.nextMatchId, nextSlot:m.nextSlot,
        loserNextMatchId:m.loserNextMatchId, loserNextSlot:m.loserNextSlot,
        p1:m.p1 && m.p1 !== 'A definir' ? m.p1 : '',
        p2:m.p2 && m.p2 !== 'A definir' ? m.p2 : '',
        source1:source.p1 || originLabel(m.source1),
        source2:source.p2 || originLabel(m.source2) };
    });
  }
  // Chave em paisagem: quatro linhas por confronto (dois nomes por dupla).
  // O posicionamento usa nextMatchId/nextSlot, não a ordem visual de uma lista.
  function bracketPage(model, bucket, title) {
    var rows = structuralRows(bucket), rounds = Array.from(new Set(rows.filter(function (r) {
      return !r.third;
    }).map(function (r) { return Number(r.round) || 1; }))).sort(function (a,b) { return a-b; });
    if (!rounds.length) return null;
    var firstCount = Math.max.apply(null, rounds.map(function (round) {
      return rows.filter(function (r) { return !r.third && (Number(r.round) || 1) === round; }).length;
    }));
    var size = firstCount > 18
      ? [Math.max(2384, Math.ceil((firstCount*78+170)*Math.SQRT2)), firstCount*78+170]
      : firstCount > 12 || rounds.length > 8 ? [2384,1684]
      : firstCount > 9 || rounds.length > 6 ? [1684,1191]
      : firstCount > 5 || rounds.length > 4 ? [1191,842] : [842,595];
    var p = pdfPage(size[0], size[1]), left = 22, right = p.width-22;
    var top = 122, usable = p.height-170, gap = p.width > 842 ? 24 : 18;
    var colWidth = (right-left-gap*(rounds.length-1))/rounds.length;
    var cardHeight = Math.min(72, usable / firstCount - 3), positions = {};
    var byRound = rounds.map(function (round) {
      return rows.filter(function (r) { return !r.third && (Number(r.round) || 1) === round; });
    });
    p.fillRect(0, 0, p.width, 77, '0.071 0.133 0.220');
    p.write(fitLabel(model.tournament, right-left-80, 13, true), left, 24, 13, true, null, '1 1 1');
    p.write(fitLabel('CHAVE ELIMINATÓRIA  |  ' + (bucket.category || 'Categoria única'),
      right-left-80, 10, true), left, 47, 10, true, null, '1 1 1');
    p.write(fitLabel(title + (bucket.partial ? '  |  Estrutura parcial' : ''), right-left-80, 8),
      left, 64, 8, false, null, '1 1 1');
    p.logo(right-58, 8, 54);
    byRound.forEach(function (group, col) {
      var x = left + col*(colWidth+gap);
      var heading = col === byRound.length-1 ? 'FINAL' : 'RODADA ' + rounds[col];
      p.fillRect(x, 88, colWidth, 22, '0.90 0.94 0.97');
      p.write(heading, x+7, 103, 8, true, null, '0.071 0.20 0.31');
      group.forEach(function (row, i) {
        var source = rows.filter(function (r) { return r.nextMatchId === row.id && positions[r.id]; });
        var center = source.length >= 2
          ? source.reduce(function (sum, r) { return sum+positions[r.id].cy; }, 0)/source.length
          : source.length === 1 ? positions[source[0].id].cy
          : top + usable*(i+0.5)/group.length;
        positions[row.id] = { x:x, y:center-cardHeight/2, cy:center };
      });
      // Repescagens podem receber perdedores de outra coluna. Mesmo assim os
      // quadros desta rodada precisam manter um vão legível entre si.
      for (var i=1;i<group.length;i++) {
        var previous = positions[group[i-1].id], current = positions[group[i].id];
        current.cy = Math.max(current.cy, previous.cy+cardHeight+5);
      }
      if (group.length) {
        var overflow = positions[group[group.length-1].id].cy - (top+usable-cardHeight/2);
        if (overflow > 0) group.forEach(function (row) { positions[row.id].cy -= overflow; });
        group.forEach(function (row) { positions[row.id].y = positions[row.id].cy-cardHeight/2; });
      }
    });
    // Linhas entram em posições distintas para os dois lados do confronto.
    rows.forEach(function (row) {
      var from = positions[row.id], to = positions[row.nextMatchId];
      if (!from || !to) return;
      var tx = to.x, middle = from.x+colWidth+gap/2;
      var entry = to.cy + (row.nextSlot === 'p2' ? 10 : -10);
      p.line(from.x+colWidth, from.cy, middle, from.cy, 0.48);
      p.line(middle, from.cy, middle, entry, 0.48);
      p.line(middle, entry, tx, entry, 0.48);
    });
    function card(row, x, y) {
      p.fillRect(x, y, colWidth, cardHeight, '0.97 0.98 0.99');
      p.box(x, y, colWidth, cardHeight);
      p.write(fitLabel(row.ref + (row.third ? ' · 3º LUGAR' : row.final ? ' · FINAL' : ''),
        colWidth-12, 7.4, true), x+6, y+9, 7.4, true, null, '0.06 0.33 0.51');
      var side1 = members(row.p1), side2 = members(row.p2);
      if (!side1.length) side1 = [];
      if (!side2.length) side2 = [];
      var fs = colWidth < 155 ? 6.3 : 7.2;
      function pair(names, source, base) {
        [names[0] || '', names[1] || ''].forEach(function (name, i) {
            if (!name) p.line(x+7, y+base+i*9+1, x+colWidth-7, y+base+i*9+1, 0.6);
            else p.write(fitLabel(name, colWidth-20, fs, true), x+7, y+base+i*9,
              fs, true);
          });
        p.write(fitLabel(source, colWidth-14, 6.2), x+7, y+base+17, 6.2,
          false, null, '0.28 0.36 0.43');
      }
      pair(side1, row.source1, 20);
      p.line(x+5, y+39, x+colWidth-5, y+39, 0.76);
      pair(side2, row.source2, 49);
    }
    byRound.forEach(function (group) { group.forEach(function (row) {
      var pos = positions[row.id]; card(row, pos.x, pos.y);
    }); });
    var third = rows.find(function (row) { return row.third; });
    if (third) {
      var thirdX = left+(rounds.length-1)*(colWidth+gap), thirdY = p.height-30-cardHeight;
      card(third, thirdX, thirdY);
      rows.filter(function (row) { return row.loserNextMatchId === third.id && positions[row.id]; })
        .forEach(function (row) {
          var from = positions[row.id], middle = from.x+colWidth+gap/2;
          p.line(from.x+colWidth, from.cy, middle, from.cy, 0.65);
          p.line(middle, from.cy, middle, thirdY+cardHeight/2, 0.65);
          p.line(middle, thirdY+cardHeight/2, thirdX, thirdY+cardHeight/2, 0.65);
        });
    }
    p.write('Cada quadro mostra as duas duplas. As linhas indicam o avanço do vencedor; a disputa de 3º lugar recebe os perdedores das semifinais.',
      left, p.height-12, 7);
    return p;
  }
  function writingPage(model, title, subtitle, rows, part, total, orientation, kind) {
    var portrait = orientation === 'portrait', p = portrait ? pdfPage(595, 842) : pdfPage(842, 595);
    var left = 22, right = p.width - 22, top = 100, step = portrait ? 68 : 57;
    p.fillRect(0, 0, p.width, 76, '0.071 0.133 0.220');
    p.write(fitLabel(model.tournament, right-left-70, portrait ? 11 : 13, true), left, 22,
      portrait ? 11 : 13, true, null, '1 1 1');
    p.write(fitLabel(title, right-left-70, 9, true), left, 44, 9, true, null, '1 1 1');
    p.write(fitLabel(subtitle + '  |  Folha ' + part + '/' + total, right-left-70, 7.5, false),
      left, 61, 7.5, false, null, '1 1 1');
    p.logo(right-58, 7, 56);
    rows.forEach(function (row, i) {
      var y = top + i*step;
      p.box(left, y-15, right-left, step-4);
      var label = kind === 'tiebreak' ? 'Desempate, se necessário  |  ' + row.category + '  |  ' + row.name +
        (row.court ? '  |  ' + row.court : '')
        : row.ref + '  |  ' + (row.third ? '3º lugar' : row.final ? 'Final' : 'Rodada ' + row.round);
      p.write(fitLabel(label, right-left-20, 8, true), left+8, y-2, 8, true);
      if (kind === 'tiebreak') {
        p.write('Atleta 1:', left+8, y+15, 7);
        p.line(left+52, y+17, left+(right-left)*0.47, y+17);
        p.write('Atleta 2:', left+(right-left)*0.5, y+15, 7);
        p.line(left+(right-left)*0.57, y+17, right-12, y+17);
        p.write('Simples até ' + model.tiePoints + ' pontos' +
          (model.tieMargin === 2 ? ', vantagem de 2' : ', vence quem chegar primeiro') +
          '  |  Placar: ____ x ____  |  Quadra: ______  Hora: ______',
          left+8, y+34, portrait ? 6.2 : 7);
      } else {
        var half = (right-left)/2;
        p.write(fitLabel(row.p1, half-18, portrait ? 6.8 : 7.2, false), left+8, y+14, portrait ? 6.8 : 7.2);
        p.write(fitLabel(row.p2, half-18, portrait ? 6.8 : 7.2, false), left+half+8, y+14, portrait ? 6.8 : 7.2);
        p.line(left+8, y+28, left+half-10, y+28);
        p.line(left+half+8, y+28, right-10, y+28);
        p.write('Nomes: __________________________    x    __________________________    Placar: __________',
          left+8, y+(portrait ? 43 : 35), portrait ? 6.2 : 7.2);
      }
    });
    p.write('Quadra e hora são preenchidas conforme a operação. Assinaturas: ______________________________',
      left, p.height-16, portrait ? 6.3 : 7);
    return p;
  }
  function makePages(model, options) {
    options = options || {};
    var orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
    var pages = [];
    var courts = Array.from(new Set(model.matches.map(function (m) {
      return m.court || 'Quadra a definir';
    }))).sort(function (a, b) {
      if (a === 'Quadra a definir') return b === a ? 0 : 1;
      if (b === 'Quadra a definir') return -1;
      return a.localeCompare(b, 'pt-BR', { numeric:true });
    });
    courts.forEach(function (courtLabel) {
      model.days.forEach(function (day) {
        var matches = model.matches.filter(function (m) {
          return m.day === day && (m.court || 'Quadra a definir') === courtLabel;
        });
        var total = Math.ceil(matches.length / 14);
        for (var i=0;i<total;i++) {
          var chunk = matches.slice(i*14, (i+1)*14), dense = chunk.length > 12;
          pages.push(scorePage(model, day, courtLabel, chunk,
            i+1, total, dense ? 'portrait' : orientation, dense));
        }
      });
    });
    var unscheduled = model.undated || [];
    if (unscheduled.length) {
      var totalUndated = Math.ceil(unscheduled.length / 14);
      for (var u=0;u<totalUndated;u++) {
        var undatedChunk = unscheduled.slice(u*14, (u+1)*14), undatedDense = undatedChunk.length > 12;
        pages.push(scorePage(model, 'Data a definir', 'Quadra prevista no jogo; anote mudanças',
          undatedChunk, u+1, totalUndated, undatedDense ? 'portrait' : orientation, undatedDense));
      }
    }
    var realBrackets = new Map();
    model.matches.concat(unscheduled).filter(function (m) { return m.elimination; }).forEach(function (m) {
      var key = [m.phaseIndex, m.category, m.bracket].join('|');
      if (!realBrackets.has(key)) realBrackets.set(key, { category:m.category, bracket:m.bracket, matches:[] });
      realBrackets.get(key).matches.push(m);
    });
    realBrackets.forEach(function (bucket) {
      var page = bracketPage(model, bucket, 'Confrontos da fase em andamento');
      if (page) pages.push(page);
    });
    if (model.future && Array.isArray(model.future.categories)) model.future.categories.forEach(function (bucket) {
      var byBracket = new Map();
      bucket.matches.forEach(function (m) {
        var key = m.bracket || 'main';
        if (!byBracket.has(key)) byBracket.set(key, { category:bucket.category, partial:bucket.partial, matches:[] });
        byBracket.get(key).matches.push(m);
      });
      byBracket.forEach(function (part) {
        var page = bracketPage(model, part, 'ROTEIRO DA ' + (model.future.name || 'ELIMINATÓRIA'));
        if (page) pages.push(page);
      });
    });
    var reserves = model.tiebreakGroups || [];
    if (reserves.length) {
      var perReserve = orientation === 'portrait' ? 10 : 8;
      var totalReserve = Math.ceil(reserves.length / perReserve);
      for (var r=0;r<totalReserve;r++) pages.push(writingPage(model, 'RESERVA PARA DESEMPATES',
        'Grupos Rei/Rainha', reserves.slice(r*perReserve, (r+1)*perReserve),
        r+1, totalReserve, orientation, 'tiebreak'));
    }
    if (model.pending && model.pending.length) pages.push(writingPage(model, 'PENDÊNCIAS DA PROGRESSÃO',
      'Aguardando definição', model.pending.map(function (note, i) {
        return { ref:'P' + (i+1), round:'', p1:note, p2:'' };
      }), 1, 1, orientation, 'future'));
    pages.push.apply(pages, makeCallListPages(model));
    if (options.attendance) pages.push.apply(pages, makeAttendancePages(model));
    return pages;
  }
  function makeAttendancePages(model) {
    var pages = [];
    model.days.forEach(function (day) {
      var rows = attendance(model, day), total = Math.max(1, Math.ceil(rows.length / 22));
      for (var i = 0; i < total; i++) pages.push(attendancePage(model, day, rows.slice(i * 22, (i + 1) * 22), i + 1, total));
    });
    return pages;
  }
  function encodePdf(pages) {
    var objects = [null];
    function add(s) { objects.push(s); return objects.length-1; }
    var font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var vector = binaryFromBase64(officialLogoVector);
    var officialLogo = add('<< /Type /XObject /Subtype /Form /FormType 1' +
      ' /BBox [0 0 36 36] /Resources << /ExtGState << /a0 << /CA 1 /ca 1 >> >> >>' +
      ' /Length ' + vector.length + ' >>\nstream\n' + vector + '\nendstream');
    var tree = add('');
    var pageIds = pages.map(function (page) {
      var stream = page.commands.join('\n') + '\n';
      var content = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
      return add('<< /Type /Page /Parent ' + tree + ' 0 R /MediaBox [0 0 ' + page.width + ' ' + page.height + '] /Resources << /Font << /F1 ' + font + ' 0 R /F2 ' + bold + ' 0 R >> /XObject << /OfficialLogo ' + officialLogo + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
    });
    objects[tree] = '<< /Type /Pages /Kids [' + pageIds.map(function (id) { return id + ' 0 R'; }).join(' ') + '] /Count ' + pageIds.length + ' >>';
    var catalog = add('<< /Type /Catalog /Pages ' + tree + ' 0 R >>');
    var output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offsets = [0];
    for (var i=1;i<objects.length;i++) {
      offsets[i] = output.length;
      output += i + ' 0 obj\n' + objects[i] + '\nendobj\n';
    }
    var start = output.length;
    output += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n';
    for (var k=1;k<objects.length;k++) output += String(offsets[k]).padStart(10, '0') + ' 00000 n \n';
    output += 'trailer\n<< /Size ' + objects.length + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + start + '\n%%EOF';
    var bytes = new Uint8Array(output.length);
    for (var b=0;b<output.length;b++) bytes[b] = output.charCodeAt(b) & 255;
    return bytes;
  }
  function filename(model, orientation, onlyAttendance) {
    return (onlyAttendance ? 'presenca-' : 'sumula-') + model.tournament.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,45) + (onlyAttendance ? '' : '-' + (orientation === 'portrait' ? 'vertical' : 'horizontal')) + '.pdf';
  }
  function zipFiles(files) {
    var encoder = new TextEncoder(), parts = [], directory = [], offset = 0;
    var table = Array.from({ length:256 }, function (_, n) {
      var crc = n;
      for (var i=0;i<8;i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
      return crc >>> 0;
    });
    function crc32(bytes) {
      var crc = 0xffffffff;
      for (var i=0;i<bytes.length;i++) crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 255];
      return (crc ^ 0xffffffff) >>> 0;
    }
    function header(length) { return new DataView(new ArrayBuffer(length)); }
    function bytesOf(view) { return new Uint8Array(view.buffer); }
    files.forEach(function (file) {
      var name = encoder.encode(file.name), data = file.bytes, crc = crc32(data);
      var local = header(30);
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true);
      local.setUint32(14, crc, true); local.setUint32(18, data.length, true);
      local.setUint32(22, data.length, true); local.setUint16(26, name.length, true);
      parts.push(bytesOf(local), name, data);
      var central = header(46);
      central.setUint32(0, 0x02014b50, true); central.setUint16(4, 20, true);
      central.setUint16(6, 20, true); central.setUint32(16, crc, true);
      central.setUint32(20, data.length, true); central.setUint32(24, data.length, true);
      central.setUint16(28, name.length, true); central.setUint32(42, offset, true);
      directory.push(bytesOf(central), name);
      offset += 30 + name.length + data.length;
    });
    var directorySize = directory.reduce(function (n, part) { return n + part.length; }, 0);
    var end = header(22);
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true); end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    var all = parts.concat(directory, [bytesOf(end)]), result = new Uint8Array(offset + directorySize + 22);
    var pos = 0;
    all.forEach(function (part) { result.set(part, pos); pos += part.length; });
    return result;
  }
  function download(id, orientation, onlyAttendance) {
    var t = root._findTournamentById && root._findTournamentById(id);
    if (!t) return;
    var user = root.AppStore && root.AppStore.currentUser;
    var authorized = (typeof root._souOrganizador === 'function' ? root._souOrganizador(t)
      : !!(root.AppStore && typeof root.AppStore.isCreator === 'function' && root.AppStore.isCreator(t))) ||
      !!(user && user.uid && Array.isArray(t.arbitros) && t.arbitros.some(function (a) {
        return a && a.uid === user.uid && a.status === 'confirmed';
      }));
    if (!authorized) return;
    var list = typeof root._collectAllMatches === 'function' ? root._collectAllMatches(t) : (t.matches || []);
    var model = collect(t, list);
    if (!model.matches.length && !(model.undated || []).length &&
        !(model.future && model.future.categories && model.future.categories.some(function (b) { return b.matches.length; }))) {
      if (typeof root.showNotification === 'function') root.showNotification('Súmula indisponível', 'Não há jogos ou chave disponíveis.', 'warning');
      return;
    }
    var both = orientation === 'both' && !onlyAttendance;
    orientation = orientation === 'portrait' ? 'portrait' : 'landscape';
    var bytes = both ? zipFiles(['landscape','portrait'].map(function (direction) {
      return { name:filename(model, direction, false), bytes:encodePdf(makePages(model, { orientation:direction })) };
    })) : encodePdf(onlyAttendance ? makeAttendancePages(model) : makePages(model, { orientation:orientation }));
    var name = both ? filename(model, 'landscape', false).replace(/-horizontal\.pdf$/, '-horizontal-vertical.zip')
      : filename(model, orientation, onlyAttendance);
    var url = URL.createObjectURL(new Blob([bytes], { type:both ? 'application/zip' : 'application/pdf' }));
    var anchor = document.createElement('a');
    anchor.href = url; anchor.download = name; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  root.ScoreplaceSumula = { collect:collect, attendance:attendance, callList:callList, makePages:makePages,
    makeCallListPages:makeCallListPages, makeAttendancePages:makeAttendancePages, encodePdf:encodePdf,
    filename:filename, zipFiles:zipFiles };
  root._downloadTournamentSumula = download;
})(typeof window !== 'undefined' ? window : globalThis);
