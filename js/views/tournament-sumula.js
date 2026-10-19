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
  function collect(t, allMatches) {
    var seen = new Set();
    var matches = (allMatches || []).filter(function (m) {
      if (!m || m.isBye || m.isSitOut || !m.court || !m.scheduledAt || !localDay(m.scheduledAt)) return false;
      var key = text(m.id) || [m.scheduledAt, m.court, m.p1, m.p2].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(function (m) {
      return {
        id: text(m.id), day: localDay(m.scheduledAt), time: localTime(m.scheduledAt), at: timestamp(m.scheduledAt),
        court: text(m.court), number: matchNumber(m), category: text(m.category || m.categoryName),
        round: m.round == null ? '' : String(m.round),
        p1: displaySide(t, m, 'p1'), p2: displaySide(t, m, 'p2'),
        team1: teamName(t, m, 'p1'), team2: teamName(t, m, 'p2'),
        uids1: m.team1Uids || (m.p1Uid ? [m.p1Uid] : []), uids2: m.team2Uids || (m.p2Uid ? [m.p2Uid] : [])
      };
    }).sort(function (a, b) {
      return a.at - b.at || a.court.localeCompare(b.court, 'pt-BR', { numeric:true }) || (a.number || 0) - (b.number || 0) || a.id.localeCompare(b.id);
    });
    var days = [];
    matches.forEach(function (m) { if (days.indexOf(m.day) < 0) days.push(m.day); });
    return { tournament: text(t.name || t.title || 'Torneio'), matches: matches, days: days };
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
    function box(x, y, w, h) {
      commands.push('0.3 G 0.7 w ' + x + ' ' + (height-y-h) + ' ' + w + ' ' + h + ' re S');
    }
    function write(value, x, y, size, bold, maxChars) {
      var str = latin(value);
      if (maxChars && str.length > maxChars) str = str.slice(0, maxChars - 3) + '...';
      commands.push('0 g BT /F' + (bold ? '2' : '1') + ' ' + (size || 9) + ' Tf 1 0 0 1 ' + x + ' ' + (height-y) + ' Tm ' + pdfString(str) + ' Tj ET');
    }
    return { width:width, height:height, commands:commands, line:line, rect:rect, box:box, write:write };
  }
  function courtPage(model, day, court, matches, part, total) {
    var p = pdfPage(595, 842), x = 32;
    p.write('SÚMULA DE QUADRA', x, 40, 17, true);
    p.write(model.tournament, x, 61, 10, false, 88);
    p.write('Dia ' + dayLabel(day) + '   |   ' + court + (total > 1 ? '   |   Folha ' + part + '/' + total : ''), x, 82, 12, true, 85);
    p.line(x, 92, 563, 92, 0.2);
    var row = Math.min(72, Math.floor(684 / Math.max(1, matches.length)));
    matches.forEach(function (m, i) {
      var top = 104 + i * row;
      if (i % 2 === 0) p.rect(x, top-5, 531, row-2, 0.97);
      p.write('JOGO ' + (m.number || '-') + '  ' + m.time + '  ' + (m.category || '') + (m.round ? '  R' + m.round : ''), x+5, top+7, 8, true, 95);
      p.write(m.team1 || ' ', x+5, top+20, 7, true, 36);
      p.write(m.team2 || ' ', x+302, top+20, 7, true, 36);
      (members(m.p1).length ? members(m.p1) : [m.p1]).slice(0, 2).forEach(function (s, j) { p.write(s, x+5, top+33+j*13, 8, false, 39); });
      (members(m.p2).length ? members(m.p2) : [m.p2]).slice(0, 2).forEach(function (s, j) { p.write(s, x+302, top+33+j*13, 8, false, 39); });
      p.write('SETS', x+240, top+20, 7, true);
      for (var s = 0; s < 3; s++) {
        p.write(String(s+1), x+235+s*21, top+29, 7);
        p.box(x+231+s*21, top+32, 18, 15);
        p.box(x+231+s*21, top+48, 18, 15);
      }
      p.line(x, top+row-3, 563, top+row-3, 0.7);
    });
    p.write('Anotações / ocorrências:', x, 805, 8, true);
    p.line(145, 807, 563, 807);
    p.write('scoreplace.app  |  Gerado da grade publicada', x, 826, 7);
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
  function makePages(model) {
    var pages = [];
    model.days.forEach(function (day) {
      var dayMatches = model.matches.filter(function (m) { return m.day === day; });
      var courts = [];
      dayMatches.forEach(function (m) { if (courts.indexOf(m.court) < 0) courts.push(m.court); });
      courts.sort(function (a, b) { return a.localeCompare(b, 'pt-BR', { numeric:true }); });
      courts.forEach(function (court) {
        var matches = dayMatches.filter(function (m) { return m.court === court; });
        var parts = Math.ceil(matches.length/10);
        for (var i=0;i<parts;i++) pages.push(courtPage(model, day, court, matches.slice(i*10, (i+1)*10), i+1, parts));
      });
      var rows = attendance(model, day), total = Math.max(1, Math.ceil(rows.length/22));
      for (var j=0;j<total;j++) pages.push(attendancePage(model, day, rows.slice(j*22, (j+1)*22), j+1, total));
    });
    return pages;
  }
  function encodePdf(pages) {
    var objects = [null];
    function add(s) { objects.push(s); return objects.length-1; }
    var font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var tree = add('');
    var pageIds = pages.map(function (page) {
      var stream = page.commands.join('\n') + '\n';
      var content = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + 'endstream');
      return add('<< /Type /Page /Parent ' + tree + ' 0 R /MediaBox [0 0 ' + page.width + ' ' + page.height + '] /Resources << /Font << /F1 ' + font + ' 0 R /F2 ' + bold + ' 0 R >> >> /Contents ' + content + ' 0 R >>');
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
  function filename(model) {
    return 'sumula-' + model.tournament.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0,45) + '.pdf';
  }
  function download(id) {
    var t = root._findTournamentById && root._findTournamentById(id);
    if (!t) return;
    var authorized = typeof root._souOrganizador === 'function' ? root._souOrganizador(t)
      : !!(root.AppStore && typeof root.AppStore.isCreator === 'function' && root.AppStore.isCreator(t));
    if (!authorized) return;
    var list = typeof root._collectAllMatches === 'function' ? root._collectAllMatches(t) : (t.matches || []);
    var model = collect(t, list);
    if (!model.matches.length) {
      if (typeof root.showNotification === 'function') root.showNotification('Súmula indisponível', 'Não há jogos com dia, hora e quadra definidos.', 'warning');
      return;
    }
    var bytes = encodePdf(makePages(model));
    var url = URL.createObjectURL(new Blob([bytes], { type:'application/pdf' }));
    var anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename(model); anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  root.ScoreplaceSumula = { collect:collect, attendance:attendance, makePages:makePages, encodePdf:encodePdf, filename:filename };
  root._downloadTournamentSumula = download;
})(typeof window !== 'undefined' ? window : globalThis);
