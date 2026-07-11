/* scoreplace.app — match-history.js
 * HISTÓRICO DE JOGOS unificado e cronológico (mais recente no topo).
 * Une duas fontes numa lista só, com badge de origem e filtros:
 *   • 🎾 LetzPlay  — jogos importados (cu.letzplayImport.games, schema v2)
 *   • 🏆 Scoreplace — jogos do próprio app (matchHistory + casuais locais + torneios)
 *
 * Objetivo: uma vez importado o histórico do letzplay, ele VIVE aqui — o usuário
 * pode parar de jogar no letzplay e não perde nada. Filtra por fonte, local,
 * torneio/competição e modalidade. Page-route #historico (padrão centralizado).
 */
(function () {
  var DAY = 86400000;

  function _esc(s) {
    return (typeof window._safeHtml === 'function')
      ? window._safeHtml(s == null ? '' : String(s))
      : String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
          return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
        });
  }

  // 'paineiras-bt' -> 'Paineiras BT'. Slug de clube do letzplay vira rótulo legível.
  function _prettyClub(slug) {
    if (!slug) return '';
    return String(slug).split(/[-_]/).map(function (w) {
      if (!w) return '';
      return (w.length <= 3) ? w.toUpperCase() : (w.charAt(0).toUpperCase() + w.slice(1));
    }).join(' ').trim();
  }

  var _PT_MON = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

  // Melhor esforço pra transformar a data crua do letzplay em timestamp. Se falhar,
  // usa a ordem de import (idx; letzplay entrega mais recente primeiro) ancorada em
  // importedAt — jogos importados ficam ANTES da data de import (aconteceram antes).
  function _lpDateToTs(dateStr, importedAtTs, idx) {
    var fallback = (importedAtTs || Date.now()) - (idx + 1) * DAY;
    if (!dateStr) return fallback;
    var s = String(dateStr).trim();
    // ISO / formatos que o engine entende direto
    var n = Date.parse(s);
    if (!isNaN(n)) return n;
    // dd/mm/yyyy
    var m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      var t = new Date(y, (+m[2]) - 1, +m[1]).getTime();
      if (!isNaN(t)) return t;
    }
    // "12 de jul. de 2026" / "12 jul 2026"
    var m2 = s.toLowerCase().match(/(\d{1,2}).*?\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*.*?(\d{4})/);
    if (m2 && _PT_MON[m2[2]] != null) {
      var t2 = new Date(+m2[3], _PT_MON[m2[2]], +m2[1]).getTime();
      if (!isNaN(t2)) return t2;
    }
    return fallback;
  }

  function _dateLabel(ts) {
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  // ── Fonte 1: LetzPlay (games do import) ──────────────────────────────────────
  function _fromLetzplay(cu) {
    var imp = cu && cu.letzplayImport;
    var games = imp && Array.isArray(imp.games) ? imp.games : [];
    if (!games.length) return [];
    var importedAtTs = imp.importedAt ? (Date.parse(imp.importedAt) || null) : null;
    return games.map(function (g, i) {
      var ts = _lpDateToTs(g.date, importedAtTs, (g.idx != null ? g.idx : i));
      var opp = (g.oppNames && g.oppNames.length ? g.oppNames : g.oppHandles || []).join(' / ');
      var partner = g.partnerName || g.partnerHandle || null;
      var score = (typeof g.myScore === 'number' && typeof g.oppScore === 'number')
        ? (g.myScore + '–' + g.oppScore) : '';
      var venue = _prettyClub(g.club);
      var comp = (g.official ? 'Torneio' : 'Ranking') + (g.competition ? ' · ' + g.competition : '');
      return {
        ts: ts,
        source: 'letzplay',
        sport: g.sport || 'Beach Tennis',
        official: g.official === true,
        venue: venue,
        competition: g.competition || (g.official ? 'Torneio' : 'Ranking'),
        competitionLabel: comp,
        opponent: opp || '—',
        partner: partner,
        result: (g.won === true) ? 'V' : (g.won === false ? 'D' : '?'),
        score: score
      };
    });
  }

  // ── Fonte 2: Scoreplace (matchHistory + casuais locais + torneios) ───────────
  function _resolveVenueForTournament(tournamentId) {
    if (!tournamentId) return '';
    var ts = (window.AppStore && window.AppStore.tournaments) || [];
    for (var i = 0; i < ts.length; i++) {
      if (String(ts[i].id) === String(tournamentId)) return ts[i].venue || '';
    }
    return '';
  }

  function _scoreplaceRecordToItem(r, myUid) {
    if (!r || !Array.isArray(r.players)) return null;
    var mySlot = null;
    for (var i = 0; i < r.players.length; i++) {
      if (r.players[i] && r.players[i].uid === myUid) { mySlot = r.players[i]; break; }
    }
    if (!mySlot) return null;
    var myTeam = mySlot.team;
    var opp = [], partner = [];
    r.players.forEach(function (p) {
      if (!p) return;
      if (p.team === myTeam) { if (p.uid !== myUid) partner.push(p.name || ''); }
      else opp.push(p.name || '');
    });
    var w = r.winnerTeam;
    var result = (w === 0 || w == null) ? '?' : (w === myTeam ? 'V' : 'D');
    if (w === 0) result = 'E';
    var ts = r.finishedAt ? (Date.parse(r.finishedAt) || 0) : 0;
    var isCasual = r.matchType === 'casual';
    var comp = isCasual ? 'Partida casual' : (r.tournamentName || 'Torneio');
    return {
      ts: ts,
      source: 'scoreplace',
      sport: r.sport || '',
      official: !isCasual,
      venue: isCasual ? '' : _resolveVenueForTournament(r.tournamentId),
      competition: comp,
      competitionLabel: comp,
      opponent: opp.filter(Boolean).join(' / ') || '—',
      partner: partner.filter(Boolean).join(' / ') || null,
      result: result,
      score: r.scoreSummary || ''
    };
  }

  async function _fromScoreplace(cu) {
    var uid = cu && cu.uid;
    if (!uid) return [];
    var records = [];
    // matchHistory persistente (torneios + casuais gravados no Firestore)
    if (window.FirestoreDB && typeof window.FirestoreDB.loadUserMatchHistory === 'function') {
      try { records = await window.FirestoreDB.loadUserMatchHistory(uid) || []; } catch (e) { records = []; }
    }
    // casuais locais (podem não ter subido ao Firestore) — dedup por matchId
    try {
      var v2 = JSON.parse(localStorage.getItem('scoreplace_casual_history_v2') || '[]');
      if (Array.isArray(v2)) {
        var seen = {};
        records.forEach(function (r) { if (r && r.matchId) seen[r.matchId] = 1; });
        v2.forEach(function (r) { if (r && (!r.matchId || !seen[r.matchId])) records.push(r); });
      }
    } catch (e) {}
    var out = [];
    records.forEach(function (r) {
      var it = _scoreplaceRecordToItem(r, uid);
      if (it) out.push(it);
    });
    return out;
  }

  function _resultPill(result) {
    var map = {
      'V': { t: 'Vitória', bg: 'rgba(16,185,129,0.16)', bd: 'rgba(16,185,129,0.5)', c: '#10b981' },
      'D': { t: 'Derrota', bg: 'rgba(239,68,68,0.14)', bd: 'rgba(239,68,68,0.45)', c: '#ef4444' },
      'E': { t: 'Empate', bg: 'rgba(148,163,184,0.16)', bd: 'rgba(148,163,184,0.45)', c: '#94a3b8' },
      '?': { t: '—', bg: 'rgba(148,163,184,0.10)', bd: 'rgba(148,163,184,0.3)', c: '#94a3b8' }
    };
    var s = map[result] || map['?'];
    return '<span style="display:inline-block;font-size:0.66rem;font-weight:800;padding:1px 7px;border-radius:999px;background:' + s.bg + ';border:1px solid ' + s.bd + ';color:' + s.c + ';">' + s.t + '</span>';
  }

  function _sourceBadge(source) {
    if (source === 'letzplay') {
      return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:999px;background:rgba(132,204,22,0.16);border:1px solid rgba(132,204,22,0.5);color:#84cc16;">🎾 LetzPlay</span>';
    }
    return '<span style="display:inline-flex;align-items:center;gap:3px;font-size:0.62rem;font-weight:800;padding:1px 7px;border-radius:999px;background:rgba(99,102,241,0.16);border:1px solid rgba(99,102,241,0.5);color:#818cf8;">🏆 Scoreplace</span>';
  }

  function _gameCard(it) {
    var vs = it.partner
      ? ('Você / ' + _esc(it.partner) + ' <span style="opacity:0.6;">vs</span> ' + _esc(it.opponent))
      : ('Você <span style="opacity:0.6;">vs</span> ' + _esc(it.opponent));
    var meta = [];
    if (it.competitionLabel) meta.push(_esc(it.competitionLabel));
    if (it.venue) meta.push('📍 ' + _esc(it.venue));
    if (it.sport) meta.push(_esc(it.sport));
    return '' +
      '<div style="background:var(--bg-card,#1e2235);border:1px solid var(--border-color,rgba(255,255,255,0.08));border-radius:12px;padding:10px 12px;margin-bottom:8px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px;">' +
          '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' + _sourceBadge(it.source) + _resultPill(it.result) + '</div>' +
          '<div style="font-size:0.68rem;color:var(--text-muted,#94a3b8);white-space:nowrap;">' + _esc(_dateLabel(it.ts)) + '</div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
          '<div style="font-size:0.85rem;color:var(--text-bright,#fff);font-weight:600;line-height:1.3;">' + vs + '</div>' +
          (it.score ? '<div style="font-size:0.95rem;font-weight:800;color:var(--text-bright,#fff);white-space:nowrap;">' + _esc(it.score) + '</div>' : '') +
        '</div>' +
        (meta.length ? '<div style="font-size:0.7rem;color:var(--text-muted,#94a3b8);margin-top:4px;">' + meta.join(' · ') + '</div>' : '') +
      '</div>';
  }

  // Estado de filtros (vive no módulo enquanto a página está aberta).
  var _all = [];
  var _filters = { source: 'all', sport: '', venue: '', comp: '' };

  function _applyFilters() {
    return _all.filter(function (it) {
      if (_filters.source !== 'all' && it.source !== _filters.source) return false;
      if (_filters.sport && it.sport !== _filters.sport) return false;
      if (_filters.venue && it.venue !== _filters.venue) return false;
      if (_filters.comp && it.competition !== _filters.comp) return false;
      return true;
    });
  }

  function _renderList() {
    var host = document.getElementById('hist-list');
    if (!host) return;
    var rows = _applyFilters();
    var countEl = document.getElementById('hist-count');
    if (countEl) countEl.textContent = rows.length + (rows.length === 1 ? ' jogo' : ' jogos');
    if (!rows.length) {
      host.innerHTML = '<div style="text-align:center;padding:40px 16px;color:var(--text-muted,#94a3b8);font-size:0.85rem;">Nenhum jogo com esses filtros.</div>';
      return;
    }
    host.innerHTML = rows.map(_gameCard).join('');
  }

  window._histSetFilter = function (key, val) {
    _filters[key] = val;
    // pills de fonte: refletir ativo
    if (key === 'source') {
      ['all', 'letzplay', 'scoreplace'].forEach(function (s) {
        var b = document.getElementById('hist-src-' + s);
        if (b) b.setAttribute('data-active', s === val ? '1' : '0');
      });
    }
    _renderList();
  };

  function _uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    out.sort();
    return out;
  }

  function _srcPill(id, label, val, active) {
    return '<button id="hist-src-' + id + '" data-active="' + (active ? '1' : '0') + '" onclick="window._histSetFilter(\'source\',\'' + val + '\')" ' +
      'style="border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-darker,#171a2b);color:var(--text-main,#cbd5e1);border-radius:999px;padding:5px 12px;font-size:0.75rem;font-weight:700;cursor:pointer;" ' +
      'onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1">' + label + '</button>';
  }

  function _select(id, filterKey, placeholder, values) {
    if (!values.length) return '';
    var opts = '<option value="">' + placeholder + '</option>' + values.map(function (v) {
      return '<option value="' + _esc(v) + '">' + _esc(v) + '</option>';
    }).join('');
    return '<select onchange="window._histSetFilter(\'' + filterKey + '\', this.value)" ' +
      'style="border:1px solid var(--border-color,rgba(255,255,255,0.15));background:var(--bg-darker,#171a2b);color:var(--text-main,#cbd5e1);border-radius:8px;padding:5px 8px;font-size:0.75rem;max-width:46%;box-sizing:border-box;">' + opts + '</select>';
  }

  window._renderHistoricoPage = async function (container) {
    if (!container) container = document.getElementById('view-container');
    if (!container) return;
    var cu = window.AppStore && window.AppStore.currentUser;

    var hdr = (typeof window._renderBackHeader === 'function')
      ? window._renderBackHeader({ href: '#dashboard', label: 'Voltar', middleHtml: '<span style="font-weight:700;">📜 Histórico de jogos</span>' })
      : '';

    if (!cu || !cu.uid) {
      container.innerHTML = hdr + '<div style="max-width:640px;margin:0 auto;padding:40px 16px;text-align:center;color:var(--text-muted,#94a3b8);">Entre na sua conta pra ver seu histórico de jogos.</div>';
      return;
    }

    // loading
    container.innerHTML = hdr + '<div style="max-width:640px;margin:0 auto;padding:40px 16px;text-align:center;color:var(--text-muted,#94a3b8);">' +
      (typeof window._renderBallLoader === 'function' ? window._renderBallLoader('Carregando seu histórico…') : 'Carregando…') + '</div>';

    var lp = _fromLetzplay(cu);
    var sp = [];
    try { sp = await _fromScoreplace(cu); } catch (e) { sp = []; }

    _all = lp.concat(sp).sort(function (a, b) { return b.ts - a.ts; });
    _filters = { source: 'all', sport: '', venue: '', comp: '' };

    var sports = _uniq(_all.map(function (x) { return x.sport; }));
    var venues = _uniq(_all.map(function (x) { return x.venue; }));
    var comps = _uniq(_all.map(function (x) { return x.competition; }));

    var lpCount = lp.length, spCount = sp.length;

    var filterBar = '' +
      '<div style="position:sticky;top:0;z-index:2;background:var(--bg-dark,#111114);padding:10px 0 8px;">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">' +
          _srcPill('all', 'Todos', 'all', true) +
          _srcPill('letzplay', '🎾 LetzPlay' + (lpCount ? ' (' + lpCount + ')' : ''), 'letzplay', false) +
          _srcPill('scoreplace', '🏆 Scoreplace' + (spCount ? ' (' + spCount + ')' : ''), 'scoreplace', false) +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
          _select('f-sport', 'sport', 'Modalidade', sports) +
          _select('f-venue', 'venue', 'Local', venues) +
          _select('f-comp', 'comp', 'Torneio/Competição', comps) +
        '</div>' +
        '<div id="hist-count" style="font-size:0.72rem;color:var(--text-muted,#94a3b8);margin-top:8px;font-weight:600;"></div>' +
      '</div>';

    var lpHint = (lpCount === 0)
      ? '<div style="background:rgba(132,204,22,0.08);border:1px dashed rgba(132,204,22,0.4);border-radius:10px;padding:12px;margin-bottom:10px;font-size:0.78rem;color:var(--text-muted,#cbd5e1);">' +
          '🎾 Traga também seu histórico do <b>letzplay</b> — depois de importado, ele vive aqui e você pode largar o letzplay.' +
          '<div style="margin-top:8px;"><button onclick="window._spStartImport&&window._spStartImport()" style="background:linear-gradient(135deg,#84cc16,#65a30d);color:#0b1020;font-weight:800;padding:8px 15px;border-radius:10px;border:none;cursor:pointer;font-size:0.8rem;">Importar do letzplay</button></div>' +
        '</div>'
      : '';

    container.innerHTML = hdr +
      '<div style="max-width:640px;margin:0 auto;padding:0 14px 40px;">' +
        filterBar + lpHint +
        '<div id="hist-list" style="margin-top:6px;"></div>' +
      '</div>';

    _renderList();
  };
})();
