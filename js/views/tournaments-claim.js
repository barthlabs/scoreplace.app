/* Convite individual: apenas a pessoa autenticada confirma a própria inscrição. */
(function () {
  'use strict';
  var claim = null;
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); }
  function call(name, data) {
    if (typeof window._callCF !== 'function') return Promise.reject(new Error('Servidor indisponível'));
    var request;
    if (name === 'listManualClaimInvites') request = window._callCF('listManualClaimInvites', data, 'Entre para reconhecer sua inscrição.');
    else if (name === 'createManualClaimInvite') request = window._callCF('createManualClaimInvite', data, 'Entre para reconhecer sua inscrição.');
    else if (name === 'previewManualClaimInvite') request = window._callCF('previewManualClaimInvite', data, 'Entre para reconhecer sua inscrição.');
    else if (name === 'acceptManualClaimInvite') request = window._callCF('acceptManualClaimInvite', data, 'Entre para reconhecer sua inscrição.');
    else return Promise.reject(new Error('Operação de convite desconhecida'));
    return request.then(function (response) { return response.data; });
  }
  function auth() { return !!(window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid); }
  function page() { return document.getElementById('sp-manual-claim-page'); }
  function status(text) { var node = page() && page().querySelector('[data-claim-status]'); if (node) node.textContent = text; }
  function safeId(value) { try { return decodeURIComponent(String(value || '')); } catch (_) { return ''; } }
  function tokenFromRoute(tournamentId, manualId, token) {
    if (!auth() || !/^[a-f0-9]{64}$/.test(token)) return;
    claim = { tournamentId: tournamentId, manualParticipantId: manualId, token: token, preview: null, busy: false };
    // Depois do login, o segredo fica apenas em memória. replaceState não emite
    // hashchange e não coloca o token no próximo breadcrumb de navegação.
    history.replaceState(null, '', location.pathname + location.search + '#claim-registration/' + encodeURIComponent(tournamentId));
  }
  window.addEventListener('hashchange', function () {
    if (String(location.hash || '').indexOf('#claim-registration/') !== 0) claim = null;
  });
  window.renderClaimRegistrationPage = function (container, rawTournamentId, rawManualId, rawToken) {
    var tournamentId = safeId(rawTournamentId), manualId = safeId(rawManualId), token = String(rawToken || '');
    if (token && auth()) tokenFromRoute(tournamentId, manualId, token);
    var current = claim && claim.tournamentId === tournamentId ? claim : null;
    var header = typeof window._renderBackHeader === 'function' ? window._renderBackHeader({
      href: '#dashboard', label: 'Voltar', middleHtml: '<span>Reconhecer inscrição</span>'
    }) : '';
    container.innerHTML = header + '<main id="sp-manual-claim-page" class="sp-claim-page">' +
      '<h1>Reconhecer minha inscrição</h1>' +
      (!auth() ? '<p>Entre ou crie sua conta para conferir a inscrição recebida por convite.</p>' +
        '<button type="button" class="btn btn-primary" data-claim-login>Entrar ou criar conta</button>' :
        (!current ? '<p>O convite não está mais nesta sessão. Reabra o link enviado pelo organizador.</p>' :
          '<p data-claim-status>Conferindo convite…</p><div data-claim-details></div>')) + '</main>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
    var loginButton = page() && page().querySelector('[data-claim-login]');
    if (loginButton) loginButton.addEventListener('click', function () { if (typeof openModal === 'function') openModal('modal-login'); });
    if (!current) return;
    if (current.done) { showDone(current); return; }
    if (current.preview) { showPreview(current); return; }
    call('previewManualClaimInvite', { tournamentId: tournamentId, manualParticipantId: current.manualParticipantId, token: current.token })
      .then(function (preview) {
        if (claim !== current || !page()) return;
        current.preview = preview; showPreview(current);
      }).catch(function (error) { if (claim === current) status(error.message || 'Convite indisponível. Peça outro link ao organizador.'); });
  };
  function showDone(current) {
    if (!page() || claim !== current) return;
    status('Inscrição vinculada à sua conta.');
    var details = page().querySelector('[data-claim-details]');
    if (details) details.innerHTML = '<a class="btn btn-primary" href="#tournaments/' + encodeURIComponent(current.tournamentId) + '">Ver torneio</a>';
  }
  function showPreview(current) {
    if (!page() || claim !== current) return;
    status('Confira o nome antes de vincular sua conta.');
    var details = page().querySelector('[data-claim-details]');
    if (!details) return;
    details.innerHTML = '<div class="sp-claim-person"><strong>' + esc(current.preview.name) + '</strong>' +
      '<span>' + esc(current.preview.tournamentName) + ' · ' + esc(current.preview.categoryId) + '</span></div>' +
      '<p>Confirme somente se esta inscrição é sua. Sua conta substituirá a vaga manual nesta dupla.</p>' +
      '<button type="button" class="btn btn-primary" data-claim-accept>Sou esta pessoa — vincular minha conta</button>';
    details.querySelector('[data-claim-accept]').addEventListener('click', function (event) {
      if (current.busy) return;
      current.busy = true; event.currentTarget.disabled = true; status('Vinculando sua conta…');
      call('acceptManualClaimInvite', { tournamentId: current.tournamentId,
        manualParticipantId: current.manualParticipantId, token: current.token })
        .then(function () {
          if (claim !== current || !page()) return;
          current.token = ''; current.done = true; showDone(current);
        }).catch(function (error) {
          if (claim !== current || !page()) return;
          current.busy = false; status(error.message || 'Não foi possível vincular a inscrição.');
          var button = details.querySelector('[data-claim-accept]'); if (button) button.disabled = false;
        });
    });
  }

  var organizer = null;
  window._openManualClaimInvites = function (tournamentId) {
    if (typeof window._closeParticipantTools === 'function') window._closeParticipantTools();
    var old = document.getElementById('sp-manual-invites-dialog'); if (old) old.remove();
    var dialog = document.createElement('div'); dialog.id = 'sp-manual-invites-dialog'; dialog.className = 'sp-manual-invites-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', 'Links de reconhecimento');
    dialog.innerHTML = '<div class="sp-manual-invites-panel"><header><h2>Links de reconhecimento</h2><button type="button" data-close aria-label="Fechar">×</button></header>' +
      '<p>Crie um link individual e envie à pessoa correta. Um novo link revoga o anterior.</p><div data-invite-list>Consultando inscritos…</div></div>';
    document.body.appendChild(dialog);
    organizer = { tournamentId: String(tournamentId), dialog: dialog };
    dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.remove(); if (organizer && organizer.dialog === dialog) organizer = null; });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) { dialog.remove(); organizer = null; } });
    call('listManualClaimInvites', { tournamentId: String(tournamentId) }).then(function (data) {
      if (!organizer || organizer.dialog !== dialog) return;
      var list = dialog.querySelector('[data-invite-list]');
      if (!data.canInvite) { list.textContent = 'O sorteio já ocorreu; a identidade não pode ser trocada por este fluxo.'; return; }
      if (!Array.isArray(data.people) || !data.people.length) { list.textContent = 'Nenhuma inscrição manual nomeada aguarda vínculo.'; return; }
      list.textContent = '';
      data.people.forEach(function (person) {
        var row = document.createElement('div'); row.className = 'sp-manual-invite-row';
        row.innerHTML = '<div><strong>' + esc(person.name) + '</strong><small>' + esc(person.categoryId) + '</small></div>' +
          '<button type="button" class="btn btn-secondary">Criar link</button><div class="sp-manual-invite-result" role="status"></div>';
        row.querySelector('button').addEventListener('click', function (event) {
          var button = event.currentTarget, result = row.querySelector('.sp-manual-invite-result');
          button.disabled = true; result.textContent = 'Criando link…';
          call('createManualClaimInvite', { tournamentId: String(tournamentId), manualParticipantId: person.manualParticipantId })
            .then(function (created) {
              if (!organizer || organizer.dialog !== dialog) return;
              var url = (window.SCOREPLACE_URL || location.origin) + '/#claim-registration/' +
                encodeURIComponent(tournamentId) + '/' + encodeURIComponent(person.manualParticipantId) + '/' + created.token;
              result.textContent = '';
              var copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn btn-primary';
              copy.textContent = 'Copiar link individual';
              var linkField = document.createElement('input'); linkField.type = 'text'; linkField.readOnly = true;
              linkField.className = 'sp-manual-invite-link'; linkField.value = url;
              linkField.setAttribute('aria-label', 'Link individual de ' + person.name);
              copy.addEventListener('click', function () {
                if (!navigator.clipboard || !navigator.clipboard.writeText) { linkField.select(); return; }
                navigator.clipboard.writeText(url).then(function () { copy.textContent = 'Link copiado'; })
                  .catch(function () { linkField.select(); copy.textContent = 'Selecione e copie o link'; });
              });
              result.appendChild(linkField); result.appendChild(copy); button.disabled = false;
            }).catch(function (error) { result.textContent = error.message || 'Não foi possível criar o link.'; button.disabled = false; });
        });
        list.appendChild(row);
      });
    }).catch(function (error) { if (organizer && organizer.dialog === dialog) dialog.querySelector('[data-invite-list]').textContent = error.message || 'Lista indisponível.'; });
  };
})();
