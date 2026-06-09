// ── Sharing & Export Functions ──
var _t = window._t || function(k) { return k; };

// v1.8.43-beta: clicar no logo do torneio na tela de detalhe abre o
// editor de crop/zoom/luminosidade. Só disponível para o organizador.
window._editTournamentLogoFromDetail = function(tournamentId) {
  var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tournamentId); });
  if (!t) return;
  // Cria input de arquivo temporário e dispara clique
  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', function() {
    if (!input.files || !input.files[0]) { input.remove(); return; }
    var file = input.files[0];
    input.remove();
    if (file.size > 5 * 1024 * 1024) {
      if (window.showNotification) window.showNotification('Arquivo muito grande', 'Máximo 5 MB.', 'warning');
      return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
      if (typeof window._openImageCropEditor !== 'function') return;
      window._openImageCropEditor(e.target.result,
        { shape: 'square', size: 400, title: '🎨 Editar logo do torneio' },
        function(croppedDataUrl) {
          // Salva no torneio e re-renderiza
          t.logoData = croppedDataUrl;
          t.logoLocked = true;
          t.updatedAt = new Date().toISOString();
          if (window.FirestoreDB && window.FirestoreDB.saveTournament) {
            window.FirestoreDB.saveTournament(t).then(function() {
              if (window.showNotification) window.showNotification('Logo atualizado', '', 'success');
              if (typeof window._softRefreshView === 'function') window._softRefreshView();
            }).catch(function(err) {
              if (window.showNotification) window.showNotification('Erro ao salvar logo', err && err.message, 'error');
            });
          }
        }
      );
    };
    reader.readAsDataURL(file);
  });
  input.click();
};

// Abre a modal de detalhe do venue a partir de um torneio. Compõe o
// venueKey (placeId ou slug de nome) via VenueDB, navega pra
// #venues/<key> — o roteador já sabe abrir a modal via deep link.
// Usado pelo botão "🏢 Local" no header do torneio (v0.15.26).
window._openVenueFromTournament = function(tournamentId) {
    // Busca primeiro em tournaments (scoped); fallback pra publicDiscovery.
    var t = (window.AppStore.tournaments || []).find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t && Array.isArray(window.AppStore.publicDiscovery)) {
        t = window.AppStore.publicDiscovery.find(function(tour) { return String(tour.id) === String(tournamentId); });
    }
    if (!t) return;
    if (!t.venuePlaceId && !t.venue) return;
    var key = (window.VenueDB && typeof window.VenueDB.venueKey === 'function')
        ? window.VenueDB.venueKey(t.venuePlaceId || '', t.venue || '')
        : (t.venuePlaceId || '');
    if (!key) return;
    window.location.hash = '#venues/' + encodeURIComponent(key);
};

// v2.1.83: texto de convite de torneio — NOME + DATA/HORA + LOCAL, em vez de só
// o nome. Usado no compartilhamento e no modal de convite. `url` opcional: quando
// passado, anexa a linha "Inscreva-se" (clipboard/WhatsApp); no navigator.share a
// url vai no campo próprio, então chamamos SEM url. Parse da data por regex
// (startDate = "2026-06-14T18:30", hora local) — evita ambiguidade de fuso.
window._tournamentInviteText = function(t, url) {
    if (!t) return '';
    var lines = ['🏆 Convite para o torneio:', (t.name || 'Torneio')];
    var m = String(t.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (m) {
        var dateStr = m[3] + '/' + m[2] + '/' + m[1];
        if (m[4]) dateStr += ' às ' + m[4] + ':' + m[5];
        lines.push('📅 ' + dateStr);
    }
    if (t.venue) lines.push('📍 ' + t.venue);
    if (url) { lines.push(''); lines.push('👉 Inscreva-se: ' + url); }
    return lines.join('\n');
};

// Copy tournament link to clipboard (with native share fallback on mobile)
window._shareTournament = function(tournamentId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t) return;
    var url = window._tournamentUrl(t.id);
    // Append ref=UID so the recipient auto-friends the sharer
    var cu = window.AppStore.currentUser;
    if (cu && (cu.uid || cu.email)) {
        url += '?ref=' + encodeURIComponent(cu.uid || cu.email);
    }
    var title = t.name;
    var text = '\uD83C\uDFC6 ' + t.name + ' — scoreplace.app';
    // v2.1.83: texto rico (nome + data/hora + local) em vez de só o link.
    text = window._tournamentInviteText(t);              // SEM url (vai no campo url do share)
    var copyText = window._tournamentInviteText(t, url); // COM url (pra colar)
    var _copyFallback = function() {
        navigator.clipboard.writeText(copyText).then(function() {
            if (typeof showNotification === 'function') showNotification(_t('share.copied'), _t('share.copiedMsg'), 'success');
        }).catch(function() {
            try {
                var inp = document.createElement('textarea');
                inp.value = copyText; document.body.appendChild(inp); inp.select();
                document.execCommand('copy'); document.body.removeChild(inp);
                if (typeof showNotification === 'function') showNotification(_t('share.copied'), _t('share.copiedMsg'), 'success');
            } catch (_e) {
                if (typeof showNotification === 'function') showNotification('Link', url, 'info');
            }
        });
    };
    if (navigator.share) {
        navigator.share({ title: title, text: text, url: url }).catch(function() { _copyFallback(); });
    } else {
        _copyFallback();
    }
};

