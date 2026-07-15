function setupUI() {
  // Configuração global de Modais, Botões, etc.
  
  // Delegação de eventos para fechar modais no X
  document.addEventListener('click', (e) => {
    if (e.target.closest('.modal-close')) {
      const modalOverlay = e.target.closest('.modal-overlay');
      if (modalOverlay) {
        modalOverlay.classList.remove('active');
      }
    }
    
    // Fecha ao clicar fora (no overlay escuro)
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.remove('active');
    }
  });

  // UI Handlers setup complete
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    // v0.17.92: ao abrir modal-login, cancela timer de signout pendente
    // (deferred 2.5s do auth.js) que mataria o modal antes do user clicar.
    if (modalId === 'modal-login') {
      if (typeof window._cancelPendingSignout === 'function') window._cancelPendingSignout();
      // v4.0.35: SEMPRE limpa as travas de "em andamento" ao (re)abrir o login.
      // BUG: se uma tentativa anterior deixou `_entrarInFlight`/`_phoneLoginInFlight`
      // presos em true, o botão Entrar ficava mudo pra sempre. Abrir o modal é o
      // momento natural pra zerar isso.
      window._entrarInFlight = false;
      window._phoneLoginInFlight = false;
      if (window._entrarWatchdog) { clearTimeout(window._entrarWatchdog); window._entrarWatchdog = null; }
    }
    modal.classList.add('active');
    // Scroll para o topo do conteúdo do modal
    const inner = modal.querySelector('.modal') || modal.querySelector('[style*="overflow"]');
    if (inner) inner.scrollTop = 0;
    modal.scrollTop = 0;
  } else {
    window._warn(`Modal ${modalId} não encontrado.`);
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

function createInteractiveElement(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstChild;
}

/**
 * Generate HTML for a toggle switch.
 * @param {object} opts - Options
 * @param {string} opts.id - Input element ID
 * @param {boolean} [opts.checked=false] - Initial state
 * @param {string} [opts.color] - Custom on-color (CSS color)
 * @param {string} [opts.onchange] - Inline onchange handler
 * @param {string} [opts.size] - 'sm' for small variant
 * @param {string} [opts.label] - Label text
 * @param {string} [opts.icon] - Emoji icon for label
 * @param {string} [opts.desc] - Description text below label
 * @returns {string} HTML string
 */
window._toggleSwitch = function(opts) {
  var id = opts.id || '';
  var checked = opts.checked ? ' checked' : '';
  var size = opts.size === 'sm' ? ' toggle-sm' : '';
  var colorStyle = '';
  if (opts.color) {
    colorStyle = ' style="--toggle-on-bg:' + opts.color + ';--toggle-on-glow:' + opts.color + '33;--toggle-on-border:' + opts.color + ';"';
  }
  var onchange = opts.onchange ? ' onchange="' + opts.onchange + '"' : '';
  // a11y: aria-label inferido do opts.label (ou opts.ariaLabel explícito).
  // O <label class="toggle-switch"> wrappa o input mas o Lighthouse ainda
  // exige um label "discoverable" no próprio input quando ele tem id.
  var ariaLabel = opts.ariaLabel || opts.label || '';
  // Strip HTML tags do label visual antes de usar como aria
  ariaLabel = String(ariaLabel).replace(/<[^>]+>/g, '').trim();
  var ariaAttr = ariaLabel ? ' aria-label="' + ariaLabel.replace(/"/g, '&quot;') + '"' : '';
  var switchHtml = '<label class="toggle-switch' + size + '"' + colorStyle + '>' +
    '<input type="checkbox" id="' + id + '"' + ariaAttr + checked + onchange + '>' +
    '<span class="toggle-slider"></span>' +
  '</label>';

  if (opts.label) {
    var iconHtml = opts.icon ? '<span class="toggle-icon">' + opts.icon + '</span>' : '';
    var descHtml = opts.desc ? '<div class="toggle-desc">' + opts.desc + '</div>' : '';
    return '<div class="toggle-row">' +
      '<div class="toggle-row-label">' + iconHtml + '<div>' + opts.label + descHtml + '</div></div>' +
      switchHtml +
    '</div>';
  }
  return switchHtml;
};

// ─── .btn-row: botões da mesma linha com a MESMA ALTURA ───────────────────────
// REGRA DO DONO (v1.2.11): se um botão quebra em 2 linhas, os vizinhos de 1 linha
// acompanham a altura dele — nada de botão baixinho ao lado de botão alto.
//
// O CSS (`.btn-row > .btn { align-self: stretch }`, components.css) resolve o caso
// comum, mas SÓ dentro de cada linha VISUAL. Quando a linha quebra (flex-wrap, tela
// estreita), o botão que cai sozinho embaixo não tem com quem se alinhar e encolhe
// — medido em 240px: [25, 25, 25, 17]. CSS não tem como dizer "a altura do mais alto
// do GRUPO, mesmo em outra linha", então a igualada final é aqui.
//
// Automático de propósito: um MutationObserver no #view-container + o resize cobrem
// TODA linha marcada com .btn-row, em qualquer view, sem precisar de chamada em cada
// render (a regra é "sempre que houver" — depender de call site é garantir que a
// próxima linha nasça errada). Custo: 1 passada por frame, só quando o DOM muda.
(function () {
  'use strict';
  function evenRows(root) {
    var rows = (root || document).querySelectorAll('.btn-row');
    for (var i = 0; i < rows.length; i++) {
      // Descendentes, não só filhos diretos: várias linhas do app embrulham o botão
      // num <span>/<div> (ex.: "Abrir grupo"+✎, controles de W.O.). O CSS align-self
      // só alcança filho direto — por isso o min-height daqui é quem fecha a regra.
      var btns = rows[i].querySelectorAll('.btn');
      if (btns.length < 2) continue;
      var j, max = 0;
      for (j = 0; j < btns.length; j++) btns[j].style.minHeight = '';   // remede do zero
      for (j = 0; j < btns.length; j++) max = Math.max(max, btns[j].getBoundingClientRect().height);
      if (!max) continue;
      for (j = 0; j < btns.length; j++) btns[j].style.minHeight = max + 'px';
    }
  }
  // NAO medir antes das fontes carregarem. As fontes do app (Outfit/Inter) chegam
  // depois do 1o layout: medindo com a fonte de fallback, a 1a passada trava um
  // min-height errado e a 2a (pos-fonte) o corrige — DUAS mudancas de altura.
  // Isso empurrava o conteudo DEPOIS que o bracket ja tinha rolado pro grupo do
  // usuario, e o scroll parava em lugar diferente a cada abertura ("as vezes mais em
  // cima, as vezes mais embaixo"): o re-afirma do scroll roda em 1400ms (bracket.js),
  // entao pegava a 2a mudanca so quando a fonte vinha rapido. Com o gate, ha UMA
  // unica passada, ja com as metricas finais.
  var fontsReady = false;
  var queued = false;
  function schedule() {
    if (!fontsReady || queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; try { evenRows(); } catch (e) {} });
  }
  window._evenBtnRows = function (root) { try { evenRows(root); } catch (e) {} };

  function boot() {
    var host = document.getElementById('view-container') || document.body;
    if (!host) return;
    try { new MutationObserver(schedule).observe(host, { childList: true, subtree: true }); } catch (e) {}
    window.addEventListener('resize', schedule);
    // fonts.ready = sinal deterministico de "as alturas ja sao as finais". So a partir
    // dele o schedule() sai do no-op (ver fontsReady acima).
    try {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsReady = true; schedule(); });
      else { fontsReady = true; schedule(); }
    } catch (e) { fontsReady = true; schedule(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
