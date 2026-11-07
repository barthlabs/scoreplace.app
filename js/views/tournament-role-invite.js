(function () {
  'use strict';
  var pending = null;
  function hasLogin() { return !!(window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid); }
  function safe(value) { try { return decodeURIComponent(String(value || '')); } catch (_) { return ''; } }
  function status(value) {
    var node = document.querySelector('#sp-role-invite-page [data-role-status]');
    if (node) node.textContent = value;
  }
  window.addEventListener('hashchange', function () {
    if (String(location.hash || '').indexOf('#role-invite/') !== 0) pending = null;
  });
  window.renderTeamEmailInvitePage = function (container, rawId, rawToken) {
    var inviteId = safe(rawId), token = safe(rawToken);
    if (token && /^[a-f0-9]{64}$/.test(token)) pending = { inviteId: inviteId, token: token, busy: false };
    var current = pending && pending.inviteId === inviteId ? pending : null;
    container.innerHTML = '<main id="sp-role-invite-page" class="sp-claim-page">' +
      '<h1>Convite para a equipe do torneio</h1>' +
      (!hasLogin()
        ? '<p>Entre ou crie sua conta com o e-mail ou telefone que recebeu o convite. Confirme esse contato para ativar o acesso.</p>' +
          '<button type="button" class="btn btn-primary" data-role-login>Entrar ou criar conta</button>'
        : '<p data-role-status>' + (current ? 'Conferindo convite…' : 'Reabra o link recebido por e-mail.') + '</p>' +
          '<div data-role-result></div>') + '</main>';
    if (typeof window._reflowChrome === 'function') window._reflowChrome();
    var login = container.querySelector('[data-role-login]');
    if (login) login.addEventListener('click', function () { if (typeof openModal === 'function') openModal('modal-login'); });
    if (!hasLogin() || !current || current.busy || current.done) return;
    if (typeof window._callCF !== 'function') { status('Servidor indisponível.'); return; }
    current.busy = true;
    window._callCF('claimTeamInvite', { inviteId: current.inviteId, token: current.token }, 'Entre para abrir o convite.')
      .then(function (response) {
        if (pending !== current || !document.getElementById('sp-role-invite-page')) return;
        var result = response && response.data;
        if (!result || !result.ok) throw new Error('Convite indisponível.');
        current.done = true;
        history.replaceState(null, '', location.pathname + location.search + '#role-invite/' + encodeURIComponent(inviteId));
        status('Acesso ativado.');
        var target = document.querySelector('#sp-role-invite-page [data-role-result]');
        if (target) {
          var link = document.createElement('a');
          link.className = 'btn btn-primary'; link.textContent = 'Abrir torneio';
          link.href = '#tournaments/' + encodeURIComponent(result.tournamentId);
          target.appendChild(link);
        }
      }).catch(function (error) {
        if (pending === current) status(error && error.message ? error.message : 'Não foi possível abrir o convite.');
      }).finally(function () { current.busy = false; });
  };
})();
