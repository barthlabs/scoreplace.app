// Inscrição paga com recebimento direto: o servidor calcula o valor, grava a
// pendência e só a conferência da organização confirma a vaga.
(function () {
  'use strict';
  function node(tag, text) { var el = document.createElement(tag); if (text != null) el.textContent = text; return el; }
  function money(cents, currency) {
    var code = /^[A-Z]{3}$/.test(String(currency || '')) ? currency : 'BRL';
    try { return new Intl.NumberFormat('pt-BR', { style:'currency', currency:code }).format(cents / 100); }
    catch (_) { return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(cents / 100); }
  }
  function button(label, onClick) {
    var el = node('button', label); el.type = 'button'; el.className = 'btn btn-primary';
    el.onclick = onClick; return el;
  }
  function message(title, detail, kind) {
    if (typeof window.showNotification === 'function') window.showNotification(title, detail, kind);
  }
  var localQrPromise = null;
  function localQr() {
    if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
    if (localQrPromise) return localQrPromise;
    localQrPromise = new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = 'js/domain/vendor/qrcode-generator-2.0.4.js?v=2.5.80';
      script.onload = function () {
        if (typeof window.qrcode === 'function') resolve(window.qrcode);
        else reject(new Error('Gerador de QR indisponível.'));
      };
      script.onerror = function () { reject(new Error('Não foi possível carregar o QR Pix.')); };
      document.head.append(script);
    }).catch(function (error) { localQrPromise = null; throw error; });
    return localQrPromise;
  }
  window._openTournamentRegistrationPayment = async function (tournamentId) {
    var old = document.getElementById('registration-payment-overlay'); if (old) old.remove();
    var overlay = node('div'); overlay.id = 'registration-payment-overlay'; overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '10012';
    var panel = node('section'); panel.className = 'sp-fee-panel';
    panel.style.maxWidth = '620px'; panel.style.maxHeight = '90vh'; panel.style.overflowY = 'auto';
    var header = node('div'); header.className = 'sp-fee-heading';
    header.append(node('h2', 'Pagamento da inscrição'), button('Fechar', function () { overlay.remove(); }));
    var body = node('div', 'Carregando'); body.className = 'sp-fee-body';
    panel.append(header, body); overlay.append(panel); document.body.append(overlay);
    overlay.onclick = function (event) { if (event.target === overlay) overlay.remove(); };
    async function reload() {
      if (!overlay.isConnected) return;
      try {
        var response = await window._callCF('getMyTournamentRegistrationPayments', { tournamentId:tournamentId }, 'Entre na sua conta para gerenciar o pagamento.');
        if (response.data && response.data.paymentMethods && response.data.paymentMethods.organizerPixKey) {
          try { await localQr(); } catch (_) { /* O copia e cola permanece disponível. */ }
        }
        if (overlay.isConnected) paint(response.data || {});
      } catch (error) { body.textContent = error.message || 'Não foi possível carregar o pagamento.'; }
    }
    function paint(data) {
      body.replaceChildren();
      var entries = Array.isArray(data.payments) ? data.payments : [];
      if (!entries.length) { body.append(node('p', 'Não há pagamento pendente nesta conta.')); return; }
      body.append(node('p', 'A inscrição fica pendente até o pagamento ser conferido pela organização. Confira o nome do recebedor no aplicativo do seu banco antes de pagar.'));
      entries.forEach(function (entry) {
        var card = node('section'); card.className = 'sp-fee-terms';
        card.style.marginBottom = '16px';
        card.append(node('h3', String(entry.category || 'Categoria') + ' · ' + money(Number(entry.amountCents || 0), entry.currency)));
        if (entry.state === 'paid') {
          card.append(node('p', entry.status === 'confirmed' ? 'Pagamento confirmado. Inscrição confirmada.' : 'Pagamento confirmado. A categoria ainda aguarda validação.'));
        } else if (entry.state === 'proof_submitted') {
          card.append(node('p', 'Comprovante enviado' + (entry.paymentMethod === 'organizer_pix' ? ' por Pix' : entry.paymentMethod === 'organizer_link' ? ' pelo link' : '') + '. A organização vai conferir o recebimento.'));
        } else {
          if (entry.state === 'rejected') card.append(node('p', 'O comprovante anterior não foi aceito. Envie outro após conferir o pagamento.'));
          var methods = data.paymentMethods || {};
          if (methods.organizerPixKey) {
            var code = window.ScoreplacePixBRCode.build(String(methods.organizerPixKey), Number(entry.amountCents),
              String(methods.organizerPixName || ''), String(methods.organizerPixCity || ''));
            if (typeof window.qrcode === 'function') {
              try {
                var generator = window.qrcode(0, 'M');
                generator.addData(code); generator.make();
                var qr = node('img'); qr.alt = 'QR Pix da inscrição'; qr.width = 180; qr.height = 180;
                qr.style.cssText = 'display:block;background:white;padding:8px;border-radius:8px;margin:10px 0';
                qr.src = generator.createDataURL(4, 12);
                card.append(qr);
              } catch (_) { card.append(node('p', 'QR indisponível. Use o Pix copia e cola abaixo.')); }
            } else card.append(node('p', 'QR indisponível. Use o Pix copia e cola abaixo.'));
            card.append(node('p', 'Recebedor: ' + methods.organizerPixName + ' · ' + methods.organizerPixCity),
              node('p', 'Chave Pix: ' + methods.organizerPixKey));
            card.append(button('Copiar Pix copia e cola', function () {
              navigator.clipboard.writeText(code).then(function () { message('Pix copiado', 'Confira o recebedor antes de confirmar no banco.', 'success'); });
            }));
          }
          if (methods.organizerPaymentUrl) {
            card.append(node('p', 'Link da organização: confirme que a página de pagamento cobra exatamente '
              + money(Number(entry.amountCents || 0), entry.currency) + '. Se mostrar outro valor, não conclua o pagamento.'));
            var link = node('a', 'Abrir link de pagamento da organização');
            link.href = methods.organizerPaymentUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.style.cssText = 'display:block;color:#93c5fd;margin:12px 0'; card.append(link);
          }
          var methodLabel = node('label', 'Como você pagou?');
          methodLabel.style.cssText = 'display:block;margin:16px 0 6px';
          var methodSelect = node('select');
          methodSelect.style.cssText = 'display:block;width:100%;box-sizing:border-box;padding:12px;background:#111827;color:#fff;border:1px solid #64748b;border-radius:8px;font-size:16px';
          var options = [];
          if (methods.organizerPixKey) options.push(['organizer_pix', 'Pix da organização']);
          if (methods.organizerPaymentUrl) options.push(['organizer_link', 'Link da organização']);
          if (options.length > 1) { var placeholder = node('option', 'Selecione o meio usado'); placeholder.value = ''; methodSelect.append(placeholder); }
          options.forEach(function (option) { var item = node('option', option[1]); item.value = option[0]; methodSelect.append(item); });
          var label = node('label', 'Enviar comprovante (imagem ou PDF, até 10 MB)');
          label.style.cssText = 'display:block;margin:14px 0 6px';
          var file = node('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,application/pdf';
          file.style.cssText = 'display:block;max-width:100%;margin-bottom:10px;color:#fff';
          var submit = button('Enviar comprovante', async function () {
            if (!methodSelect.value) { message('Selecione o pagamento', 'Indique se pagou por Pix ou pelo link da organização.', 'error'); return; }
            var chosen = file.files && file.files[0];
            if (!chosen || chosen.size <= 0 || chosen.size > 10 * 1024 * 1024
              || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
                'application/pdf'].includes(String(chosen.type || '').toLowerCase())) {
              message('Escolha um comprovante', 'Use imagem ou PDF de até 10 MB.', 'error'); return;
            }
            var user = firebase.auth().currentUser;
            if (!user) { message('Entre na conta', 'Faça login antes de enviar.', 'error'); return; }
            submit.disabled = true; submit.textContent = 'Enviando…';
            try {
              var bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
              var proofId = Array.from(bytes).map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
              var path = 'tournamentPaymentProofs/' + tournamentId + '/' + user.uid + '/' + proofId;
              var storage = await window._carregaSdkStorage();
              await storage.ref().child(path).put(chosen, { contentType:chosen.type });
              await window._callCF('submitTournamentPaymentProof', {
                tournamentId:tournamentId, registrationId:entry.registrationId, proofPath:path,
                paymentMethod:methodSelect.value
              }, 'Entre na sua conta para gerenciar o pagamento.');
              message('Comprovante enviado', 'A inscrição permanece pendente até a conferência.', 'success');
              await reload();
            } catch (error) {
              message('Comprovante não vinculado', error.message || 'Tente novamente.', 'error');
              submit.disabled = false; submit.textContent = 'Enviar comprovante';
            }
          });
          card.append(methodLabel, methodSelect, label, file, submit);
        }
        body.append(card);
      });
    }
    await reload();
  };
  window._openTournamentPaymentReview = async function (tournamentId) {
    var old = document.getElementById('payment-review-overlay'); if (old) old.remove();
    var overlay = node('div'); overlay.id = 'payment-review-overlay'; overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '10012';
    var panel = node('section'); panel.className = 'sp-fee-panel';
    panel.style.maxWidth = '700px'; panel.style.maxHeight = '90vh'; panel.style.overflowY = 'auto';
    var header = node('div'); header.className = 'sp-fee-heading';
    header.append(node('h2', 'Conferir pagamentos'), button('Fechar', function () { overlay.remove(); }));
    var body = node('div', 'Carregando'); body.className = 'sp-fee-body';
    panel.append(header, body); overlay.append(panel); document.body.append(overlay);
    overlay.onclick = function (event) { if (event.target === overlay) overlay.remove(); };
    async function reload(cursor, append) {
      if (!overlay.isConnected) return;
      try {
        var response = await window._callCF('listTournamentPaymentProofs', { tournamentId:tournamentId, cursor:cursor || null }, 'Entre na sua conta para gerenciar o pagamento.');
        if (!overlay.isConnected) return;
        if (!append) body.replaceChildren();
        var entries = response.data && response.data.payments || [];
        if (!entries.length && !append) { body.append(node('p', 'Nenhum comprovante aguardando conferência.')); return; }
        if (!append) body.append(node('p', 'Confira o recebimento na conta da organização antes de aprovar. O comprovante, sozinho, não prova a quitação.'));
        entries.forEach(function (entry) {
          var card = node('section'); card.className = 'sp-fee-terms'; card.style.marginBottom = '14px';
          card.append(node('h3', String(entry.participantName || 'Participante')),
            node('p', String(entry.category || '') + ' · ' + money(Number(entry.amountCents || 0), entry.currency)),
            node('p', entry.paymentMethod === 'organizer_pix' ? 'Meio informado: Pix da organização'
              : entry.paymentMethod === 'organizer_link' ? 'Meio informado: link da organização'
              : 'Meio de pagamento não informado'));
          var proof = node('a', 'Abrir comprovante'); proof.href = '#'; proof.target = '_blank';
          proof.rel = 'noopener noreferrer'; proof.style.color = '#93c5fd';
          proof.onclick = async function (event) {
            event.preventDefault();
            var opened = window.open('', '_blank');
            try {
              var storage = await window._carregaSdkStorage();
              var url = await storage.ref().child(entry.proofPath).getDownloadURL();
              if (opened) opened.location = url; else window.open(url, '_blank', 'noopener');
            } catch (error) { if (opened) opened.close(); message('Não foi possível abrir', error.message || 'Tente novamente.', 'error'); }
          };
          var evidence = node('textarea'); evidence.placeholder = 'Registro da conferência ou motivo da recusa (mínimo 8 caracteres)';
          evidence.maxLength = 500; evidence.style.cssText = 'display:block;width:100%;min-height:70px;box-sizing:border-box;margin:10px 0;background:#111827;color:#fff;border:1px solid #64748b;border-radius:8px;padding:10px';
          async function decide(action, clicked) {
            if (evidence.value.trim().length < 8) { message('Informe a conferência', 'Registre o que foi verificado ou o motivo da recusa.', 'error'); return; }
            clicked.disabled = true;
            try {
              await window._callCF('reviewTournamentPaymentProof', { tournamentId:tournamentId,
                registrationId:entry.registrationId, action:action, evidence:evidence.value.trim() }, 'Entre na sua conta para gerenciar o pagamento.');
              message(action === 'approve' ? 'Pagamento confirmado' : 'Comprovante recusado',
                action === 'approve' ? 'A inscrição elegível foi confirmada.' : 'A pessoa poderá enviar outro comprovante.', 'success');
              await reload();
            } catch (error) { message('Conferência não salva', error.message || 'Tente novamente.', 'error'); clicked.disabled = false; }
          }
          var approve = button('Confirmar recebimento', function () { decide('approve', approve); });
          var reject = button('Recusar comprovante', function () { decide('reject', reject); });
          reject.className = 'btn btn-danger'; reject.style.marginLeft = '8px';
          card.append(proof, evidence, approve, reject); body.append(card);
        });
        if (response.data && response.data.nextCursor) {
          var more = button('Carregar mais comprovantes', function () {
            more.disabled = true; more.textContent = 'Carregando';
            reload(response.data.nextCursor, true).then(function (loaded) {
              if (loaded) more.remove();
              else { more.disabled = false; more.textContent = 'Tentar carregar mais'; }
            });
          });
          body.append(more);
        }
        return true;
      } catch (error) {
        if (append) message('Lista incompleta', error.message || 'Não foi possível carregar mais comprovantes.', 'error');
        else body.textContent = error.message || 'Não foi possível carregar os comprovantes.';
        return false;
      }
    }
    await reload();
  };
})();
