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
    if (modalId === 'modal-login' && typeof window._cancelPendingSignout === 'function') {
      window._cancelPendingSignout();
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
