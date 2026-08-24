// scoreplace.app — Termos de Uso
//
// Página pública (rota #terms). Acessível sem login.
// Revisão jurídica concluída em v1.6.4-beta (14 Mai 2026):
// operadora Terra Barth identificada, IP, foro SP/SP, força maior,
// seção de alterações com ressalva de beta sem aviso prévio.

(function () {
  'use strict';

  function renderTermsPage(container) {
    var _t = window._t || function (k) { return k; };
    var supportEmail = 'contato@barthlabs.com';
    var lastUpdated = '24 de Agosto de 2026';

    var html = '';

    if (typeof window._renderBackHeader === 'function') {
      html += window._renderBackHeader({
        label: _t('btn.back') || 'Voltar',
        middleHtml: '<span style="font-weight:700;color:var(--text-bright);">' + _t('terms.title') + '</span>'
      });
    }

    html +=
      '<div style="max-width:760px;margin:0 auto;padding:1.25rem 1rem 3rem;">' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.5rem;">' +
          '<h1 style="font-size:1.6rem;font-weight:800;color:var(--text-bright);margin:0 0 0.4rem;">' +
            _t('terms.title') + '</h1>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 1rem;">' +
            _t('terms.lastUpdated', { date: lastUpdated }) + '</p>' +

          // Banner alpha disclaimer
          '<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:10px;padding:12px 14px;margin-bottom:1.25rem;">' +
            '<div style="font-weight:700;font-size:0.85rem;color:#f59e0b;margin-bottom:6px;">' +
              '⚠️ ' + _t('terms.alphaBannerTitle') + '</div>' +
            '<p style="font-size:0.78rem;color:var(--text-main);line-height:1.6;margin:0;">' +
              _t('terms.alphaBannerBody') + '</p>' +
          '</div>' +

          '<p style="font-size:0.92rem;color:var(--text-main);line-height:1.7;margin:0 0 1.25rem;">' +
            _t('terms.intro') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '1. ' + _t('terms.section1Title') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.section1Body') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '2. ' + _t('terms.section2Title') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.section2Body') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '3. ' + _t('terms.section3Title') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.section3Body') + '</p>' +

          // 2.0.50 (dono): o letzplay é público — criar a conta já autoriza a consulta.
          // O toggle de autorização no perfil morreu junto.
          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '4. ' + _t('terms.lzTitle') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.lzBody') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '5. ' + _t('terms.section4Title') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.section4Body') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '6. ' + _t('terms.section5Title') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.section5Body') + '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '7. ' + _t('terms.ipTitle') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.ipBody') +
          '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '8. ' + _t('terms.changesTitle') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.changesBody') +
          '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '9. ' + _t('terms.jurisdictionTitle') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;">' +
            _t('terms.jurisdictionBody') +
          '</p>' +

          '<h2 style="font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;">' +
            '10. ' + _t('terms.contactTitle') + '</h2>' +
          '<p style="font-size:0.88rem;color:var(--text-main);line-height:1.7;margin:0;">' +
            _t('terms.contactBody') +
            ' <a href="mailto:' + supportEmail + '" style="color:var(--primary-color);">' +
              supportEmail +
            '</a>.' +
          '</p>' +
        '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  window.renderTerms = renderTermsPage;
})();