// Página de convite — renderiza no view-container como página normal
window.renderInvitePage = function(container) {
    var baseUrl = window.SCOREPLACE_URL || 'https://scoreplace.app';
    var url = baseUrl;
    var cu = window.AppStore && window.AppStore.currentUser;
    if (cu && (cu.uid || cu.email)) {
        url += '/?ref=' + encodeURIComponent(cu.uid || cu.email);
    }
    var qrImageUrl = window._qrCodeUrl(url, 280, true);
    var qrImageUrlLight = window._qrCodeUrl(url, 280, false);
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var title = (_t && _t('invite.appQrTitle')) || 'Convidar para o scoreplace.app';
    var desc = (_t && _t('invite.appQrDesc')) || 'Escaneie o QR code para entrar no app';
    var copyLabel = (_t && _t('invite.copyLink')) || 'Copiar Link';
    var dlLabel = (_t && _t('invite.downloadQr')) || 'Baixar QR';
    var printLabel = (_t && _t('invite.printQr')) || 'Imprimir';

    var hdr = typeof window._renderBackHeader === 'function'
      ? window._renderBackHeader({
          href: '#dashboard',
          label: (_t && _t('btn.back')) || 'Voltar',
          middleHtml: '<span style="font-size:0.88rem;font-weight:700;color:var(--text-bright);">📱 ' + window._safeHtml(title) + '</span>'
        })
      : '<div></div>';

    container.innerHTML = hdr +
      '<div style="padding:1rem;text-align:center;max-width:400px;margin:0 auto;">' +
      '<p style="margin:0 0 1rem;font-size:0.85rem;color:var(--text-muted,#94a3b8);">' + window._safeHtml(desc) + '</p>' +
      '<div style="background:' + (isLight ? '#ffffff' : '#1a1e2e') + ';border-radius:16px;padding:16px;display:inline-block;margin-bottom:1rem;">' +
        '<img id="qr-code-img" src="' + (isLight ? qrImageUrlLight : qrImageUrl) + '" alt="QR Code" style="width:280px;height:280px;border-radius:8px;" onerror="this.parentElement.innerHTML=\'<p style=color:#ef4444;font-size:0.85rem;>Erro ao gerar QR Code. Verifique sua conexão.</p>\'">' +
      '</div>' +
      '<p style="margin:0 0 1rem;font-size:0.78rem;color:var(--text-muted,#94a3b8);word-break:break-all;">' + window._safeHtml(url) + '</p>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
        '<button onclick="(function(u){navigator.clipboard.writeText(u).then(function(){if(typeof showNotification===\'function\')showNotification(window._t(\'share.copied\'),window._t(\'share.copiedLinkMsg\'),\'success\');}).catch(function(){try{var i=document.createElement(\'input\');i.value=u;document.body.appendChild(i);i.select();document.execCommand(\'copy\');document.body.removeChild(i);if(typeof showNotification===\'function\')showNotification(window._t(\'share.copied\'),window._t(\'share.copiedLinkMsg\'),\'success\');}catch(e){if(typeof showNotification===\'function\')showNotification(\'Link\',u,\'info\');}});}(\'' + url.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\'))" id="invite-copy-btn" class="btn btn-sm hover-lift" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">📋 ' + window._safeHtml(copyLabel) + '</button>' +
        '<button onclick="window._downloadAppInviteQR()" id="invite-download-btn" class="btn btn-sm hover-lift" style="background:rgba(16,185,129,0.15);color:#4ade80;border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">💾 ' + window._safeHtml(dlLabel) + '</button>' +
        '<button onclick="window._printQRCode()" id="invite-print-btn" class="btn btn-sm hover-lift" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">🖨️ ' + window._safeHtml(printLabel) + '</button>' +
      '</div>' +
      '</div>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
    // v2.3.41: tour de coachmarks da tela Convidar (idle-driven, self-guardado)
    if (window._coach && typeof window._coach.startInviteTour === 'function') window._coach.startInviteTour();
};

// Compat: botões antigos que chamam _showAppInviteQR redirecionam para a página
window._showAppInviteQR = function() { window.location.hash = '#invite'; };

window._downloadAppInviteQR = function() {
    var img = document.getElementById('qr-code-img');
    if (!img) return;
    fetch(img.src).then(function(resp) { return resp.blob(); }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'scoreplace-app-invite.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof showNotification === 'function') showNotification(_t('share.qrSaved'), _t('share.qrSavedMsg'), 'success');
    }).catch(function() {
        if (typeof showNotification === 'function') showNotification(_t('auth.error'), _t('share.qrError'), 'error');
    });
};

