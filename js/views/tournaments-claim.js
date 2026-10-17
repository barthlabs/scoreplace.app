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
    else if (['createTournamentClaimLink', 'previewTournamentClaimLink', 'acceptTournamentClaimLink'].indexOf(name) !== -1)
      request = window._callCF(name, data, 'Entre para reconhecer sua vaga.');
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

  var shared = null;
  window.addEventListener('hashchange', function () {
    if (String(location.hash || '').indexOf('#tournament-claim/') !== 0) shared = null;
  });
  function sharedPage() { return document.getElementById('sp-tournament-claim-page'); }
  function sharedStatus(value) {
    var node = sharedPage() && sharedPage().querySelector('[data-shared-status]');
    if (node) node.textContent = value;
  }
  window.renderTournamentClaimPage = function (container, rawTournamentId, rawToken, rawSandbox) {
    var tournamentId = safeId(rawTournamentId), token = String(rawToken || '');
    var sandbox = rawSandbox === 'sandbox';
    if (token && auth() && /^[a-f0-9]{64}$/.test(token)) {
      shared = { tournamentId: tournamentId, token: token, sandbox: sandbox, busy: false };
      history.replaceState(null, '', location.pathname + location.search + '#tournament-claim/' + encodeURIComponent(tournamentId));
    }
    var current = shared && shared.tournamentId === tournamentId ? shared : null;
    var header = typeof window._renderBackHeader === 'function' ? window._renderBackHeader({
      href: '#dashboard', label: 'Voltar', middleHtml: '<span>Reconhecer vaga no torneio</span>'
    }) : '';
    container.innerHTML = header + '<main id="sp-tournament-claim-page" class="sp-claim-page">' +
      '<h1>Reconhecer minha dupla</h1>' +
      (!auth() ? '<p>Entre ou crie sua conta para conferir sua vaga.</p><button type="button" class="btn btn-primary" data-shared-login>Entrar ou criar conta</button>' :
        (!current ? '<p>O link não está mais nesta sessão. Reabra o link enviado pelo organizador.</p>' :
          '<p data-shared-status>Conferindo sua dupla…</p><div data-shared-details></div>')) + '</main>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
    var login = sharedPage() && sharedPage().querySelector('[data-shared-login]');
    if (login) login.addEventListener('click', function () { if (typeof openModal === 'function') openModal('modal-login'); });
    if (!current) return;
    if (current.preview) { showSharedPreview(current); return; }
    call('previewTournamentClaimLink', { tournamentId: tournamentId, token: current.token, sandbox: current.sandbox })
      .then(function (result) { if (shared !== current || !sharedPage()) return; current.preview = result; showSharedPreview(current); })
      .catch(function (error) { if (shared === current) sharedStatus(error.message || 'Link indisponível.'); });
  };
  function showSharedPreview(current) {
    if (!sharedPage() || shared !== current) return;
    var details = sharedPage().querySelector('[data-shared-details]');
    if (!details) return;
    var preview = current.preview;
    if (preview.alreadyRegistered) {
      sharedStatus('Você já está nesta dupla.');
      details.innerHTML = '<div class="sp-claim-person"><strong>' + esc(preview.tournamentName) + '</strong><span>' +
        esc(preview.pair.categoryId) + ' · ' + esc(preview.pair.name) + ' + ' + esc(preview.pair.partnerName) + '</span></div>';
      return;
    }
    var candidates = Array.isArray(preview.candidates) ? preview.candidates : [];
    if (!candidates.length) {
      sharedStatus('Nenhuma vaga com seu nome de perfil foi encontrada. Peça ao organizador para conferir o nome digitado na Análise.');
      return;
    }
    sharedStatus('Confira a dupla antes de vincular sua conta.');
    details.innerHTML = '<p>' + esc(preview.tournamentName) + '</p>' + candidates.map(function (item, i) {
      return '<div class="sp-claim-person"><strong>' + esc(item.name) + '</strong><span>' + esc(item.categoryId) +
        ' · Parceiro(a): ' + esc(item.partnerName) + '</span><button type="button" class="btn btn-primary" data-shared-choice="' +
        i + '">Sou esta pessoa — ocupar vaga</button></div>';
    }).join('');
    details.querySelectorAll('[data-shared-choice]').forEach(function (button) {
      button.addEventListener('click', function () {
        if (current.busy) return;
        var selected = candidates[Number(button.getAttribute('data-shared-choice'))];
        if (!selected) return;
        current.busy = true;
        details.querySelectorAll('button').forEach(function (item) { item.disabled = true; });
        sharedStatus('Vinculando sua conta…');
        call('acceptTournamentClaimLink', { tournamentId: current.tournamentId, token: current.token,
          sandbox: current.sandbox, manualParticipantId: selected.manualParticipantId })
          .then(function (result) {
            if (shared !== current || !sharedPage()) return;
            current.preview = { alreadyRegistered: true, pair: result.pair, tournamentName: preview.tournamentName };
            current.token = ''; showSharedPreview(current);
          }).catch(function (error) {
            if (shared !== current || !sharedPage()) return;
            current.busy = false;
            sharedStatus(error.message || 'Não foi possível ocupar a vaga.');
            details.querySelectorAll('button').forEach(function (item) { item.disabled = false; });
          });
      });
    });
  }

  window._openTournamentClaimLink = function (tournamentId, sandbox) {
    var old = document.getElementById('sp-shared-claim-dialog'); if (old) old.remove();
    var dialog = document.createElement('div'); dialog.id = 'sp-shared-claim-dialog'; dialog.className = 'sp-manual-invites-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-label', 'Link de reconhecimento de vagas');
    dialog.innerHTML = '<div class="sp-manual-invites-panel"><header><h2>Vincular contas às vagas</h2><button type="button" data-close aria-label="Fechar">×</button></header>' +
      '<p>Um link para todas as pessoas já inscritas. Compartilhe apenas com elas: nome de perfil não é prova de identidade. Gerar outro link revoga este.</p>' +
      '<div data-result role="status">Gerando link…</div></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('[data-close]').addEventListener('click', function () { dialog.remove(); });
    dialog.addEventListener('click', function (event) { if (event.target === dialog) dialog.remove(); });
    call('createTournamentClaimLink', { tournamentId: tournamentId, sandbox: !!sandbox }).then(function (created) {
      if (!dialog.isConnected) return;
      var url = (window.SCOREPLACE_URL || location.origin) + '/#tournament-claim/' + encodeURIComponent(tournamentId) + '/' +
        created.token + (sandbox ? '/sandbox' : '');
      var result = dialog.querySelector('[data-result]'); result.textContent = '';
      var field = document.createElement('input'); field.type = 'text'; field.readOnly = true;
      field.className = 'sp-manual-invite-link'; field.value = url; field.setAttribute('aria-label', 'Link de reconhecimento das vagas');
      var copy = document.createElement('button'); copy.type = 'button'; copy.className = 'btn btn-primary'; copy.textContent = 'Copiar link';
      copy.addEventListener('click', function () {
        if (!navigator.clipboard || !navigator.clipboard.writeText) { field.select(); return; }
        navigator.clipboard.writeText(url).then(function () { copy.textContent = 'Link copiado'; })
          .catch(function () { field.select(); copy.textContent = 'Selecione e copie o link'; });
      });
      result.appendChild(field); result.appendChild(copy);
    }).catch(function (error) { if (dialog.isConnected) dialog.querySelector('[data-result]').textContent = error.message || 'Não foi possível gerar o link.'; });
  };
})();
