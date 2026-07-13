/* letzplay-bridge.js — recebe o letzplayImport da EXTENSÃO (via window.postMessage do
 * content script dela) e grava no doc do PRÓPRIO usuário logado. Self-write: as regras
 * do Firestore permitem o usuário gravar o próprio users/{uid}. Valida + confere o @.
 *
 * Devolve o RESULTADO REAL da gravação via postMessage {__sp_lp:'import-result', ok, error,
 * count} — o content script da extensão espera esse retorno pra o popup mostrar sucesso/erro
 * honesto (antes o popup dizia "Enviado" mesmo se falhasse por estar deslogado).
 */
(function () {
  function looksValid(imp) {
    return imp && typeof imp === 'object' && imp.source === 'letzplay'
      && typeof imp.handle === 'string' && imp.handle
      && Array.isArray(imp.footprint) && Array.isArray(imp.observations);
  }

  function reply(ok, error, count) {
    try {
      window.postMessage({ __sp_lp: 'import-result', ok: !!ok, error: error || null, count: (count != null ? count : null) }, window.location.origin);
    } catch (e) {}
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;              // só mensagens desta página (content script posta aqui)
    var d = e.data;
    if (!d || d.__sp_lp !== 'import' || !d.letzplayImport) return;
    var imp = d.letzplayImport;
    if (!looksValid(imp)) {
      if (window._warn) window._warn('[letzplay-bridge] import malformado');
      reply(false, 'malformado'); return;
    }

    var cu = window.AppStore && window.AppStore.currentUser;
    if (!cu || !cu.uid || !window.firebase || !window.firebase.firestore) {
      if (typeof showNotification === 'function') showNotification('Faça login', 'Entre no scoreplace pra importar seu histórico.', 'warning');
      reply(false, 'sem-login'); return;
    }
    // Segurança: só grava o PRÓPRIO doc; e o @ importado tem que bater com o do perfil (se declarado).
    if (cu.letzplayHandle && imp.handle && String(cu.letzplayHandle).toLowerCase() !== String(imp.handle).toLowerCase()) {
      if (typeof showNotification === 'function') showNotification('Conta diferente', 'O @ importado (' + imp.handle + ') não é o do seu perfil (' + cu.letzplayHandle + ').', 'warning');
      reply(false, 'conta-diferente'); return;
    }

    var gamesCount = Array.isArray(imp.games) ? imp.games.length : 0;
    // Procedência: self-import. Limpa atribuição de organizador (se havia) — o dono mandou.
    imp.importedVia = 'self';
    imp.importedByName = null;
    imp.importedTournamentName = null;
    var payload = { letzplayImport: imp };
    if (!cu.letzplayHandle) payload.letzplayHandle = imp.handle;   // preenche o @ se ainda não tinha
    window.firebase.firestore().collection('users').doc(cu.uid)
      .set(payload, { merge: true })
      .then(function () {
        cu.letzplayImport = imp;
        if (!cu.letzplayHandle) cu.letzplayHandle = imp.handle;
        if (typeof showNotification === 'function') showNotification('🎾 Histórico importado', '@' + imp.handle + ' — ' + gamesCount + ' jogos. Veja em 📊 Estatísticas → Histórico.', 'success');
        // Atualiza o que estiver aberto: card nas Estatísticas e/ou a página de Histórico.
        var slot = document.getElementById('letzplay-card-stats-slot');
        if (slot && typeof window._renderLetzplayCard === 'function') slot.innerHTML = window._renderLetzplayCard(cu.letzplayImport);
        if ((window.location.hash || '').indexOf('historico') !== -1 && typeof window._renderHistoricoPage === 'function') {
          try { window._renderHistoricoPage(document.getElementById('view-container')); } catch (e) {}
        }
        reply(true, null, gamesCount);
      })
      .catch(function (err) {
        if (typeof showNotification === 'function') showNotification('Erro ao importar', (err && err.message) || 'Tente de novo.', 'error');
        reply(false, (err && err.message) || 'erro-firestore');
      });
  });
})();