// Show QR Code modal for a tournament link
window._showQRCode = function(tournamentId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t) return;
    var url = window._tournamentUrl(t.id);
    // Append ref=UID so the recipient auto-friends the sharer
    var cu = window.AppStore.currentUser;
    if (cu && (cu.uid || cu.email)) {
        url += '?ref=' + encodeURIComponent(cu.uid || cu.email);
    }
    var qrImageUrl = window._qrCodeUrl(url, 280, true);
    var qrImageUrlLight = window._qrCodeUrl(url, 280, false);
    var isLight = document.documentElement.getAttribute('data-theme') === 'light';
    var safeN = window._safeHtml(t.name);

    // Remove previous QR modal if any
    var prev = document.getElementById('qr-modal-overlay');
    if (prev) prev.remove();

    var overlay = document.createElement('div');
    overlay.id = 'qr-modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;box-sizing:border-box;animation:fadeIn 0.2s ease;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    var modal = document.createElement('div');
    modal.style.cssText = 'background:var(--card-bg,#1e2235);border-radius:20px;padding:2rem;max-width:380px;width:90%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.5);position:relative;';

    modal.innerHTML = '' +
      '<button onclick="document.getElementById(\'qr-modal-overlay\').remove()" style="position:absolute;top:12px;right:12px;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:1.8rem;cursor:pointer;line-height:1;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;">&times;</button>' +
      '<h3 style="margin:0 0 0.5rem;font-size:1.2rem;color:var(--text-bright,#fff);">QR Code do Torneio</h3>' +
      '<p style="margin:0 0 1rem;font-size:0.85rem;color:var(--text-muted,#94a3b8);word-break:break-all;">' + safeN + '</p>' +
      '<div style="background:' + (isLight ? '#ffffff' : '#1a1e2e') + ';border-radius:16px;padding:16px;display:inline-block;margin-bottom:1rem;">' +
        '<img id="qr-code-img" src="' + (isLight ? qrImageUrlLight : qrImageUrl) + '" alt="QR Code" style="width:280px;height:280px;border-radius:8px;" onerror="this.parentElement.innerHTML=\'<p style=color:#ef4444;font-size:0.85rem;>Erro ao gerar QR Code. Verifique sua conexão.</p>\'">' +
      '</div>' +
      '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
        '<button onclick="navigator.clipboard.writeText(\'' + url.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\').then(function(){if(typeof showNotification===\'function\')showNotification(window._t(\'share.copied\'),window._t(\'share.copiedLinkMsg\'),\'success\');})" class="btn btn-sm hover-lift" style="background:rgba(59,130,246,0.15);color:#60a5fa;border:1px solid rgba(59,130,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">📋 Copiar Link</button>' +
        '<button onclick="window._downloadQRCode(\'' + t.id + '\')" class="btn btn-sm hover-lift" style="background:rgba(16,185,129,0.15);color:#4ade80;border:1px solid rgba(16,185,129,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">💾 Baixar QR</button>' +
        '<button onclick="window._printQRCode()" class="btn btn-sm hover-lift" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">🖨️ Imprimir</button>' +
      '</div>';

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // ESC to close
    var _escHandler = function(e) {
        if (e.key === 'Escape') {
            var el = document.getElementById('qr-modal-overlay');
            if (el) el.remove();
            document.removeEventListener('keydown', _escHandler);
        }
    };
    document.addEventListener('keydown', _escHandler);
};

// Download QR code image
window._downloadQRCode = function(tournamentId) {
    var img = document.getElementById('qr-code-img');
    if (!img) return;
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    var name = t ? (t.name || 'torneio').replace(/[^a-zA-Z0-9À-ü\s-]/g, '').replace(/\s+/g, '_') : 'torneio';
    // Fetch the image and download it
    fetch(img.src).then(function(resp) { return resp.blob(); }).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'QRCode_' + name + '.png';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        if (typeof showNotification === 'function') showNotification(_t('share.qrSaved'), _t('share.qrSavedMsg'), 'success');
    }).catch(function() {
        if (typeof showNotification === 'function') showNotification(_t('auth.error'), _t('share.qrError'), 'error');
    });
};

// Print QR Code
window._printQRCode = function() {
    var img = document.getElementById('qr-code-img');
    if (!img) return;
    var win = window.open('', '_blank');
    win.document.write('<html><head><title>QR Code - scoreplace.app</title></head><body style="display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fff;"><div style="text-align:center;"><h2 style="font-family:sans-serif;color:#333;">scoreplace.app</h2><img src="' + img.src.replace(/bgcolor=[^&]+/, 'bgcolor=ffffff').replace(/color=[^&]+/, 'color=1a1e2e') + '" style="width:400px;height:400px;"><p style="font-family:sans-serif;color:#666;font-size:14px;margin-top:1rem;">Escaneie para acessar o torneio</p></div></body></html>');
    win.document.close();
    win.onload = function() { win.print(); };
};

// ─── Helpers compartilhados (Print + CSV) ────────────────────────────────
// v1.3.27-beta: unifica extração de inscritos + matches + standings que
// tanto _printTournament quanto _exportTournamentCSV consomem. Antes
// CSV pegava só matches (sem lista de inscritos) e Print era window.print()
// no DOM atual (que em pre-iniciar é só o botão "Iniciar Torneio" → vazio).

