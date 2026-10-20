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
    var matches = (allMatches || []).filter(function (m) {
      if (!m || m.isBye || m.isSitOut || !m.scheduledAt || !localDay(m.scheduledAt)) return false;
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
    return { tournament: text(t.name || t.title || 'Torneio'), matches: matches, days: days,
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
    function logo(x, y, w, h) {
      commands.push('q ' + w + ' 0 0 ' + h + ' ' + x + ' ' + (height-y-h) + ' cm /OfficialLogo Do Q');
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
  // Rasterização integral de icons/logo-podium.svg, o mesmo arquivo usado na
  // interface. Gerar novamente com scripts/generate-sumula-logo.py se mudar.
  // BEGIN OFFICIAL PDF LOGO
  var officialLogoWidth = 320, officialLogoHeight = 240;
  var officialLogoSourceSha256 = 'd2b415a6ddd9eb94c4e5f5fa73741180fa5c9fbb475a6b24fd801e0739ff3d70';
  var officialLogoRgbZ =
    'eNrt3d9v1WcdwPF7KMnSmKXRSXTuFOivA5TSnh/GxIgDitEyoYCJNo1Dpy1lLWBSEmhRk0VapSoDJt34ES924QBxIkQvhskY20hM' +
    '2Q+YCZuXYrLBFjOIN36TY5ouAUP5dhnP93kl73/gec73lefzfM8pVD/YVq2M1ta6qHXpIvsghdhPuh5Msg9SiP3tZ9UTu6vtgxTi' +
    '8Pzvp2cnGaGlEIfnil8jtBTi8Fzxa4SWAh2ejdBSuMOzEVoKd3g2QktBD89GaCnc4dkILYU7PBuhpaCHZyO0FO7wbISWwh2ejdBS' +
    '0MOzEVoKd3g2QkvhDs9GaCno4dkILYU7PBuhpXCHZyO0FPTwbISWwh2ejdBSuMOzEVqawR79+rx3n6q6c3r3Ttd+U9X7zVqfoCLv' +
    'S6X8W7+4Lyy8V8buW/bFRp+dlJRrWPKXnfeHgveFXZ+a39TsU5Mmu/8LrSPf/dy9j/epnrk1uVaflxTWddiFVwr0OuzCKwV6HXbh' +
    'lQK9DrvwSiFeh114pUCvwy68UqDXYRdeKdDrsAuvFOJ12IVXCvQ67MIrBXodduGVAr0Ou/BKd1jjosUDnbk/bq+5uLv6XwfmhPiX' +
    'v1NLlpAsJFlOsqiGhU5wZba6fHNy0r0/XhW62dv1wfjsZ7d+Or94sc9aGWv9irqr+zMrd2pX98/pXF7nE1dm2rruoeRsigHv5EG8' +
    'pTPnc1c2Tt6o8E4Sdgor9OrzzZGMzbccpBfkvdFSwD3T90CceCsd7P2sZ0DhflWU4bfNd1Ky/HpHsMJsS2cuZryVHl/rB9UKsucH' +
    'a/g9OVjjSVCIvT7ySf0zdLPuHb8X/V8tCrNo3zx/9C10lSdBIQZvJU+C+OVXyqjfWfxKzl9+JX75Fb/8Sln0O4tfyfnLr8Qvv+KX' +
    'XymLfmfxKzl/+ZX45Vf88ivxy6/EL78Sv/yKX34lfvmV+OVX/PIr8cuvxC+/Er/8il9+JX75lfjlV/zyK/HLr8QvvxK//IpffiV+' +
    '+ZX45Vcil1/xy6/EL78Sv/yKX34lfvmV+OVX4pdf8cuvxC+/Er/8il9+JX75lfjlV+KXX/HLr8QvvxK//IpfeRLEL78Sv/xK/PIr' +
    'fvmV+OVX4pdfiV9+xS+/Er/8SvzyK375lfjlV+KXX4lffsUvv/qYmt/a3t03tO/o74+dOffXC2+98vo/gi5ZQrKQZDldm3bOW7qK' +
    'X36zWq5l5fDo+PmLb4du9na9/No7oweeXVD4Gr/8ZqxVG3rPXricVblTO/vqpfb1Pfzym5m6N+9KzqYY8E4exN19w/zym42TNyq8' +
    'k4Rn5BQml99PsNqW9kjG5lsO0rmWFfzyG24/HTsUJ95Ku37+DL/8hvtVUYbfNt9JyfKTCYRffoN8bdU3HDPeSl29O/jlN8T2HTnB' +
    '797Dx/nlN8RO/Pk8v8fOnOOX3xCL9s3zR95CX7jML78hBm8lfvnll19+xS+//Ipffvnll19++eWXX37FL7/8il9++eWXX3L55Zdf' +
    'fsUvv/zyyy+//PLLL7/il19+xS+//PLLL7/88ssvv+KXX3755Zdffvnll1/xyy+/4pdffvnll19++eWXX/HLL78il19++eVXNPHL' +
    'L7/il98M+G3Kt23tKJ4ZKL05XLo+Wv7PL8MuWUKykGQ5WzoKjfkCv/xm1W99Y9vTG4s3xoI3e7tujpV/11vKLyzwy2/G/H5rWfHa' +
    'aGblTu29kfKGZQV++c2M3x89Urw5FgXeyYN42+oiv/xmwG9y8kaFd5LwXZ/C5PJ7j/htaCpEMjbfcpCua+KX34D9Hv1eMU68lQ5t' +
    'LPLLb6B+m/JtN8bKMftNlp9MIPzyG6LfbaujPnwrDXQU+eU3RL+n+0v8nuov88tviH7/vqvM75vDJX75DdFvtG+ep5ZsAr/8hugX' +
    '3kr88ssvv/zyyy+//PLLL7/88ssvv/zyyy+//PLLL7/88ssvv/zyyy+//PLLL7/88ssvv/zyyy+//PLLL7/88ssvv/zyyy+/5PLL' +
    'L7/8il9++eWXX3755Zdffvnll19++eWXX3755Zdffvnll19++eWXX37J5Zdffvnll19++eWXX3755Zdffvnll19++eWXX3755Zdf' +
    'fvnll1/xyy+//PLLL7/88ssvv/zyyy+//PLLL7/88ssvv/zyyy+//PLLL7n88ssvv+KXX3755Zdffvnll19++eWXX3755Zdffvnl' +
    'l19++eWXX3755Zdffvnll19++eWXX3755ZdffvnNqt+zFy7D+8Irl9I8e1f3V8H7z31z0uzhtVF4y++OTNvvsTPn+H3u9Itpnr2J' +
    '3dX8JpuQZg8vDZf4fWOoNN1923fkBL97Dx9P8+w9P1jD78nBmjR7eLqf3/Kp/mmfv12bdvL7nZ4daZ69gc4cv31ratPs4ZaOAr/9' +
    '3yhOd9/mLV11/uLbMeN9aeJKbUt7mmevYWHz++NRX4GvH6yqzzen2cPGfOHGWNR4P9xTbmgq3MXW/XjPoZj9Do2Op3nwKo1veiBm' +
    'vwd65qbfw8MbizH7HX+0eHf7lmtZefbVS9G+eX5oyfL0z15dvvnq/jnRvnme39Scfg/rG9veG4n3zfOCxrvfuofXfD/CKfrl195Z' +
    'ue6H6R+8So8sq49wiv5gfHbn8rqZ2sM1X45xir45Vl7/lULKrevuG06e56jwdvcNzdSD97+XMJ255HmOCu9AZ25m93Db6uLNsbjw' +
    'bu0ozsjWta/viWSQTsbmFZ0/mNkHr1JyGEUySCdj89qH6z6OPdywrBDJIJ2MzetSn7xT+/yir25/Yv9LE1cyfOw+8eujM3Lnve37' +
    'hIYlv3ps7vWDVRk+do9u/syM3HlvV21925PdxQ/3ZPnY/e1jpTR33v+3ey3tXb07njxy4rnTL2bgB5bJEpKF7D18/Nu9O1N+VTSN' +
    'tzH55sfX1v5he83E7uoM/MAyWUKykJODNZvX1qb8qmgaX8w1FQY6in/qL70xVMrADyyTJSQLOdVf7u8oTverov8C0gQU7w==';
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
  function writeSide(p, team, names, x, top, width, portrait, right) {
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
      var y = top + (portrait ? 21 + 19*i : compact ? 15 + 14*i : 17 + 13*i);
      sideWrite(p, lines[0], x, y, width, size, true, right);
      if (lines[1]) sideWrite(p, lines[1], x, y + (portrait ? 8 : 7), width,
        Math.min(size, portrait ? 7.8 : 7.3), true, right);
    });
  }
  // Uma página por categoria e dia, no máximo 12 jogos. A quadra é escrita na chamada.
  function scorePage(model, day, category, matches, part, total, orientation) {
    var portrait = orientation === 'portrait';
    var p = portrait ? pdfPage(595, 842) : pdfPage(842, 595);
    var left = portrait ? 18 : 20, right = p.width - left;
    var divider = portrait ? 397 : 559, top = 86, bodyTop = 105;
    var rowHeight = portrait ? 54 : 38;
    var slots = model.scoring && model.scoring.slots || 1;
    var gamesPerSet = model.scoring && model.scoring.gamesPerSet || 6;
    var gameLabel = slots === 1 ? '1 set de ' + gamesPerSet + ' games' : 'melhor de ' + slots + ' sets';
    p.fillRect(0, 0, p.width, 69, '0.071 0.133 0.220');
    p.write(model.tournament + '  |  ' + category, left, 25, portrait ? 11 : 13, true,
      portrait ? 56 : 83, '1 1 1');
    p.write(dayLabel(day) + '  |  ' + gameLabel + '  |  Página ' + part + '/' + total,
      left, 42, 8, false, 85, '1 1 1');
    p.write('Anote a quadra usada. Após lançar o resultado, cada atleta assina uma vez nesta página.',
      left, 56, portrait ? 6.8 : 8, false, portrait ? 90 : 118, '1 1 1');
    p.logo(right - 46, 9, 44, 33);
    p.line(divider, 79, divider, bodyTop + 12*rowHeight, 0.55);
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
      p.line(courtX+7, y+rowHeight-10, namesX-10, y+rowHeight-10, 0.55);
      writeSide(p, m.team1, m.p1, namesX, y, sideWidth, portrait, false);
      writeSide(p, m.team2, m.p2, secondX, y, sideWidth, portrait, true);
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
    var step = Math.min(24, (12*rowHeight-14) / Math.max(1, people.length));
    people.forEach(function (name, i) {
      var y = bodyTop + 11 + i*step;
      var limit = portrait ? 22 : 29;
      var labels = step < 16 ? [name] : splitLabel(name, limit);
      p.write(labels[0], divider+12, y, portrait ? 6.3 : (step < 12 ? 6.3 : 7), false, limit);
      if (labels[1]) p.write(labels[1], divider+12, y+7, portrait ? 6 : 6.4, false, limit);
      p.line(divider + (portrait ? 106 : 141), y+3, right-3, y+3, 0.45);
    });
    p.write('scoreplace.app  |  Súmula da grade atual; a quadra prevista pode mudar.', left, p.height-24, 7);
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
  function makePages(model, options) {
    options = options || {};
    var orientation = options.orientation === 'portrait' ? 'portrait' : 'landscape';
    var pages = [];
    var categories = Array.from(new Set(model.matches.map(function (m) {
      return m.category || 'Sem categoria';
    })));
    categories.forEach(function (category) {
      var chunks = [];
      model.days.forEach(function (day) {
        var matches = model.matches.filter(function (m) {
          return m.day === day && (m.category || 'Sem categoria') === category;
        });
        for (var i=0;i<matches.length;i+=12) chunks.push({ day:day, matches:matches.slice(i,i+12) });
      });
      chunks.forEach(function (chunk, index) {
        pages.push(scorePage(model, chunk.day, category, chunk.matches, index+1, chunks.length, orientation));
      });
    });
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
    var rgb = binaryFromBase64(officialLogoRgbZ);
    var officialLogo = add('<< /Type /XObject /Subtype /Image /Width ' + officialLogoWidth +
      ' /Height ' + officialLogoHeight + ' /ColorSpace /DeviceRGB /BitsPerComponent 8' +
      ' /Filter /FlateDecode /Length ' + rgb.length + ' >>\nstream\n' + rgb + '\nendstream');
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
    var authorized = typeof root._souOrganizador === 'function' ? root._souOrganizador(t)
      : !!(root.AppStore && typeof root.AppStore.isCreator === 'function' && root.AppStore.isCreator(t));
    if (!authorized) return;
    var list = typeof root._collectAllMatches === 'function' ? root._collectAllMatches(t) : (t.matches || []);
    var model = collect(t, list);
    if (!model.matches.length) {
      if (typeof root.showNotification === 'function') root.showNotification('Súmula indisponível', 'Não há jogos com dia e hora definidos.', 'warning');
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
  root.ScoreplaceSumula = { collect:collect, attendance:attendance, makePages:makePages, makeAttendancePages:makeAttendancePages, encodePdf:encodePdf, filename:filename, zipFiles:zipFiles };
  root._downloadTournamentSumula = download;
})(typeof window !== 'undefined' ? window : globalThis);
