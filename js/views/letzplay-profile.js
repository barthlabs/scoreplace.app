/* scoreplace.app — letzplay-profile.js
 * Card "Seu nível (letzplay)" no perfil. Lê users/{uid}.letzplayImport (já normalizado)
 * e renderiza: categoria OFICIAL (torneio) + rating recreativo (forma) num medidor
 * fluido FUN→A, footprint oficial×recreativo, duplas, stats. Self-contained (sem deps).
 */
(function () {
  var root = (typeof window !== 'undefined') ? window : this;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // rating (1300..1850 ~ FUN..A) → posição 0..100% no medidor.
  function ratingPct(v) {
    if (v == null) return 35;
    var p = (v - 1300) / (1850 - 1300) * 100;
    return Math.max(3, Math.min(97, p));
  }

  // tile centralizado. valHtml já é HTML (permite cor); x = sublinha.
  function tileH(k, valHtml, x) {
    return '<div style="background:var(--bg-darker,#0f1420);border:1px solid var(--border-color,#28313f);border-radius:9px;padding:9px 11px;text-align:center;">' +
      '<div style="font-size:11px;color:var(--text-muted,#8b93a3);font-weight:600;">' + esc(k) + '</div>' +
      '<div style="font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;margin-top:2px;">' + valHtml + '</div>' +
      (x ? '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:1px;">' + esc(x) + '</div>' : '') + '</div>';
  }
  function tile(k, v, x) { return tileH(k, esc(v), x); }

  /** Retorna o HTML do card "Seu nível (geral)", ou '' se não há import.
   * spExtra (opcional) mistura o scoreplace: { tournaments:[{name,sport,year}],
   * wins, losses } — torneios do scoreplace entram na coluna OFICIAL e as V/D
   * somam no Total. */
  root._renderLetzplayCard = function (imp, spExtra) {
    if (!imp || typeof imp !== 'object') return '';
    spExtra = spExtra || {};
    var spT = Array.isArray(spExtra.tournaments) ? spExtra.tournaments : [];
    var spW = spExtra.wins || 0, spL = spExtra.losses || 0;
    var off = imp.officialCategory || null;
    var r = imp.rating || {};
    var st = imp.stats || {};
    var pct = ratingPct(r.value);

    // medidor: gradiente verde-no-centro (do rating) → vermelho nas pontas.
    var gStops = 'linear-gradient(90deg,#dc2626 0%,#ef7a2b ' + Math.max(6, pct - 22) + '%,#eab308 ' +
      Math.max(10, pct - 12) + '%,#16a34a ' + Math.max(14, pct - 5) + '%,#16a34a ' +
      Math.min(88, pct + 5) + '%,#eab308 ' + Math.min(92, pct + 14) + '%,#ef7a2b ' +
      Math.min(97, pct + 26) + '%,#dc2626 100%)';

    var offHtml = off
      ? '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;background:rgba(16,185,129,0.16);color:#2dd4a0;padding:2px 9px;border-radius:6px;">' + esc(off.categoryRaw) + '</span>'
      : '<span style="color:var(--text-muted,#8b93a3);">—</span>';

    // ── Data de conclusão (mês/ano) + ordenação cronológica ──────────────
    // Letzplay: último jogo da competição (imp.games). Scoreplace: end/startDate
    // do torneio. Datas letzplay vêm "Sábado, 20/06/26" (dia-da-semana antes) —
    // extrai dd/mm/aa em QUALQUER posição (âncora ^…$ falhava e sumia a data).
    var _MON = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    function _ts(raw) {
      if (typeof raw === 'number') return raw;                        // já é timestamp
      var s = String(raw || '').trim(); if (!s) return 0;
      // dd/mm/aa (Brasil) tem PRIORIDADE — Date.parse assume mm/dd (US) e inverte.
      var m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
      if (m) { var y = +m[3]; if (y < 100) y += 2000; var t = new Date(y, (+m[2]) - 1, +m[1]).getTime(); if (!isNaN(t)) return t; }
      var n = Date.parse(s); if (!isNaN(n)) return n;                 // ISO (scoreplace) / nativo
      return 0;
    }
    function monYr(raw) { var t = _ts(raw); if (!t) return null; var d = new Date(t); return _MON[d.getMonth()] + '/' + d.getFullYear(); }
    function prettyClub(slug) {
      if (!slug) return '';
      return String(slug).split(/[-_]/).map(function (w) { return w.length <= 3 ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1)); }).join(' ');
    }
    var _games = Array.isArray(imp.games) ? imp.games : [];
    function concluded(f, official) {                                 // {when, ts} do último jogo da competição
      var best = 0;
      for (var i = 0; i < _games.length; i++) {
        var g = _games[i];
        if (g.official !== official) continue;
        if (g.competition !== f.categoryRaw) continue;
        if (f.year != null && g.year != null && g.year !== f.year) continue;
        if (f.club && g.club && g.club !== f.club) continue;
        var t = _ts(g.date); if (t > best) best = t;
      }
      if (best) return { when: monYr(best), ts: best };
      return { when: (f.year ? String(f.year) : null), ts: (f.year ? new Date(f.year, 11, 31).getTime() : 0) };
    }
    // label letzplay: clube (quando houver) + categoria. Scoreplace: nome do torneio.
    function lpLabel(f) { var c = prettyClub(f.club); return c ? (c + ' · ' + f.categoryRaw) : f.categoryRaw; }

    // OFICIAL = torneios letzplay (🎾) + torneios scoreplace (🏆). RANKING = rankings letzplay.
    var footOff = (imp.footprint || []).filter(function (f) { return f.official; })
      .map(function (f) { var c = concluded(f, true); return { label: lpLabel(f), when: c.when, ts: c.ts, pos: f.position, src: '🎾' }; });
    spT.forEach(function (s) { var t = _ts(s.date); footOff.push({ label: s.name, when: monYr(s.date) || (s.year ? String(s.year) : null), ts: t || (s.year ? new Date(s.year, 11, 31).getTime() : 0), pos: null, src: '🏆' }); });
    var footRec = (imp.footprint || []).filter(function (f) { return !f.official; })
      .map(function (f) { var c = concluded(f, false); return { label: lpLabel(f), when: c.when, ts: c.ts, pos: f.position, src: '🎾' }; });
    footOff.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });  // mais recente no topo
    footRec.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
    function footList(arr) {
      return arr.map(function (f) {
        var wh = f.when ? (' · ' + f.when) : '';
        var pos = (f.pos != null) ? (' · ' + f.pos + 'º') : '';
        return '<div style="font-size:12px;color:var(--text-muted,#8b93a3);padding:3px 0;">' + (f.src || '•') + ' ' + esc(f.label) + wh + pos + '</div>';
      }).join('') || '<div style="font-size:12px;color:var(--text-muted,#8b93a3);">—</div>';
    }

    var pairsHtml = (st.pairs || []).slice(0, 6).map(function (p) {
      var strong = (p.wins > p.losses);
      return '<div style="display:flex;justify-content:space-between;gap:10px;padding:4px 0;font-size:12.5px;">' +
        '<span>com <b>' + esc(p.partner) + '</b></span>' +
        '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:' + (strong ? '#2dd4a0' : 'var(--text-muted,#8b93a3)') + ';">' + p.wins + '–' + p.losses + '</span></div>';
    }).join('');

    var totW = (st.wins != null) ? st.wins : (imp.profile && imp.profile.totals ? imp.profile.totals.wins : '');
    var totL = (st.losses != null) ? st.losses : (imp.profile && imp.profile.totals ? imp.profile.totals.losses : '');
    // soma scoreplace (V/D) ao total do letzplay
    var totWn = ((typeof totW === 'number') ? totW : (parseInt(totW, 10) || 0)) + spW;
    var totLn = ((typeof totL === 'number') ? totL : (parseInt(totL, 10) || 0)) + spL;
    var _gTot = totWn + totLn;
    var winPct = _gTot ? Math.round(totWn / _gTot * 100) : 0;
    // Total: verde nas vitórias (V), vermelho nas derrotas (D).
    var totalHtml = '<span style="color:#2dd4a0;">' + totWn + ' V</span>' +
      '<span style="color:var(--text-muted,#8b93a3);"> – </span>' +
      '<span style="color:#f87171;">' + totLn + ' D</span>';

    // Sequência atual: derivada dos jogos letzplay (com data), do mais recente
    // pra trás — conta a fila de resultados iguais no topo.
    var _sg = _games.filter(function (g) { return typeof g.won === 'boolean'; })
      .map(function (g, i) { return { ts: _ts(g.date) || (1e12 - i), won: g.won }; })
      .sort(function (a, b) { return b.ts - a.ts; });
    var _stN = 0, _stT = null;
    for (var _si = 0; _si < _sg.length; _si++) {
      if (_si === 0) { _stT = _sg[0].won; _stN = 1; }
      else if (_sg[_si].won === _stT) _stN++;
      else break;
    }
    var streakHtml = _stN
      ? '<span style="color:' + (_stT ? '#2dd4a0' : '#f87171') + ';">' + _stN + (_stT ? 'V' : 'D') + '</span>'
      : '<span style="color:var(--text-muted,#8b93a3);">—</span>';

    return '' +
      '<div style="background:var(--bg-card,#141a24);border:1px solid var(--border-color,#28313f);border-radius:14px;padding:15px 16px;margin:12px 0;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:3px;">🎾 Seu nível (geral)</div>' +
        '<div style="font-size:10.5px;color:var(--text-muted,#8b93a3);margin-bottom:11px;">letzplay @' + esc(imp.handle) + ' + scoreplace</div>' +

        // Oficial vs forma
        '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:baseline;margin-bottom:4px;">' +
          '<div><span style="font-size:11px;color:var(--text-muted,#8b93a3);">categoria oficial</span><br>' + offHtml + '</div>' +
          '<div><span style="font-size:11px;color:var(--text-muted,#8b93a3);">forma</span><br>' +
            '<span style="font-family:ui-monospace,Menlo,monospace;font-weight:700;">' + esc(r.band || '—') + '</span>' +
            (r.value ? '<span style="font-size:11px;color:var(--text-muted,#8b93a3);"> · ' + r.value + '</span>' : '') + '</div>' +
        '</div>' +

        // medidor
        '<div style="margin-top:10px;">' +
          '<div style="display:flex;">' + ['FUN', 'D', 'C', 'B', 'A'].map(function (t) {
            return '<span style="flex:1;text-align:center;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;color:var(--text-muted,#8b93a3);">' + t + '</span>';
          }).join('') + '</div>' +
          '<div style="position:relative;height:20px;border-radius:11px;margin-top:5px;background:' + gStops + ';box-shadow:inset 0 1px 4px rgba(0,0,0,.3);">' +
            '<span style="position:absolute;top:50%;left:' + pct.toFixed(1) + '%;transform:translate(-50%,-50%);width:15px;height:15px;border-radius:50%;background:#fff;border:3px solid #0f9d6b;box-shadow:0 0 0 4px rgba(16,157,107,.22);"></span>' +
          '</div>' +
          '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text-muted,#8b93a3);margin-top:7px;"><span>↓ abaixo</span><span style="color:#2dd4a0;font-weight:700;">no seu nível</span><span>acima ↑</span></div>' +
        '</div>' +

        // tiles
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-top:14px;">' +
          tileH('Total', totalHtml, winPct + '% · letzplay + scoreplace') +
          tileH('Sequência', streakHtml, 'atual') +
          tile('Oficiais', footOff.length, 'torneios') +
        '</div>' +

        // footprint
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">' +
          '<div><div style="font-size:11px;font-weight:700;color:#2dd4a0;margin-bottom:3px;">OFICIAL (torneio)</div>' + footList(footOff) + '</div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted,#8b93a3);margin-bottom:3px;">RANKING</div>' + footList(footRec) + '</div>' +
        '</div>' +

        // duplas
        (pairsHtml ? '<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:4px;">Suas duplas</div>' + pairsHtml + '</div>' : '') +

        // privacidade — dados públicos do letzplay, trazidos com autorização
        '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:12px;border-top:1px solid var(--border-color,#28313f);padding-top:9px;">' +
          'Histórico público do letzplay (nomes e placares), importado com sua autorização' +
          (imp.importedAt ? ' em ' + esc(String(imp.importedAt).slice(0, 10)) : '') + '.' +
        '</div>' +
      '</div>';
  };
})();