function _resolveCompetitorRows(t) {
  // Lista de inscritos com categoria, gênero e habilidade — fonte primária
  // pra listagem impressa e CSV. Ordena alfabeticamente; trata duplas.
  var parts = Array.isArray(t.participants) ? t.participants : [];
  return parts.map(function(p) {
    if (typeof p === 'string') return { name: p, category: '', gender: '', skill: '', email: '' };
    var name = p.displayName || p.name || (p.email ? p.email.split('@')[0] : '');
    var cats = Array.isArray(p.categories) ? p.categories.join(', ') : (p.category || '');
    return {
      name: name,
      category: cats,
      gender: p.gender || '',
      skill: p.defaultCategory || '',
      email: p.email || '',
    };
  }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name), 'pt-BR'); });
}

function _resolveMatchRows(t) {
  // Mesma lógica do CSV antigo, extraída pra reuso. Retorna { rows: [],
  // hasMatches: bool } onde rows são linhas tabulares (não inclui header).
  // v1.3.27-beta: try/catch defensivo em volta de _getUnifiedRounds —
  // ele assume estruturas que torneios minimal/mock não têm e blows up.
  // Fallback pro scan legacy resolve isso.
  var allMatches = [];
  var _unified = null;
  try {
    if (typeof window._getUnifiedRounds === 'function') _unified = window._getUnifiedRounds(t);
  } catch (e) { _unified = null; }
  var _hasUnified = _unified && Array.isArray(_unified.columns) && _unified.columns.length > 0;
  if (_hasUnified) {
    _unified.columns.forEach(function(c) {
      if (!c || c.phase === 'swiss-past') return;
      if (c.phase === 'thirdplace') {
        (c.matches || []).forEach(function(m) { allMatches.push({ m: m, label: 'Disputa 3º lugar' }); });
        return;
      }
      if ((c.phase === 'groups' || c.phase === 'monarch') && Array.isArray(c.subgroups)) {
        c.subgroups.forEach(function(sg, gi) {
          var gname = (sg && sg.name) || String.fromCharCode(65 + gi);
          (sg && sg.matches || []).forEach(function(m, mi) {
            allMatches.push({ m: m, label: 'Grupo ' + gname + ' - Partida ' + (mi + 1) });
          });
        });
        return;
      }
      var lbl = c.label || ('Rodada ' + c.round);
      (c.matches || []).forEach(function(m) { allMatches.push({ m: m, label: lbl }); });
    });
  } else {
    if (Array.isArray(t.matches)) {
      t.matches.forEach(function(m, idx) { allMatches.push({ m: m, label: m.round || m.label || ('Partida ' + (idx + 1)) }); });
    }
    if (Array.isArray(t.rounds)) {
      t.rounds.forEach(function(r, ri) {
        (r.matches || []).forEach(function(m) { allMatches.push({ m: m, label: 'Rodada ' + (ri + 1) }); });
      });
    }
    if (Array.isArray(t.groups)) {
      t.groups.forEach(function(g, gi) {
        (g.matches || []).forEach(function(m, mi) { allMatches.push({ m: m, label: 'Grupo ' + (gi + 1) + ' - Partida ' + (mi + 1) }); });
      });
    }
    if (Array.isArray(t.rodadas)) {
      t.rodadas.forEach(function(rd, ri) {
        (rd.matches || []).concat(rd.jogos || []).forEach(function(m) { allMatches.push({ m: m, label: 'Rodada ' + (ri + 1) }); });
      });
    }
    if (t.thirdPlaceMatch) allMatches.push({ m: t.thirdPlaceMatch, label: 'Disputa 3º lugar' });
  }
  var rows = [];
  var matchNum = 0;
  allMatches.forEach(function(item) {
    var m = item.m;
    if (!m.p1 && !m.p2) return;
    matchNum++;
    rows.push({
      n: matchNum,
      p1: m.p1 || 'TBD',
      p2: m.p2 || 'TBD',
      score1: (m.scoreP1 != null) ? m.scoreP1 : '',
      score2: (m.scoreP2 != null) ? m.scoreP2 : '',
      winner: m.winner || '',
      label: item.label,
    });
  });
  return { rows: rows, hasMatches: rows.length > 0 };
}

function _resolveStandingsRows(t) {
  // Padrão do CSV antigo, extraído. Retorna [{cat, rows: [{pos, name,...}]}].
  if (typeof window._computeStandings !== 'function') return [];
  var isLiga = window._isLigaFormat ? window._isLigaFormat(t) : false;
  var isSuico = t.format === 'Suíço Clássico' || t.classifyFormat === 'swiss' || t.currentStage === 'swiss';
  if (!isLiga && !isSuico) return [];
  var categories = (t.combinedCategories && t.combinedCategories.length) ? t.combinedCategories : ['default'];
  var out = [];
  categories.forEach(function(cat) {
    var computed = window._computeStandings(t, cat === 'default' ? undefined : cat) || [];
    if (computed.length === 0) return;
    out.push({
      cat: cat === 'default' ? '' : cat,
      rows: computed.map(function(s, i) {
        return { pos: i + 1, name: s.name, points: s.points, wins: s.wins, draws: s.draws || 0, losses: s.losses, pointsDiff: s.pointsDiff, played: s.played };
      }),
    });
  });
  return out;
}

