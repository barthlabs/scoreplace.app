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

  function reply(ok, error, count, extra) {
    try {
      var msg = { __sp_lp: 'import-result', ok: !!ok, error: error || null, count: (count != null ? count : null) };
      if (extra && typeof extra === 'object') { for (var k in extra) if (extra.hasOwnProperty(k)) msg[k] = extra[k]; }
      window.postMessage(msg, window.location.origin);
    } catch (e) {}
  }

  // Assinatura estável do CONTEÚDO do import (ignora importedAt/metadados) — pra saber
  // se a reimportação trouxe algo novo. Nomes de torneio entram: se resolveu um nome que
  // antes faltava, é mudança (vale gravar).
  function _contentSig(imp) {
    if (!imp) return '';
    var g = (imp.games || []).map(function (x) {
      return [x.date, x.competition, x.tourneyName || '', x.won, (x.oppHandles || []).join(','), x.partnerHandle || '', x.myScore, x.oppScore].join('~');
    });
    var f = (imp.footprint || []).map(function (x) { return [x.official ? 1 : 0, x.club, x.categoryRaw, x.name || '', x.wins, x.losses].join('~'); });
    return JSON.stringify({ n: g.length, g: g, f: f });
  }

  // Merge que NUNCA regride: escolhe a base mais completa (mais jogos) e preenche os
  // nomes reais de torneio a partir das DUAS versões (um 403 que voltou "0 nomes" não
  // apaga os nomes já resolvidos antes). importedAt sempre vira a hora nova.
  function _mergeImport(prev, next) {
    if (!prev) return next;
    var pn = (prev.games || []).length, nn = (next.games || []).length;
    var base = (nn >= pn) ? next : prev;          // mais completo vence (não perde jogos)
    var nameMap = {};
    function harvest(imp) {
      (imp.games || []).forEach(function (x) {
        if (x.official && x.tourneyName) { var k = (x.club || '') + '|' + (x.competition || '') + '|' + (x.year != null ? x.year : ''); if (!nameMap[k]) nameMap[k] = x.tourneyName; }
      });
      (imp.footprint || []).forEach(function (x) {
        if (x.official && x.name && x.name !== x.categoryRaw) { var k = (x.club || '') + '|' + (x.categoryRaw || '') + '|' + (x.year != null ? x.year : ''); if (!nameMap[k]) nameMap[k] = x.name; }
      });
    }
    harvest(prev); harvest(next);   // nomes das duas fontes
    (base.games || []).forEach(function (x) {
      if (x.official && !x.tourneyName) { var k = (x.club || '') + '|' + (x.competition || '') + '|' + (x.year != null ? x.year : ''); if (nameMap[k]) x.tourneyName = nameMap[k]; }
    });
    (base.footprint || []).forEach(function (x) {
      if (x.official && (!x.name || x.name === x.categoryRaw)) { var k = (x.club || '') + '|' + (x.categoryRaw || '') + '|' + (x.year != null ? x.year : ''); if (nameMap[k]) x.name = nameMap[k]; }
    });
    // carrega stats de nome resolvido, se a nova versão trouxe melhor
    if (next.tourneyNameStats) base.tourneyNameStats = next.tourneyNameStats;
    base.importedAt = next.importedAt || base.importedAt;   // SEMPRE a data/hora nova
    return base;
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

    // Merge preservando o que já existe: reimportação não regride (nomes/jogos) e, se não
    // trouxe nada novo, só atualiza a data/hora. prev = o que já está gravado.
    var prev = (cu.letzplayImport && looksValid(cu.letzplayImport)) ? cu.letzplayImport : null;
    var prevSig = _contentSig(prev);
    imp = _mergeImport(prev, imp);
    var unchanged = !!prev && (_contentSig(imp) === prevSig);   // nada novo → só a data muda

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
        // ESCRITA DUPLA (transição): além do letzplayImport (formato antigo, 1 doc por
        // usuário), grava no canônico — 1 doc por competição, 1 por partida. Os dois
        // convivem até os leitores migrarem e o acervo antigo ser backfillado; o beta não
        // permite trocar schema debaixo de dado existente. Best-effort de propósito: se a
        // escrita canônica falhar, o import do usuário NÃO pode falhar junto.
        if (typeof window._lzHistoryWrite === 'function') {
          window._lzHistoryWrite(imp, imp.handle).then(function (r) {
            window._log && window._log('[lz história] autoimport:', JSON.stringify(r));
          }).catch(function (e) {
            window._log && window._log('[lz história] autoimport falhou (não bloqueia):', (e && e.message) || e);
          });
        }
        if (typeof showNotification === 'function') showNotification(
          unchanged ? '🎾 Nada novo no letzplay' : '🎾 Histórico importado',
          unchanged ? ('@' + imp.handle + ' — sem novidades; só atualizei a data.') : ('@' + imp.handle + ' — ' + gamesCount + ' jogos. Veja em 📊 Estatísticas → Histórico.'),
          'success');
        // Atualiza o que estiver aberto: card nas Estatísticas e/ou a página de Histórico.
        var slot = document.getElementById('letzplay-card-stats-slot');
        if (slot && typeof window._renderLetzplayCard === 'function') slot.innerHTML = window._renderLetzplayCard(cu.letzplayImport);
        // Perfil aberto: refresca o botão de import + "Última atualização" na hora.
        var pslot = document.getElementById('profile-lz-import-slot');
        if (pslot && typeof window._renderProfileLzImportSlot === 'function') pslot.innerHTML = window._renderProfileLzImportSlot();
        if ((window.location.hash || '').indexOf('historico') !== -1 && typeof window._renderHistoricoPage === 'function') {
          try { window._renderHistoricoPage(document.getElementById('view-container')); } catch (e) {}
        }
        reply(true, null, gamesCount, { unchanged: unchanged });
      })
      .catch(function (err) {
        if (typeof showNotification === 'function') showNotification('Erro ao importar', (err && err.message) || 'Tente de novo.', 'error');
        reply(false, (err && err.message) || 'erro-firestore');
      });
  });
})();
