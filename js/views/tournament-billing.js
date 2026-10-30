// Cobrança da organização: UI de leitura/ações. A Function determina valores,
// desconto e quitação; nenhum campo deste painel é fonte de verdade.
(function () {
  'use strict';
  var money = function(cents) { return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(Number(cents || 0) / 100); };
  var call = async function(name, data) {
    if (typeof window._callCF !== 'function') throw new Error('Atualize o aplicativo.');
    var message = 'Entre na sua conta para ver a cobrança.';
    var result;
    if (name === 'getTournamentFeeStatus') result = await window._callCF('getTournamentFeeStatus', data, message);
    else if (name === 'acceptTournamentFeeTerms') result = await window._callCF('acceptTournamentFeeTerms', data, message);
    else if (name === 'prepareTournamentFee') result = await window._callCF('prepareTournamentFee', data, message);
    else if (name === 'reportTournamentFeePix') result = await window._callCF('reportTournamentFeePix', data, message);
    else if (name === 'listTournamentFeePixReports') result = await window._callCF('listTournamentFeePixReports', data, message);
    else if (name === 'getTournamentFinanceAdminStatus') result = await window._callCF('getTournamentFinanceAdminStatus', data, message);
    else if (name === 'confirmTournamentFeePix') result = await window._callCF('confirmTournamentFeePix', data, message);
    else if (name === 'rejectTournamentFeePixReport') result = await window._callCF('rejectTournamentFeePixReport', data, message);
    else if (name === 'startTournamentFeeCheckout') result = await window._callCF('startTournamentFeeCheckout', data, message);
    else if (name === 'cancelTournamentFeeCardAttempt') result = await window._callCF('cancelTournamentFeeCardAttempt', data, message);
    else throw new Error('Ação de cobrança desconhecida.');
    return result.data || {};
  };
  var el = function(tag, className, content) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  };
  var line = function(parent, title, value) {
    var row = el('div', 'sp-fee-row');
    row.append(el('span', '', title), el('strong', '', value));
    parent.append(row);
  };
  var button = function(text, action, secondary) {
    var btn = el('button', secondary ? 'btn sp-fee-secondary' : 'btn btn-primary', text);
    btn.type = 'button'; btn.onclick = action; return btn;
  };
  var qrLoader;
  var loadQr = function() {
    if (typeof window.qrcode === 'function') return Promise.resolve(window.qrcode);
    if (qrLoader) return qrLoader;
    qrLoader = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'js/domain/vendor/qrcode-generator-2.0.4.js?v=2.5.80';
      script.onload = function() {
        if (typeof window.qrcode === 'function') resolve(window.qrcode);
        else reject(new Error('Gerador de QR indisponível.'));
      };
      script.onerror = function() { reject(new Error('Gerador de QR indisponível.')); };
      document.head.append(script);
    }).catch(function(error) { qrLoader = null; throw error; });
    return qrLoader;
  };
  window._renderTournamentFinanceAdminEntry = async function(container) {
    if (!container || !container.isConnected) return;
    var userId = window.AppStore && window.AppStore.currentUser && window.AppStore.currentUser.uid;
    if (!userId) return;
    try {
      var status = await call('getTournamentFinanceAdminStatus', {});
      if (!status.financeAdmin || !container.isConnected
        || !window.AppStore || !window.AppStore.currentUser
        || window.AppStore.currentUser.uid !== userId) return;
      var entry = el('div', 'sp-fee-admin-entry');
      entry.append(button('Conferir Pix dos torneios', function() {
        window._openTournamentFeePixQueue();
      }));
      container.append(entry);
    } catch (_) { /* Perfil continua utilizável se a consulta financeira falhar. */ }
  };
  window._openTournamentFeeModal = async function(tournamentId) {
    var old = document.getElementById('tournament-fee-overlay');
    if (old) old.remove();
    var overlay = el('div', 'modal-overlay active');
    overlay.id = 'tournament-fee-overlay';
    overlay.style.zIndex = '10010';
    var panel = el('div', 'sp-fee-panel');
    var heading = el('div', 'sp-fee-heading');
    heading.append(el('h2', '', 'Taxa do torneio'), button('Fechar', function() { overlay.remove(); }, true));
    var body = el('div', 'sp-fee-body', 'Carregando');
    panel.append(heading, body); overlay.append(panel); document.body.append(overlay);
    overlay.onclick = function(event) { if (event.target === overlay) overlay.remove(); };
    var busy = false;
    var refresh = async function() {
      if (!overlay.isConnected) return;
      try { paint(await call('getTournamentFeeStatus', { tournamentId:tournamentId })); }
      catch (error) { body.textContent = error.message || 'Não foi possível carregar a cobrança.'; }
    };
    var perform = async function(name, payload, after) {
      if (busy) return;
      busy = true;
      try {
        var result = await call(name, { tournamentId:tournamentId, ...payload });
        if (after) await after(result); else await refresh();
      } catch (error) {
        if (window.showNotification) showNotification('Cobrança não alterada', error.message || 'Tente novamente.', 'error');
        await refresh();
      } finally { busy = false; }
    };
    var paint = function(data) {
      body.replaceChildren();
      if (data.sandbox) {
        body.append(el('p', 'sp-fee-explainer', 'Sandbox de teste: nenhuma cobrança ou pagamento está disponível.'));
        return;
      }
      if (data.financeAdmin) body.append(button('Conferir Pix de torneios', function() {
        window._openTournamentFeePixQueue();
      }, true));
      if (data.legacy) { body.append(el('p', '', 'Este torneio é anterior à cobrança. Não há taxa retroativa.')); return; }
      var quote = data.quote, paid = !data.stale && data.settlement && data.settlement.state === 'paid'
        && quote && data.settlement.quoteId === quote.quoteId;
      var reversed = data.settlement && data.settlement.state === 'reversed';
      body.append(el('p', 'sp-fee-explainer', 'A taxa do Scoreplace é calculada por pessoa confirmada após o fechamento das inscrições. Reservas e lista de espera não são cobradas.'));
      if (!data.terms) {
        body.append(el('p', 'sp-fee-pending', 'As condições de cobrança ainda não foram configuradas. Nenhum pagamento pode ser iniciado.'));
        return;
      }
      var terms = data.terms;
      var disclosure = el('section', 'sp-fee-terms');
      disclosure.append(el('h3', '', 'Condições financeiras · versão ' + terms.version));
      line(disclosure, 'Taxa Scoreplace por pessoa confirmada', money(terms.feeCentsPerPerson));
      if (terms.registrationPricing) {
        var pricing = terms.registrationPricing;
        if (pricing.mode === 'single') line(disclosure, 'Inscrição definida pela organização', money(pricing.cents));
        else if (pricing.mode === 'category') {
          Object.keys(pricing.centsByCategory || {}).sort().forEach(function(category) {
            line(disclosure, 'Inscrição · ' + category, money(pricing.centsByCategory[category]));
          });
        }
      }
      var methods = terms.paymentMethods || {};
      if (terms.passServiceFeeToParticipant) line(disclosure, 'Taxa Scoreplace cobrada junto da inscrição', 'Sim; organização recebe e acerta após fechar inscrições');
      else line(disclosure, 'Taxa Scoreplace cobrada junto da inscrição', 'Não; organização paga após fechar inscrições');
      if (methods.organizerPixKey) line(disclosure, 'Recebimento direto por Pix', 'Chave da organização');
      if (methods.organizerPaymentUrl) line(disclosure, 'Recebimento por link próprio', 'Link da organização');
      line(disclosure, 'Prazo para pagar antes do sorteio', terms.paymentDeadline);
      line(disclosure, 'Repasse das inscrições', terms.payoutDeadline);
      line(disclosure, 'Reembolsos e contestações', terms.refundPolicy);
      body.append(disclosure);
      if (!data.termsAccepted) {
        var acceptance = el('label', 'sp-fee-agreement');
        var toggle = el('input'); toggle.type = 'checkbox';
        acceptance.append(toggle, el('span', '', 'Li e concordo com estes prazos e condições de cobrança.'));
        var acceptButton = button('Concordar e continuar', function() {
          if (!toggle.checked) return;
          perform('acceptTournamentFeeTerms', { agree:true, termsVersion:terms.version,
            termsHash:terms.hash });
        });
        acceptButton.disabled = true;
        toggle.onchange = function() { acceptButton.disabled = !toggle.checked; };
        body.append(acceptance, acceptButton);
        return;
      }
      if (quote) {
        line(body, 'Pessoas confirmadas', String(quote.participantCount));
        line(body, 'Taxa por pessoa', money(quote.feeCentsPerPerson));
        line(body, 'Subtotal', money(quote.subtotalCents));
        if (quote.discountCents) line(body, 'Desconto', '−' + money(quote.discountCents));
        line(body, 'Total ao Scoreplace', money(quote.totalCents));
        var proofPending = data.unreviewedProofCount > 0;
        var paymentPending = data.unsettledPaymentCount > 0;
        body.append(el('p', paid && !reversed && !data.stale && !paymentPending ? 'sp-fee-paid' : 'sp-fee-pending',
          reversed ? 'Pagamento estornado ou contestado. Sorteio bloqueado; a organização precisa de acerto financeiro com o Scoreplace.'
            : proofPending ? 'Há comprovantes de inscrição aguardando conferência. Confira-os antes de sortear; se a taxa já foi paga, será necessário acerto financeiro.'
              : paymentPending ? 'Há inscrições aguardando pagamento ou com comprovante recusado. Resolva-as antes de sortear; se a taxa já foi paga, será necessário acerto financeiro.'
              : data.stale ? (paid
                ? 'O elenco mudou após o pagamento. Sorteio bloqueado até acerto financeiro.'
                : 'O elenco mudou. Recalcule a cobrança antes de sortear.')
                : paid ? 'Pagamento confirmado. Sorteio liberado para este elenco.'
                  : 'Pagamento pendente. Sorteio bloqueado até a confirmação.'));
      } else body.append(el('p', 'sp-fee-pending', 'Feche as inscrições e calcule a cobrança antes de sortear.'));
      if (reversed) return;
      if (!paid) {
        var pixReport = data.pixReport && data.pixReport.quoteId === (quote && quote.quoteId)
          ? data.pixReport : null;
        if (pixReport && pixReport.state === 'reported') {
          body.append(el('p', 'sp-fee-pending', 'Pix informado à equipe financeira. O sorteio continua bloqueado até a conferência do recebimento na conta do Scoreplace. Não pague novamente com cartão.'));
          line(body, 'Referência informada', pixReport.reference);
          return;
        }
        if (pixReport && pixReport.state === 'rejected') {
          body.append(el('p', 'sp-fee-pending', 'O Pix informado não foi localizado. Confira a transferência e, se necessário, informe uma nova referência.'));
        }
        if (quote && quote.cardAttemptId) {
          body.append(el('p', 'sp-fee-pending', 'Uma tentativa de cartão já foi iniciada. Pix e recálculo ficam indisponíveis até a conciliação para evitar cobrança dupla.'));
          if (!data.stale && data.cardAvailable) {
            body.append(button('Retomar pagamento com cartão', function() {
              perform('startTournamentFeeCheckout', {}, function(result) {
                if (!result.url || !/^https:\/\//.test(result.url)) throw new Error('Link do pagamento indisponível.');
                window.location.assign(result.url);
              });
            }));
          }
          if (quote.cardSessionId) body.append(button('Cancelar tentativa de cartão', function() {
            perform('cancelTournamentFeeCardAttempt', {});
          }, true));
          else body.append(el('p', 'sp-fee-explainer', 'Se o checkout não abriu, tente retomar. Sem sessão confirmada pelo Stripe, o cancelamento exige conferência financeira.'));
          return;
        }
        var voucher = el('input', 'sp-fee-input');
        voucher.placeholder = 'Voucher de desconto (opcional)'; voucher.maxLength = 64;
        voucher.setAttribute('aria-label', 'Voucher de desconto');
        body.append(voucher, button(quote ? 'Atualizar cobrança' : 'Calcular cobrança', function() {
          perform('prepareTournamentFee', { voucherCode:voucher.value });
        }));
        if (quote && quote.totalCents > 0 && !data.stale) {
          if (data.pixAvailable && data.pixKey) {
            body.append(el('h3', '', 'Pagar por Pix direto ao Scoreplace'));
            line(body, 'Chave Pix', data.pixKey);
            var pixCode = null;
            if (data.pixReceiverName && data.pixReceiverCity && window.ScoreplacePixBRCode) {
              try { pixCode = window.ScoreplacePixBRCode.build(data.pixKey, quote.totalCents,
                data.pixReceiverName, data.pixReceiverCity); }
              catch (_) { /* Sem dados válidos do recebedor, oferecer só a chave verificada. */ }
            }
            if (pixCode) {
              line(body, 'Recebedor Pix', data.pixReceiverName + ' · ' + data.pixReceiverCity);
              var qrHost = el('div', 'sp-fee-pix-qr'); body.append(qrHost);
              loadQr().then(function(generatorFactory) {
                if (!qrHost.isConnected) return;
                var generator = generatorFactory(0, 'M');
                generator.addData(pixCode); generator.make();
                var qr = el('img'); qr.alt = 'QR Pix da taxa deste torneio';
                qr.width = 180; qr.height = 180;
                qr.style.cssText = 'display:block;background:white;padding:8px;border-radius:8px;margin:10px 0';
                qr.src = generator.createDataURL(4, 12); qrHost.replaceChildren(qr);
              }).catch(function() { /* O código copia e cola continua disponível. */ });
              body.append(button('Copiar Pix copia e cola', function() {
                navigator.clipboard.writeText(pixCode).then(function() {
                  if (window.showNotification) showNotification('Pix copiado', 'Confira o recebedor e o valor no banco antes de pagar.', 'success');
                });
              }, true));
            }
            body.append(button('Copiar chave Pix', function() {
              navigator.clipboard.writeText(data.pixKey).then(function() {
                if (window.showNotification) showNotification('Chave copiada', 'Pague o valor exato indicado. A confirmação é manual.', 'success');
              });
            }, true));
            body.append(el('p', 'sp-fee-explainer', 'O pagamento por Pix não tem acréscimo. A liberação ocorre após conferência pelo Scoreplace.'));
            var pixReference = el('input', 'sp-fee-input');
            pixReference.placeholder = 'Referência do comprovante Pix';
            pixReference.maxLength = 120;
            pixReference.setAttribute('aria-label', 'Referência do comprovante Pix');
            body.append(pixReference, button('Informar Pix enviado', function() {
              var reference = pixReference.value.trim();
              if (reference.length < 8) {
                if (window.showNotification) showNotification('Referência necessária', 'Informe a referência da transação ou do comprovante Pix.', 'error');
                return;
              }
              perform('reportTournamentFeePix', { reference:reference });
            }));
            body.append(el('p', 'sp-fee-explainer', 'Informar o Pix não confirma o pagamento. A equipe financeira confere o recebimento antes de liberar o sorteio.'));
          }
          if (data.cardAvailable) {
            body.append(el('h3', '', 'Pagar com cartão'));
            line(body, 'Total estimado no cartão', money(data.cardTotalCents));
            body.append(el('p', 'sp-fee-explainer', 'As taxas financeiras configuradas são acrescidas ao valor do cartão. O valor final aparece no checkout antes de confirmar.'));
            body.append(button('Ir para pagamento com cartão', function() {
              perform('startTournamentFeeCheckout', {}, function(result) {
                if (!result.url || !/^https:\/\//.test(result.url)) throw new Error('Link do pagamento indisponível.');
                window.location.assign(result.url);
              });
            }));
          }
        }
      }
    };
    await refresh();
  };
  window._openTournamentFeePixQueue = async function() {
    var old = document.getElementById('tournament-fee-pix-queue');
    if (old) old.remove();
    var overlay = el('div', 'modal-overlay active');
    overlay.id = 'tournament-fee-pix-queue'; overlay.style.zIndex = '10020';
    var panel = el('section', 'sp-fee-panel');
    panel.style.maxHeight = '90vh'; panel.style.overflowY = 'auto';
    var heading = el('div', 'sp-fee-heading');
    heading.append(el('h2', '', 'Conferência de Pix dos torneios'),
      button('Fechar', function() { overlay.remove(); }, true));
    var body = el('div', 'sp-fee-body', 'Carregando');
    panel.append(heading, body); overlay.append(panel); document.body.append(overlay);
    overlay.onclick = function(event) { if (event.target === overlay) overlay.remove(); };
    var busy = false;
    async function refresh() {
      if (!overlay.isConnected) return;
      try {
        var data = await call('listTournamentFeePixReports', {});
        if (!overlay.isConnected) return;
        body.replaceChildren();
        var reports = Array.isArray(data.reports) ? data.reports : [];
        if (!reports.length) { body.append(el('p', '', 'Nenhum Pix informado aguarda conferência.')); return; }
        body.append(el('p', 'sp-fee-explainer',
          'A referência informada não prova pagamento. Confira valor, destinatário e transação no extrato do Scoreplace antes de confirmar.'));
        reports.forEach(function(report) {
          var card = el('section', 'sp-fee-terms');
          card.style.marginBottom = '14px';
          card.append(el('h3', '', report.tournamentName || 'Torneio'));
          line(card, 'Taxa a conferir', money(report.amountCents));
          line(card, 'Referência informada', report.reference || 'Não disponível');
          line(card, 'Informado em', report.reportedAt || 'Data indisponível');
          if (!report.current) {
            card.append(el('p', 'sp-fee-pending', 'Cobrança alterada ou encerrada. Não confirme sem investigar.'));
            body.append(card); return;
          }
          var evidence = el('textarea', 'sp-fee-input');
          evidence.placeholder = 'Registro da conferência no extrato ou motivo da recusa';
          evidence.maxLength = 500;
          evidence.style.cssText = 'display:block;width:100%;min-height:80px;box-sizing:border-box;margin:10px 0';
          evidence.setAttribute('aria-label', 'Registro da conferência financeira');
          var check = el('label', 'sp-fee-agreement');
          var verified = el('input'); verified.type = 'checkbox';
          check.append(verified, el('span', '', 'Conferi o recebimento deste valor no extrato oficial.'));
          async function decide(name) {
            if (busy) return;
            var note = evidence.value.trim();
            if (note.length < 8 || (name === 'confirmTournamentFeePix' && !verified.checked)) {
              if (window.showNotification) showNotification('Conferência incompleta',
                'Registre a conferência e confirme o extrato antes de aprovar.', 'error');
              return;
            }
            busy = true;
            try {
              await call(name, { tournamentId:report.tournamentId, evidence:note });
              if (window.showNotification) showNotification('Conferência registrada',
                name === 'confirmTournamentFeePix' ? 'Recebimento confirmado.' : 'Referência recusada.', 'success');
              await refresh();
            } catch (error) {
              if (window.showNotification) showNotification('Não foi possível conferir', error.message || 'Tente novamente.', 'error');
            } finally { busy = false; }
          }
          card.append(evidence, check,
            button('Confirmar recebimento', function() { decide('confirmTournamentFeePix'); }),
            button('Recusar referência', function() { decide('rejectTournamentFeePixReport'); }, true));
          body.append(card);
        });
        if (data.hasMore) body.append(el('p', 'sp-fee-explainer',
          'Há mais itens. Os próximos aparecem à medida que estes forem conferidos.'));
      } catch (error) { body.textContent = error.message || 'Não foi possível consultar os Pix pendentes.'; }
    }
    await refresh();
  };
})();