// ─── Print: open dedicated printable page in a new window ────────────────
//
// v1.3.27-beta: window.print() no DOM atual era inútil em qualquer view
// que não fosse o bracket. Agora gera HTML auto-contido com header do
// torneio + inscritos + matches + standings, em paisagem retrato A4.
window._printTournament = function(tournamentId) {
  var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
  if (!t) {
    if (typeof showNotification === 'function') showNotification('Erro', 'Torneio não encontrado.', 'error');
    return;
  }

  var competitors = _resolveCompetitorRows(t);
  var matchData = _resolveMatchRows(t);
  var standingsData = _resolveStandingsRows(t);

  var esc = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  var fmtDate = function(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };
  var competitorsCount = competitors.length;
  var hasCategories = competitors.some(function(c) { return !!c.category; });

  var html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>' + esc(t.name || 'Torneio') + ' — scoreplace.app</title>' +
    '<style>' +
      '@page { size: A4 portrait; margin: 14mm; }' +
      'body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#1a1a1a; margin:0; padding:0; font-size:10pt; line-height:1.4; }' +
      'h1 { margin:0 0 4px; font-size:18pt; color:#0f172a; }' +
      'h2 { margin:18px 0 8px; font-size:12pt; color:#0f172a; border-bottom:1.5px solid #e5e7eb; padding-bottom:4px; }' +
      '.brand { font-size:9pt; color:#64748b; margin-bottom:14px; }' +
      '.meta { background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 14px; margin-bottom:14px; }' +
      '.meta-row { display:flex; flex-wrap:wrap; gap:8px 24px; font-size:9.5pt; }' +
      '.meta-row b { color:#0f172a; }' +
      'table { width:100%; border-collapse:collapse; margin-bottom:14px; font-size:9.5pt; }' +
      'th, td { padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:left; }' +
      'th { background:#f1f5f9; color:#334155; font-weight:600; font-size:8.5pt; text-transform:uppercase; letter-spacing:0.3px; }' +
      'tr:nth-child(even) td { background:#fafbfc; }' +
      '.no { width:32px; color:#64748b; font-variant-numeric:tabular-nums; }' +
      '.center { text-align:center; }' +
      '.right { text-align:right; }' +
      '.cat { font-size:8.5pt; color:#475569; }' +
      '.score { font-variant-numeric:tabular-nums; font-weight:600; min-width:24px; }' +
      '.footer { margin-top:24px; padding-top:10px; border-top:1px solid #e5e7eb; font-size:8.5pt; color:#64748b; text-align:center; }' +
      '.section-empty { color:#64748b; font-style:italic; font-size:9.5pt; padding:8px 0; }' +
      '.subhead { font-size:10pt; font-weight:600; color:#0f172a; margin:12px 0 6px; }' +
    '</style>' +
    '</head><body>' +
    '<h1>' + esc(t.name || 'Torneio') + '</h1>' +
    '<div class="brand">scoreplace.app · gerado em ' + fmtDate(new Date().toISOString()) + '</div>' +
    '<div class="meta"><div class="meta-row">' +
      (t.sport ? '<span><b>Esporte:</b> ' + esc(t.sport) + '</span>' : '') +
      (t.format ? '<span><b>Formato:</b> ' + esc(t.format) + '</span>' : '') +
      (t.startDate ? '<span><b>Início:</b> ' + esc(fmtDate(t.startDate)) + '</span>' : '') +
      (t.endDate ? '<span><b>Fim:</b> ' + esc(fmtDate(t.endDate)) + '</span>' : '') +
      (t.venue ? '<span><b>Local:</b> ' + esc(t.venue) + '</span>' : '') +
      (t.access ? '<span><b>Acesso:</b> ' + esc(t.access) + '</span>' : '') +
      '<span><b>Inscritos:</b> ' + competitorsCount + '</span>' +
    '</div></div>' +

    '<h2>Inscritos (' + competitorsCount + ')</h2>';
  if (competitorsCount === 0) {
    html += '<div class="section-empty">Sem inscritos.</div>';
  } else {
    html += '<table><thead><tr><th class="no">#</th><th>Nome</th>' +
      (hasCategories ? '<th>Categoria</th>' : '') +
      '<th>E-mail</th></tr></thead><tbody>';
    competitors.forEach(function(c, i) {
      html += '<tr><td class="no">' + (i + 1) + '</td>' +
        '<td>' + esc(c.name) + '</td>' +
        (hasCategories ? '<td class="cat">' + esc(c.category) + '</td>' : '') +
        '<td class="cat">' + esc(c.email) + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  if (matchData.hasMatches) {
    html += '<h2>Partidas (' + matchData.rows.length + ')</h2>';
    var lastLabel = '';
    matchData.rows.forEach(function(r, idx) {
      if (r.label !== lastLabel) {
        if (idx > 0) html += '</tbody></table>';
        html += '<div class="subhead">' + esc(r.label) + '</div>';
        html += '<table><thead><tr><th class="no">Jogo</th><th>Jogador 1</th><th class="center">Placar</th><th>Jogador 2</th><th>Vencedor</th></tr></thead><tbody>';
        lastLabel = r.label;
      }
      html += '<tr>' +
        '<td class="no">' + r.n + '</td>' +
        '<td>' + esc(r.p1) + '</td>' +
        '<td class="center score">' + esc(r.score1) + ' × ' + esc(r.score2) + '</td>' +
        '<td>' + esc(r.p2) + '</td>' +
        '<td>' + esc(r.winner) + '</td>' +
      '</tr>';
    });
    html += '</tbody></table>';
  }

  if (standingsData.length > 0) {
    html += '<h2>Classificação</h2>';
    standingsData.forEach(function(catBlock) {
      if (catBlock.cat) html += '<div class="subhead">Categoria: ' + esc(catBlock.cat) + '</div>';
      html += '<table><thead><tr><th class="no">Pos</th><th>Participante</th><th class="right">Pts</th><th class="right">V</th><th class="right">E</th><th class="right">D</th><th class="right">Saldo</th><th class="right">Jogos</th></tr></thead><tbody>';
      catBlock.rows.forEach(function(s) {
        html += '<tr><td class="no">' + s.pos + '</td>' +
          '<td>' + esc(s.name) + '</td>' +
          '<td class="right score">' + s.points + '</td>' +
          '<td class="right">' + s.wins + '</td>' +
          '<td class="right">' + s.draws + '</td>' +
          '<td class="right">' + s.losses + '</td>' +
          '<td class="right">' + s.pointsDiff + '</td>' +
          '<td class="right">' + s.played + '</td></tr>';
      });
      html += '</tbody></table>';
    });
  }

  html += '<div class="footer">scoreplace.app · ' + esc(t.name || 'Torneio') + ' · ' + competitorsCount + ' inscrito' + (competitorsCount === 1 ? '' : 's') +
    (matchData.hasMatches ? ' · ' + matchData.rows.length + ' partida' + (matchData.rows.length === 1 ? '' : 's') : '') +
    '</div></body></html>';

  var win = window.open('', '_blank');
  if (!win) {
    if (typeof showNotification === 'function') showNotification('Pop-up bloqueado', 'Permita pop-ups pra imprimir o torneio.', 'warning');
    return;
  }
  win.document.write(html);
  win.document.close();
  // Espera carregar antes de chamar print() — alguns browsers (Safari) não
  // disparam onload em document.write se chamado muito rápido.
  win.onload = function() { try { win.focus(); win.print(); } catch (e) {} };
  // Fallback: dispara print após 600ms se onload não rolar
  setTimeout(function() { try { win.print(); } catch (e) {} }, 600);
};

// Compat — _printBracket continua funcionando, agora redireciona pro
// novo handler (precisa achar o tournament). Tenta resolver via hash.
window._printBracket = function() {
  var hash = window.location.hash || '';
  var m = hash.match(/#tournaments\/([^/?#]+)|#bracket\/([^/?#]+)|#pre-draw\/([^/?#]+)/);
  var tId = m ? (m[1] || m[2] || m[3]) : null;
  if (tId && typeof window._printTournament === 'function') {
    window._printTournament(tId);
    return;
  }
  // Último fallback — print do DOM atual
  window.print();
};

// Export tournament results as CSV file
//
// v1.3.27-beta: reescrito pra incluir lista de Inscritos sempre (antes
// só matches/standings — o que dava CSV vazio em torneios pré-iniciar).
// Estrutura: bloco Torneio (header + dados) + bloco Inscritos +
// bloco Partidas (se houver) + bloco Classificação (Liga/Suíço).
window._exportTournamentCSV = function(tournamentId) {
    var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t) return;

    var rows = [];

    // ─ Bloco 1: Torneio (header + dados) ─────────────────────────────
    rows.push(['=== TORNEIO ===']);
    rows.push(['Nome', t.name || '']);
    if (t.sport) rows.push(['Esporte', t.sport]);
    if (t.format) rows.push(['Formato', t.format]);
    if (t.startDate) rows.push(['Início', t.startDate]);
    if (t.endDate) rows.push(['Fim', t.endDate]);
    if (t.venue) rows.push(['Local', t.venue]);
    if (t.access) rows.push(['Acesso', t.access]);
    if (t.organizerEmail) rows.push(['Organizador', t.organizerEmail]);
    rows.push(['Exportado em', new Date().toLocaleString('pt-BR')]);
    rows.push([]);

    // ─ Bloco 2: Inscritos ────────────────────────────────────────────
    var competitors = _resolveCompetitorRows(t);
    rows.push(['=== INSCRITOS (' + competitors.length + ') ===']);
    if (competitors.length === 0) {
      rows.push(['Sem inscritos.']);
    } else {
      var hasCategories = competitors.some(function(c) { return !!c.category; });
      var inscHeader = ['#', 'Nome'];
      if (hasCategories) inscHeader.push('Categoria');
      inscHeader.push('Gênero', 'Habilidade', 'E-mail');
      rows.push(inscHeader);
      competitors.forEach(function(c, i) {
        var row = [i + 1, c.name];
        if (hasCategories) row.push(c.category);
        row.push(c.gender, c.skill, c.email);
        rows.push(row);
      });
    }
    rows.push([]);

    // ─ Bloco 3: Partidas (se houver) ─────────────────────────────────
    var matchData = _resolveMatchRows(t);
    if (matchData.hasMatches) {
      rows.push(['=== PARTIDAS (' + matchData.rows.length + ') ===']);
      rows.push(['Jogo', 'Jogador 1', 'Placar 1', 'Placar 2', 'Jogador 2', 'Vencedor', 'Rodada/Fase']);
      matchData.rows.forEach(function(r) {
        rows.push([r.n, r.p1, r.score1, r.score2, r.p2, r.winner, r.label]);
      });
      rows.push([]);
    }

    // ─ Bloco 4: Classificação (Liga/Suíço) ───────────────────────────
    var standingsData = _resolveStandingsRows(t);
    if (standingsData.length > 0) {
      rows.push(['=== CLASSIFICAÇÃO ===']);
      standingsData.forEach(function(catBlock) {
        if (catBlock.cat) rows.push(['--- Categoria: ' + catBlock.cat + ' ---']);
        rows.push(['Posição', 'Participante', 'Pontos', 'Vitórias', 'Empates', 'Derrotas', 'Saldo', 'Jogos']);
        catBlock.rows.forEach(function(s) {
          rows.push([s.pos, s.name, s.points, s.wins, s.draws, s.losses, s.pointsDiff, s.played]);
        });
        rows.push([]);
      });
    }

    if (competitors.length === 0 && !matchData.hasMatches && standingsData.length === 0) {
      if (typeof showNotification === 'function') showNotification(_t('share.noResults'), _t('share.noResultsMsg'), 'warning');
      return;
    }

    // Generate CSV
    var csvContent = rows.map(function(row) {
        return row.map(function(cell) {
            var str = String(cell === undefined || cell === null ? '' : cell);
            // Escape quotes and wrap in quotes if contains comma/quote/newline
            if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        }).join(',');
    }).join('\n');

    // Add BOM for UTF-8 support in Excel
    var blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (t.name || 'torneio').replace(/[^a-zA-Z0-9À-ü\s-]/g, '').replace(/\s+/g, '_') + '_resultados.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (typeof showNotification === 'function') showNotification(_t('share.exported'), _t('share.exportedMsg'), 'success');
};

// ─── Calendar export (Google Calendar URL + .ics download) ──────────────────
// Permite qualquer usuário (organizador, participante ou visitante logado)
// adicionar o torneio à agenda em 2 cliques. Evita que o usuário precise
// copiar data/hora/local manualmente — reduz fricção de "vou me esquecer".
//
// Estratégia: picker com 3 opções (Google Calendar, Apple/Outlook via .ics,
// Outlook Web). Evita o pior caso — browser sem detecção de default calendar.

// Formata Date como ICS UTC: YYYYMMDDTHHMMSSZ
function _icsFormatDate(d) {
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) + 'Z';
}

// Escapa caracteres especiais do formato iCalendar: vírgula, ponto-e-vírgula,
// barra invertida, quebra de linha. RFC 5545 §3.3.11.
function _icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

function _tournamentCalendarPayload(t) {
  // Resolve start/end. Se endDate ausente, assume startDate + 4h (ball-park).
  var startRaw = t.startDate;
  var endRaw = t.endDate;
  if (!startRaw) return null;
  var start = new Date(startRaw);
  if (isNaN(start.getTime())) return null;
  var end = endRaw ? new Date(endRaw) : null;
  if (!end || isNaN(end.getTime())) {
    end = new Date(start.getTime() + 4 * 3600 * 1000);
  }
  // Se o usuário não deu hora explícita (só data), startRaw é "2026-04-25"
  // sem T; nesse caso o Date vira meia-noite UTC. Pra não virar evento
  // cruzando dias por fuso, setamos 09:00 local como default.
  if (startRaw && startRaw.indexOf('T') === -1) {
    start = new Date(startRaw + 'T09:00:00');
    end = new Date(start.getTime() + 4 * 3600 * 1000);
  }
  var title = '🏆 ' + (t.name || 'Torneio');
  var sport = t.sport ? window._safeHtml(t.sport) : '';
  var format = t.format || '';
  var venue = t.venue || t.venueName || '';
  var addr = t.venueAddress || '';
  var loc = venue && addr ? (venue + ' — ' + addr) : (venue || addr || '');
  var url = window._tournamentUrl ? window._tournamentUrl(t.id) : ('https://scoreplace.app/#tournaments/' + t.id);
  var desc = 'Torneio no scoreplace.app\n\n' +
             (sport ? 'Modalidade: ' + sport + '\n' : '') +
             (format ? 'Formato: ' + format + '\n' : '') +
             '\nAcompanhe e lance resultados em:\n' + url;
  return { title: title, start: start, end: end, location: loc, description: desc, url: url };
}

// Google Calendar URL — abre em nova aba, pré-preenche tudo.
function _googleCalendarUrl(payload) {
  var dates = _icsFormatDate(payload.start) + '/' + _icsFormatDate(payload.end);
  var params = new URLSearchParams({
    action: 'TEMPLATE',
    text: payload.title,
    dates: dates,
    details: payload.description,
    location: payload.location || ''
  });
  return 'https://calendar.google.com/calendar/render?' + params.toString();
}

// Outlook Web URL — similar à do Google, útil pra usuários de Microsoft.
function _outlookCalendarUrl(payload) {
  var params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: payload.title,
    startdt: payload.start.toISOString(),
    enddt: payload.end.toISOString(),
    body: payload.description,
    location: payload.location || ''
  });
  return 'https://outlook.live.com/calendar/0/deeplink/compose?' + params.toString();
}

