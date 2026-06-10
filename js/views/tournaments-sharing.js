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
    // Nome do torneio em destaque: linha em branco antes/depois + *negrito*
    // (WhatsApp/Telegram renderizam asteriscos como bold). Dá respiro e foco
    // ao nome, que é a informação mais importante do convite.
    var lines = ['🏆 Convite para o torneio', '', '*' + (t.name || 'Torneio') + '*', ''];
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

// Envia convite de torneio por e-mail — HTML rico e branded (mesmo padrão dos
// e-mails de notificação), com botão azul "Entrar no torneio". Vai pela fila
// `mail/` (extension firestore-send-email, remetente scoreplace.app@gmail.com).
// Fallback pra mailto: quando a fila não está disponível (ex: deslogado).
window._sendTournamentInviteEmail = function(tournamentId) {
    var t = (window.AppStore.tournaments || []).find(function(tour) { return String(tour.id) === String(tournamentId); });
    if (!t) return;
    var inp = document.getElementById('invite-email-' + t.id);
    var email = inp ? String(inp.value || '').trim() : '';
    if (!email || email.indexOf('@') === -1) {
        if (typeof showNotification === 'function') showNotification(window._t('tourn.attention'), window._t('tourn.enterEmail'), 'warning');
        return;
    }
    var cu = window.AppStore.currentUser;
    var inviterUid = (cu && (cu.uid || cu.email)) || '';
    var inviteUrl = window._tournamentUrl(t.id) + (inviterUid ? '?ref=' + encodeURIComponent(inviterUid) : '');
    var inviterName = (cu && cu.displayName) ? cu.displayName : '';

    // Corpo: quem convidou + data/local (o nome do torneio aparece em destaque
    // no cabeçalho 🏆 do template). Mantém o mesmo conteúdo da mensagem de
    // WhatsApp, só que em HTML branded.
    var lines = [inviterName ? (inviterName + ' está te convidando para este torneio.') : 'Você foi convidado para este torneio.', ''];
    var m = String(t.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (m) { var ds = m[3] + '/' + m[2] + '/' + m[1]; if (m[4]) ds += ' às ' + m[4] + ':' + m[5]; lines.push('📅 ' + ds); }
    if (t.venue) lines.push('📍 ' + t.venue);
    var message = lines.join('\n');
    var subject = 'Convite para o torneio: ' + (t.name || 'Torneio');

    var canQueue = window.FirestoreDB && typeof window.FirestoreDB.queueEmail === 'function' && window.FirestoreDB.db;
    if (canQueue && typeof window._emailTemplate === 'function') {
        var html = window._emailTemplate('tournament_invite', {
            message: message,
            tournamentName: t.name || 'Torneio',
            tournamentUrl: inviteUrl,
            ctaText: 'Entrar no torneio',
            ctaUrl: inviteUrl
        });
        window.FirestoreDB.queueEmail(email, subject, html);
        if (inp) inp.value = '';
        if (typeof showNotification === 'function') showNotification('Convite enviado', 'E-mail enviado para ' + email, 'success');
        return;
    }
    // Fallback: abre o cliente de e-mail do usuário com texto puro.
    var body = message + '\n\n👉 Inscreva-se: ' + inviteUrl;
    window.open('mailto:' + encodeURIComponent(email) + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body), '_self');
    if (typeof showNotification === 'function') showNotification(window._t('tourn.emailOpening'), window._t('tourn.emailOpeningMsg'), 'info');
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
        '<button onclick="window._openInvitePrint({kind:\'app\',url:\'' + url.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\'})" id="invite-print-btn" class="btn btn-sm hover-lift" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">🖨️ ' + window._safeHtml(printLabel) + '</button>' +
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
        '<button onclick="window._openTournamentInvitePrint(\'' + t.id + '\')" class="btn btn-sm hover-lift" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border:1px solid rgba(139,92,246,0.3);border-radius:10px;padding:8px 16px;font-size:0.8rem;font-weight:500;cursor:pointer;">🖨️ Imprimir</button>' +
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

// ─── Flyer de convite imprimível (v2.3.54) ──────────────────────────────────
// Substitui o print "cru" do QR por um flyer configurável: logotipo colorido
// no topo, título (nome do torneio / "Partida Casual" / frase do app editável)
// e QR Code centralizado. O usuário escolhe tamanho do papel (A4/A5/A6/Carta),
// cor (colorido ou P&B) e se quer o flyer completo ou só o QR. A impressão
// abre o diálogo nativo do navegador — que já permite salvar em PDF ou mandar
// pra impressora local/de rede.

// Logo wordmark inline com texto escuro (imprime bem em papel branco).
// A versão de icons/logo-wordmark.svg usa currentColor — aqui fixamos #0f172a.
function _flyerLogoSvg() {
  // viewBox cortado à arte real (pódio+wordmark vão de x≈22 a x≈300; o
  // viewBox original 400 de largura deixava ~30% de vazio à direita, fazendo
  // o logo parecer pequeno). Buffer à direita cobre variação de fonte entre
  // sistemas. height window cobre estrela (topo) até base do texto.
  return '<svg width="282" height="70" viewBox="20 28 282 70" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="scoreplace.app">' +
    '<rect x="25" y="65" width="22" height="30" rx="3" fill="#CBD5E1"/>' +
    '<rect x="52" y="45" width="22" height="50" rx="3" fill="#F59E0B"/>' +
    '<rect x="79" y="75" width="22" height="20" rx="3" fill="#FB923C"/>' +
    '<path d="M 63 35 L 65 41 L 71 41 L 66 45 L 68 51 L 63 47 L 58 51 L 60 45 L 55 41 L 61 41 Z" fill="#F59E0B"/>' +
    '<text x="125" y="65" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="32" font-weight="600" fill="#0f172a" letter-spacing="-0.5">scoreplace</text>' +
    '<text x="125" y="88" font-family="-apple-system, Segoe UI, Roboto, sans-serif" font-size="16" font-weight="400" fill="#0f172a" opacity="0.55">.app</text>' +
  '</svg>';
}

// Frase padrão pré-preenchida para convite genérico do app.
window._flyerDefaultAppPhrase = function() {
  return 'Já conhece o scoreplace.app?\nJogue em outro nível!\nEscaneie o QR Code abaixo e descubra!';
};

// Resolve um torneio e abre o flyer já com url + nome + data/local + logo.
// Centraliza o contexto (o logo é base64 grande — não cabe num onclick inline).
window._openTournamentInvitePrint = function(tournamentId) {
  var t = (window.AppStore.tournaments || []).find(function(x) { return String(x.id) === String(tournamentId); });
  if (!t && Array.isArray(window.AppStore.publicDiscovery)) {
    t = window.AppStore.publicDiscovery.find(function(x) { return String(x.id) === String(tournamentId); });
  }
  if (!t) return;
  var cu = window.AppStore.currentUser;
  var ref = (cu && (cu.uid || cu.email)) || '';
  var url = window._tournamentUrl(t.id) + (ref ? '?ref=' + encodeURIComponent(ref) : '');
  var subParts = [];
  var m = String(t.startDate || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (m) { var ds = m[3] + '/' + m[2] + '/' + m[1]; if (m[4]) ds += ' às ' + m[4] + ':' + m[5]; subParts.push('📅 ' + ds); }
  if (t.venue) subParts.push('📍 ' + t.venue);
  window._openInvitePrint({ kind: 'tournament', url: url, title: t.name || 'Torneio', subtitle: subParts.join('\n'), logo: t.logoData || '', logoRadius: window._tournamentLogoRadius(t) });
};

// Abre o overlay de configuração do flyer. opts:
//   kind: 'app' | 'tournament' | 'casual'
//   url:  string (link que vira o QR)
//   title: string (nome do torneio / rótulo casual) — ignorado pra 'app'
//   subtitle: string opcional (ex: data/local do torneio, código da sala)
//   logo: string opcional (base64 do logo do torneio — só pra 'tournament')
window._openInvitePrint = function(opts) {
  opts = opts || {};
  var _safe = window._safeHtml || function(s) { return String(s == null ? '' : s); };
  window._flyerPrintOpts = opts;

  var prev = document.getElementById('flyer-print-overlay');
  if (prev) prev.remove();

  var isApp = opts.kind === 'app';
  var isTourn = opts.kind === 'tournament';
  var defaultPhrase = window._flyerDefaultAppPhrase();
  var _upd = ' oninput="window._updateFlyerPreview()" onchange="window._updateFlyerPreview()"';

  var overlay = document.createElement('div');
  overlay.id = 'flyer-print-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:100050;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;overflow-y:auto;';
  overlay.addEventListener('click', function(ev) { if (ev.target === overlay) overlay.remove(); });

  var phraseBlock = isApp
    ? '<div style="text-align:left;margin-bottom:14px;">' +
        '<label style="display:block;font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);margin-bottom:6px;">✏️ Mensagem do convite</label>' +
        '<textarea id="flyer-phrase" rows="3"' + _upd + ' style="width:100%;box-sizing:border-box;min-width:0;background:var(--bg-dark,#0f1320);border:1px solid var(--border-color,#2a2f45);border-radius:10px;padding:10px 12px;color:var(--text-bright,#fff);font-size:0.85rem;font-family:inherit;resize:vertical;">' + _safe(defaultPhrase) + '</textarea>' +
      '</div>'
    : '';

  // Sliders de tamanho — só pro flyer de torneio (logo scoreplace fica fixo;
  // logo do torneio, fonte do nome, QR e textos são ajustáveis).
  var _slider = function(id, label, min, max, val) {
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">' +
      '<span style="font-size:0.74rem;color:var(--text-muted,#94a3b8);width:90px;flex-shrink:0;">' + label + '</span>' +
      '<input type="range" id="' + id + '" min="' + min + '" max="' + max + '" value="' + val + '"' + _upd + ' style="flex:1;min-width:0;accent-color:#6366f1;">' +
    '</div>';
  };
  // Sliders percentuais (100 = padrão). O tamanho do logo NA IMPRESSÃO é
  // ajustável aqui; a FORMA (quadrado/círculo) é definida só no upload do logo.
  var sizeBlock = isTourn
    ? '<div id="flyer-size-block" style="margin-bottom:14px;padding:12px;border:1px solid var(--border-color,#2a2f45);border-radius:10px;">' +
        '<div style="font-size:0.78rem;font-weight:600;color:var(--text-bright,#fff);margin-bottom:10px;">Tamanhos (arraste e veja na hora)</div>' +
        _slider('flyer-logosize', 'Logo torneio', 0, 500, 100) +
        _slider('flyer-namesize', 'Nome', 30, 500, 100) +
        _slider('flyer-qrsize', 'QR Code', 40, 300, 100) +
        _slider('flyer-textsize', 'Textos', 50, 500, 100) +
      '</div>'
    : '';

  var _sel = function(id, label, optsHtml) {
    return '<div style="margin-bottom:12px;">' +
      '<label style="display:block;font-size:0.75rem;font-weight:600;color:var(--text-bright,#fff);margin-bottom:5px;">' + label + '</label>' +
      '<select id="' + id + '"' + _upd + ' style="width:100%;box-sizing:border-box;background:var(--bg-dark,#0f1320);border:1px solid var(--border-color,#2a2f45);border-radius:10px;padding:9px 12px;color:var(--text-bright,#fff);font-size:0.84rem;">' + optsHtml + '</select>' +
    '</div>';
  };

  var controls =
    phraseBlock +
    _sel('flyer-content', 'Conteúdo', '<option value="full">Flyer completo (logo + texto + QR)</option><option value="qr">Apenas o QR Code</option>') +
    _sel('flyer-paper', 'Tamanho do papel', '<option value="A4">A4 (210 × 297 mm)</option><option value="A5">A5 (148 × 210 mm)</option><option value="A6">A6 (105 × 148 mm)</option><option value="letter">Carta (216 × 279 mm)</option>') +
    _sel('flyer-color', 'Cor', '<option value="color">Colorido</option><option value="bw">Preto e branco</option>') +
    _sel('flyer-orient', 'Orientação', '<option value="portrait">Retrato (vertical)</option><option value="landscape">Paisagem (horizontal)</option>') +
    sizeBlock;

  overlay.innerHTML =
    '<div style="background:var(--card-bg,#1e2235);border-radius:18px;padding:18px;max-width:920px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.5);box-sizing:border-box;display:flex;flex-direction:column;max-height:92vh;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap;">' +
        '<div style="font-size:1.1rem;font-weight:800;color:var(--text-bright,#fff);">🖨️ Imprimir convite</div>' +
        '<div style="font-size:0.74rem;color:var(--text-muted,#94a3b8);">Pré-visualização ao vivo — ajuste e veja na hora</div>' +
      '</div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap;flex:1;min-height:0;">' +
        // Preview
        '<div id="flyer-preview-host" style="flex:2 1 300px;min-width:240px;height:min(64vh,540px);background:#0a0e1a;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;padding:10px;box-sizing:border-box;">' +
          '<div id="flyer-preview-wrap" style="position:relative;box-shadow:0 6px 24px rgba(0,0,0,0.55);background:#fff;">' +
            '<iframe id="flyer-preview-frame" title="Pré-visualização" style="border:0;background:#fff;display:block;"></iframe>' +
          '</div>' +
        '</div>' +
        // Controls
        '<div style="flex:1 1 250px;min-width:230px;max-width:320px;display:flex;flex-direction:column;min-height:0;">' +
          '<div style="overflow-y:auto;flex:1;min-height:0;padding-right:4px;">' + controls + '</div>' +
          '<div style="display:flex;gap:8px;margin-top:12px;">' +
            '<button onclick="document.getElementById(\'flyer-print-overlay\').remove()" class="btn btn-sm" style="flex:0 0 auto;background:rgba(148,163,184,0.15);color:var(--text-muted,#94a3b8);border:1px solid rgba(148,163,184,0.25);border-radius:10px;padding:10px 16px;font-size:0.85rem;font-weight:600;cursor:pointer;">Cancelar</button>' +
            '<button onclick="window._doInvitePrint()" class="btn btn-sm hover-lift" style="flex:1;background:linear-gradient(135deg,#6366f1,#4f46e5);color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:0.86rem;font-weight:700;cursor:pointer;">🖨️ Imprimir / PDF</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(overlay);
  // Primeira renderização do preview + re-escala em resize da janela.
  window._updateFlyerPreview();
  setTimeout(window._updateFlyerPreview, 60);
  if (!window._flyerPreviewResizeBound) {
    window._flyerPreviewResizeBound = true;
    window.addEventListener('resize', function() {
      if (document.getElementById('flyer-preview-frame')) window._updateFlyerPreview();
    });
  }
};

// Lê o estado atual de todos os controles + contexto e devolve as opções
// que alimentam _buildFlyerPrintHtml. Compartilhado entre preview e impressão.
window._collectFlyerOpts = function() {
  var opts = window._flyerPrintOpts || {};
  var val = function(id, d) { var e = document.getElementById(id); return e ? e.value : d; };
  var num = function(id, d) { var e = document.getElementById(id); var n = e ? Number(e.value) : NaN; return isNaN(n) ? d : n; };
  var phEl = document.getElementById('flyer-phrase');
  return {
    kind: opts.kind,
    url: opts.url || (window.SCOREPLACE_URL || 'https://scoreplace.app'),
    title: opts.title || '',
    subtitle: opts.subtitle || '',
    phrase: phEl ? phEl.value : '',
    content: val('flyer-content', 'full'),
    paper: val('flyer-paper', 'A4'),
    color: val('flyer-color', 'color'),
    orient: val('flyer-orient', 'portrait'),
    logo: opts.logo || '',
    logoRadius: opts.logoRadius || '14%',
    sizes: { logo: num('flyer-logosize', 100), name: num('flyer-namesize', 100), qr: num('flyer-qrsize', 100), text: num('flyer-textsize', 100) }
  };
};

// Renderiza o flyer dentro do iframe de preview, no tamanho real do papel,
// escalado pra caber no espaço disponível. O iframe reproduz fielmente o
// resultado impresso (vw/vh batem com as dimensões da página). rAF throttle.
window._updateFlyerPreview = function() {
  if (window._flyerPreviewRaf) return;
  window._flyerPreviewRaf = requestAnimationFrame(function() {
    window._flyerPreviewRaf = null;
    var frame = document.getElementById('flyer-preview-frame');
    var host = document.getElementById('flyer-preview-host');
    var wrap = document.getElementById('flyer-preview-wrap');
    if (!frame || !host || !wrap) return;
    var o = window._collectFlyerOpts();
    // Assinatura ESTRUTURAL (sem os tamanhos). Se só os sliders mudaram, atualiza
    // só o <style id="flyer-size-style"> dentro do iframe — sem recarregar o
    // documento, então o QR NÃO pisca/desaparece.
    var sig = [o.kind, o.content, o.paper, o.color, o.orient, o.phrase, o.logo ? '1' : '0'].join('|');
    var doc = frame.contentDocument;
    var sizeStyle = doc && doc.getElementById('flyer-size-style');
    if (frame.__flyerSig === sig && sizeStyle) {
      sizeStyle.textContent = _flyerSizeCss(o);
      return;
    }
    frame.__flyerSig = sig;
    frame.srcdoc = _buildFlyerPrintHtml(o);
    // Dimensões do papel em px @96dpi (retrato). Paisagem inverte.
    var PAPER = { A4: [794, 1123], A5: [559, 794], A6: [397, 559], letter: [816, 1056] };
    var dims = PAPER[o.paper] || PAPER.A4;
    var pw = (o.orient === 'landscape') ? dims[1] : dims[0];
    var ph = (o.orient === 'landscape') ? dims[0] : dims[1];
    var availW = Math.max(host.clientWidth - 20, 40);
    var availH = Math.max(host.clientHeight - 20, 40);
    var scale = Math.min(availW / pw, availH / ph);
    frame.style.width = pw + 'px';
    frame.style.height = ph + 'px';
    frame.style.transformOrigin = 'top left';
    frame.style.transform = 'scale(' + scale + ')';
    wrap.style.width = (pw * scale) + 'px';
    wrap.style.height = (ph * scale) + 'px';
  });
};

// Lê o estado atual e abre a janela de impressão.
window._doInvitePrint = function() {
  var o = window._collectFlyerOpts();
  var ov = document.getElementById('flyer-print-overlay');
  if (ov) ov.remove();
  var html = _buildFlyerPrintHtml(o);
  var win = window.open('', '_blank');
  if (!win) {
    if (typeof showNotification === 'function') showNotification('Pop-up bloqueado', 'Permita pop-ups pra imprimir o convite.', 'warning');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = function() { try { win.focus(); win.print(); } catch (e) {} };
  setTimeout(function() { try { win.print(); } catch (e) {} }, 600);
};

function _buildFlyerPrintHtml(o) {
  var esc = function(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  };
  // QR sempre preto sobre branco (lê melhor impresso, em cor ou P&B).
  var qrUrl = window._qrCodeUrl(o.url, 700, false);

  var paperSize = ({ A4: 'A4', A5: 'A5', A6: 'A6', letter: 'letter' })[o.paper] || 'A4';
  var isBW = o.color === 'bw';
  var qrOnly = o.content === 'qr';

  var isLandscape = o.orient === 'landscape';
  var isTourn = o.kind === 'tournament';

  // Tamanhos ajustáveis (só torneio) — os valores em si vivem em _flyerSizeCss,
  // que é injetado num <style> separado e atualizado in-place (sem recarregar
  // o QR). Aqui só decidimos se o logo do torneio aparece (slider 0 = oculto).
  var sz = o.sizes || {};
  var hasTLogo = !!o.logo && (sz.logo == null || Number(sz.logo) > 2);

  // Título principal por tipo de convite. Fontes em clamp(vw) → escalam com o
  // tamanho do papel (A6 menor, A4 maior) mantendo proporção e uma só página.
  var heading = '';
  var sub = '';
  if (o.kind === 'app') {
    // Frase configurável — cada linha vira um parágrafo com peso decrescente.
    var lines = String(o.phrase || window._flyerDefaultAppPhrase()).split('\n').filter(function(l) { return l.trim() !== ''; });
    heading = lines.map(function(l, i) {
      var size = i === 0 ? 'clamp(15pt,5vw,30pt)' : (i === 1 ? 'clamp(12pt,3.6vw,22pt)' : 'clamp(9pt,2.4vw,15pt)');
      var weight = i === 0 ? '800' : (i === 1 ? '700' : '500');
      var col = i === 0 ? '#0f172a' : (i === 1 ? '#4f46e5' : '#475569');
      return '<div style="font-size:' + size + ';font-weight:' + weight + ';color:' + col + ';line-height:1.2;margin:1.5% 0;">' + esc(l) + '</div>';
    }).join('');
  } else if (o.kind === 'casual') {
    heading = '<div style="font-size:clamp(10pt,2.6vw,15pt);font-weight:700;color:#0891b2;letter-spacing:1px;text-transform:uppercase;margin-bottom:1.5%;">⚡ Partida Casual</div>' +
              (o.title ? '<div style="font-size:clamp(14pt,4.6vw,26pt);font-weight:800;color:#0f172a;line-height:1.15;">' + esc(o.title) + '</div>' : '');
    sub = o.subtitle ? '<div style="font-size:clamp(9pt,2.4vw,13pt);color:#475569;margin-top:2%;white-space:pre-line;">' + esc(o.subtitle) + '</div>' : '';
  } else {
    // tournament — nome em destaque (fonte maior, mais respiro acima/abaixo).
    // Logo do torneio à esquerda do nome quando houver; o conjunto fica em
    // ~70% da largura da página. Nomes longos quebram em 2-3 linhas.
    var tLogo = hasTLogo ? '<img class="t-logo" src="' + esc(o.logo) + '" alt="" />' : '';
    heading = '<div class="t-label">🏆 Convite para o torneio</div>' +
              '<div class="name-block' + (hasTLogo ? ' has-logo' : '') + '">' + tLogo +
                '<div class="t-name">' + esc(o.title || 'Torneio') + '</div>' +
              '</div>';
    sub = o.subtitle ? '<div class="t-sub">' + esc(o.subtitle) + '</div>' : '';
  }

  var caption = o.kind === 'tournament' ? 'Escaneie para acessar o torneio'
    : (o.kind === 'casual' ? 'Escaneie para entrar na partida' : 'Escaneie o QR Code para acessar');

  // Corpo do flyer. Em paisagem: logo + texto à esquerda, QR à direita (2 colunas).
  // Em retrato: empilhado e centralizado. Em ambos cabe numa única página.
  var inner;
  if (qrOnly) {
    inner =
      '<div class="qr-wrap"><img class="qr" src="' + esc(qrUrl) + '" alt="QR Code" /></div>' +
      '<div class="caption">' + esc(caption) + '</div>';
  } else {
    inner =
      '<div class="col-main">' +
        '<div class="logo">' + _flyerLogoSvg() + '</div>' +
        '<div class="heading">' + heading + sub + '</div>' +
      '</div>' +
      '<div class="col-qr">' +
        '<div class="qr-wrap"><img class="qr" src="' + esc(qrUrl) + '" alt="QR Code" /></div>' +
        '<div class="caption">' + esc(caption) + '</div>' +
        '<div class="brand">scoreplace.app · Jogue em outro nível</div>' +
      '</div>';
  }

  // Logo scoreplace do topo: SEMPRE ~70% da página (fixo, não-ajustável).
  var logoW = qrOnly ? '78%' : (isLandscape ? '90%' : '78%');
  // QR base (app/casual): formula fixa. Pro torneio o tamanho vem do
  // _flyerSizeCss (slider), injetado num <style> separado que sobrescreve.
  var qrWBase = qrOnly ? 'min(80vw,80vh)' : (isLandscape ? 'min(40vw,60vh)' : 'min(56vw,42vh)');
  var pageDir = (isLandscape && !qrOnly) ? 'row' : 'column';
  var pageGap = (isLandscape && !qrOnly) ? '6%' : '4vh';
  var colCss = (isLandscape && !qrOnly)
    ? '.col-main { flex:1 1 0; width:auto; } .col-qr { flex:0 0 auto; width:auto; }'
    : '.col-main, .col-qr { width:100%; }';

  return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<title>Convite — scoreplace.app</title>' +
    '<style>' +
      '@page { size: ' + paperSize + ' ' + (isLandscape ? 'landscape' : 'portrait') + '; margin: 0; }' +
      '* { box-sizing:border-box; }' +
      'html,body { margin:0; padding:0; height:100%; background:#fff; overflow:hidden; }' +
      'body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
        (isBW ? ' filter:grayscale(100%);' : '') +
        ' -webkit-print-color-adjust:exact; print-color-adjust:exact; }' +
      '.page { width:100%; height:100vh; display:flex; flex-direction:' + pageDir + '; align-items:center; justify-content:center;' +
        ' gap:' + pageGap + '; text-align:center; padding:5%; }' +
      '.col-main, .col-qr { display:flex; flex-direction:column; align-items:center; justify-content:center; min-width:0; }' +
      colCss +
      '.logo { width:100%; margin-bottom:5%; display:flex; justify-content:center; }' +
      '.logo svg { width:' + logoW + '; height:auto; max-height:30vh; }' +
      '.heading { width:96%; }' +
      '.qr-wrap { background:#fff; border:1px solid #e5e7eb; border-radius:5mm; padding:4mm; display:inline-block; }' +
      '.qr { width:' + qrWBase + '; height:auto; display:block; }' +
      '.caption { margin-top:3%; font-size:clamp(8pt,2.2vw,12pt); color:#64748b; }' +
      '.brand { margin-top:4%; font-size:clamp(7pt,1.8vw,9pt); color:#94a3b8; letter-spacing:0.5px; }' +
      // Bloco de nome do torneio (estrutura estática; tamanhos vêm do size-style).
      '.t-label { font-size:clamp(10pt,2.4vw,14pt); font-weight:700; color:#b45309; letter-spacing:1px; text-transform:uppercase; }' +
      '.name-block { width:80%; margin:5vh auto; display:flex; align-items:center; justify-content:center; gap:5%; }' +
      '.name-block.has-logo { text-align:left; }' +
      '.t-logo { width:20vw; max-width:none; height:auto; flex:0 0 auto; border-radius:14%; }' +
      '.t-name { font-size:6vw; font-weight:800; color:#0f172a; line-height:1.12; word-break:break-word; flex:1 1 auto; min-width:0; }' +
      '.name-block.has-logo .t-name { text-align:left; }' +
      '.t-sub { font-size:clamp(9pt,2.4vw,13pt); color:#475569; white-space:pre-line; }' +
    '</style>' +
    // size-style: separado pra ser atualizado IN-PLACE pelos sliders sem
    // recarregar o iframe (e portanto sem o QR piscar/desaparecer).
    '<style id="flyer-size-style">' + _flyerSizeCss(o) + '</style>' +
    '</head><body><div class="page">' + inner + '</div></body></html>';
}

// CSS que depende dos sliders de tamanho (só torneio, flyer completo). Fica
// num <style> separado pra atualização in-place. Sliders são PERCENTUAIS
// (100 = padrão); nome/logo escalam em vw (sem teto de clamp que travava o
// crescimento antes). QR limitado por largura E altura → nunca corta.
function _flyerSizeCss(o) {
  if (o.kind !== 'tournament' || o.content === 'qr') return '';
  var sz = o.sizes || {};
  var isLandscape = o.orient === 'landscape';
  var pLogo = (sz.logo != null ? Number(sz.logo) : 100) / 100;
  var pName = (sz.name != null ? Number(sz.name) : 100) / 100;
  var pQr = (sz.qr != null ? Number(sz.qr) : 100) / 100;
  var scale = (sz.text != null ? Number(sz.text) : 100) / 100;
  var radius = o.logoRadius || '14%';
  var logoBase = isLandscape ? 13 : 20;   // vw
  var nameBase = isLandscape ? 4 : 6;      // vw
  var qrBase = 52 * pQr;                    // vw
  var qrW = isLandscape ? 'min(' + qrBase.toFixed(2) + 'vw,46vw,86vh)' : 'min(' + qrBase.toFixed(2) + 'vw,90vw,86vh)';
  var css =
    '.qr{width:' + qrW + ';}' +
    '.t-logo{width:' + (logoBase * pLogo).toFixed(2) + 'vw;border-radius:' + radius + ';max-width:none;}' +
    '.t-name{font-size:' + (nameBase * pName).toFixed(2) + 'vw;}' +
    '.t-label{font-size:calc(' + scale + ' * clamp(10pt,2.4vw,14pt));}' +
    '.t-sub{font-size:calc(' + scale + ' * clamp(9pt,2.4vw,13pt));}' +
    '.caption{font-size:calc(' + scale + ' * clamp(8pt,2.2vw,12pt));}';
  if (isLandscape) css += '.name-block{width:92%;margin:3vh auto;gap:4%;}';
  return css;
}

// Compat — print "cru" antigo agora abre o flyer configurável do app.
// (Mantido pra não quebrar call sites legados que não passam contexto.)
window._printQRCode = function() {
    window._openInvitePrint({ kind: 'app', url: (window.SCOREPLACE_URL || 'https://scoreplace.app') });
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
