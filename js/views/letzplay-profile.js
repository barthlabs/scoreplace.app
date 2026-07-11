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

  function tile(k, v, x) {
    return '<div style="background:var(--bg-darker,#0f1420);border:1px solid var(--border-color,#28313f);border-radius:9px;padding:9px 11px;">' +
      '<div style="font-size:11px;color:var(--text-muted,#8b93a3);font-weight:600;">' + esc(k) + '</div>' +
      '<div style="font-family:ui-monospace,Menlo,monospace;font-size:18px;font-weight:700;margin-top:2px;">' + esc(v) + '</div>' +
      (x ? '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:1px;">' + esc(x) + '</div>' : '') + '</div>';
  }

  /** Retorna o HTML do card, ou '' se não há import. */
  root._renderLetzplayCard = function (imp) {
    if (!imp || typeof imp !== 'object') return '';
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

    var footOff = (imp.footprint || []).filter(function (f) { return f.official; });
    var footRec = (imp.footprint || []).filter(function (f) { return !f.official; });
    function footList(arr) {
      return arr.map(function (f) {
        var yr = f.year ? (' · ' + f.year) : '';
        var pos = (f.position != null) ? (' · ' + f.position + 'º') : '';
        return '<div style="font-size:12px;color:var(--text-muted,#8b93a3);padding:3px 0;">• ' + esc(f.categoryRaw) + yr + pos + '</div>';
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
    var streak = st.currentStreak ? (st.currentStreak.count + (st.currentStreak.type === 'W' ? 'V' : 'D')) : '—';

    return '' +
      '<div style="background:var(--bg-card,#141a24);border:1px solid var(--border-color,#28313f);border-radius:14px;padding:15px 16px;margin:12px 0;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:.7px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:11px;">🎾 Seu nível (letzplay · @' + esc(imp.handle) + ')</div>' +

        // Oficial vs forma
        '<div style="display:flex;flex-wrap:wrap;gap:16px;align-items:baseline;margin-bottom:4px;">' +
          '<div><span style="font-size:11px;color:var(--text-muted,#8b93a3);">categoria oficial</span><br>' + offHtml + '</div>' +
          '<div><span style="font-size:11px;color:var(--text-muted,#8b93a3);">forma (recreativo)</span><br>' +
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
          tile('Total', totW + '–' + totL, imp.profile && imp.profile.memberSince ? ('desde ' + imp.profile.memberSince) : '') +
          tile('Sequência', streak, 'atual') +
          tile('Oficiais', (st.official && st.official.games != null) ? st.official.games : footOff.length, 'torneios') +
        '</div>' +

        // footprint
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px;">' +
          '<div><div style="font-size:11px;font-weight:700;color:#2dd4a0;margin-bottom:3px;">OFICIAL (torneio)</div>' + footList(footOff) + '</div>' +
          '<div><div style="font-size:11px;font-weight:700;color:var(--text-muted,#8b93a3);margin-bottom:3px;">RECREATIVO (ranking)</div>' + footList(footRec) + '</div>' +
        '</div>' +

        // duplas
        (pairsHtml ? '<div style="margin-top:14px;"><div style="font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--text-muted,#8b93a3);margin-bottom:4px;">Suas duplas</div>' + pairsHtml + '</div>' : '') +

        // privacidade
        '<div style="font-size:11px;color:var(--text-muted,#8b93a3);margin-top:12px;border-top:1px solid var(--border-color,#28313f);padding-top:9px;">' +
          esc((imp.observations || []).length) + ' registros de adversários guardados (ocultos até cada um entrar no scoreplace). Importado' +
          (imp.importedAt ? ' em ' + esc(String(imp.importedAt).slice(0, 10)) : '') + '.' +
        '</div>' +
      '</div>';
  };
})();