// ICS blob download — Apple Calendar (iOS/macOS), Outlook desktop, Thunderbird.
function _icsDownload(payload, filename) {
  var lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//scoreplace.app//Tournament//PT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:tournament-' + Date.now() + '@scoreplace.app',
    'DTSTAMP:' + _icsFormatDate(new Date()),
    'DTSTART:' + _icsFormatDate(payload.start),
    'DTEND:' + _icsFormatDate(payload.end),
    'SUMMARY:' + _icsEscape(payload.title),
    'DESCRIPTION:' + _icsEscape(payload.description),
    'LOCATION:' + _icsEscape(payload.location),
    'URL:' + payload.url,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
  var blob = new Blob([lines], { type: 'text/calendar;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Picker overlay — 3 opções. Se o torneio não tem startDate, avisa e sai.
window._tournamentAddToCalendar = function(tournamentId) {
  var t = window.AppStore.tournaments.find(function(tour) { return String(tour.id) === String(tournamentId); });
  if (!t) {
    if (Array.isArray(window.AppStore.publicDiscovery)) {
      t = window.AppStore.publicDiscovery.find(function(tour) { return String(tour.id) === String(tournamentId); });
    }
  }
  if (!t) return;
  var payload = _tournamentCalendarPayload(t);
  if (!payload) {
    if (typeof showNotification === 'function') {
      showNotification('Sem data definida', 'Defina a data de início do torneio antes de adicionar à agenda.', 'warning');
    }
    return;
  }
  var _safe = window._safeHtml || function(s) { return String(s || ''); };
  var prev = document.getElementById('cal-picker-overlay');
  if (prev) prev.remove();
  var overlay = document.createElement('div');
  overlay.id = 'cal-picker-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:16px;';
  var safeFilename = (t.name || 'torneio').replace(/[^a-zA-Z0-9À-ü\s-]/g, '').replace(/\s+/g, '_') + '.ics';
  // Guardamos o payload numa var global temporária pra que os handlers do
  // overlay consigam acessar sem serializar tudo em onclick string.
  window._calPendingPayload = payload;
  window._calPendingFilename = safeFilename;
  overlay.innerHTML =
    '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:22px;max-width:440px;width:100%;text-align:center;">' +
      '<div style="font-size:2rem;margin-bottom:8px;">📅</div>' +
      '<div style="font-weight:800;color:var(--text-bright);font-size:1.05rem;margin-bottom:6px;">Adicionar à agenda</div>' +
      '<div style="color:var(--text-muted);font-size:0.82rem;margin-bottom:16px;">' + _safe(t.name || 'Torneio') + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;">' +
        '<button class="btn hover-lift" onclick="window._calPick(\'google\')" style="background:#4285f4;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">🟦 Google Calendar</button>' +
        '<button class="btn hover-lift" onclick="window._calPick(\'outlook\')" style="background:#0078d4;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">🔷 Outlook.com</button>' +
        '<button class="btn hover-lift" onclick="window._calPick(\'ics\')" style="background:#6366f1;color:#fff;border:none;font-weight:700;padding:10px 16px;border-radius:10px;">📄 Apple/Outlook (.ics)</button>' +
      '</div>' +
      '<button class="btn btn-secondary btn-sm" onclick="document.getElementById(\'cal-picker-overlay\').remove()" style="margin-top:14px;">Cancelar</button>' +
    '</div>';
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
};

window._calPick = function(kind) {
  var payload = window._calPendingPayload;
  var filename = window._calPendingFilename;
  if (!payload) return;
  var ov = document.getElementById('cal-picker-overlay');
  if (ov) ov.remove();
  if (kind === 'google') {
    window.open(_googleCalendarUrl(payload), '_blank', 'noopener');
  } else if (kind === 'outlook') {
    window.open(_outlookCalendarUrl(payload), '_blank', 'noopener');
  } else if (kind === 'ics') {
    _icsDownload(payload, filename || 'torneio.ics');
    if (typeof showNotification === 'function') showNotification('Arquivo gerado', 'Abra o .ics pra importar na sua agenda.', 'success');
  }
  window._calPendingPayload = null;
  window._calPendingFilename = null;
};
