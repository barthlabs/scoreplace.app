// scoreplace.app — Exclusão de conta e dados
//
// Página pública (rota #delete-account). Acessível sem login.
// Requisito da Google Play (política de exclusão de dados / Data safety):
// URL web onde o usuário pode solicitar a exclusão da conta e dos dados,
// descrevendo o passo a passo e quais dados são apagados/retidos.

(function () {
  'use strict';

  function renderDeleteAccountPage(container) {
    var _t = window._t || function (k) { return k; };
    var supportEmail = 'contato@barthlabs.com';
    var waNumber = '5511916936454';
    var waLabel = '+55 11 91693-6454';

    var H2 = 'font-size:1.05rem;font-weight:700;color:var(--text-bright);margin:1.5rem 0 0.6rem;';
    var P = 'font-size:0.9rem;color:var(--text-main);line-height:1.7;margin:0 0 0.75rem;';
    var LI = 'font-size:0.9rem;color:var(--text-main);line-height:1.6;margin:0 0 0.4rem;';

    var html = '';

    // Sticky back-header padrão do app
    if (typeof window._renderBackHeader === 'function') {
      html += window._renderBackHeader({
        label: (_t('btn.back') && _t('btn.back') !== 'btn.back') ? _t('btn.back') : 'Voltar',
        middleHtml: '<span style="font-weight:700;color:var(--text-bright);">Exclusão de conta</span>'
      });
    }

    html +=
      '<div style="max-width:760px;margin:0 auto;padding:1.25rem 1rem 3rem;">' +
        '<div style="background:var(--bg-card);border:1px solid var(--border-color);border-radius:14px;padding:1.5rem;">' +

          '<h1 style="font-size:1.6rem;font-weight:800;color:var(--text-bright);margin:0 0 0.4rem;">' +
            'Exclusão de conta e dados</h1>' +
          '<p style="font-size:0.78rem;color:var(--text-muted);margin:0 0 1.5rem;">' +
            'Aplicativo <b>scoreplace</b> (app.scoreplace) · desenvolvido por barthlabs</p>' +

          '<p style="' + P + '">' +
            'Você pode solicitar a exclusão permanente da sua conta do scoreplace e de todos os ' +
            'dados associados a ela, a qualquer momento, por um dos caminhos abaixo. A exclusão é ' +
            'definitiva e não pode ser desfeita.' +
          '</p>' +

          '<h2 style="' + H2 + '">1. Excluir pelo próprio app (imediato)</h2>' +
          '<ol style="padding-left:1.2rem;margin:0 0 0.75rem;">' +
            '<li style="' + LI + '">Abra o scoreplace e faça login.</li>' +
            '<li style="' + LI + '">Toque no seu nome/avatar para abrir o <b>Perfil</b>.</li>' +
            '<li style="' + LI + '">Role até o fim e toque em <b>“Excluir conta”</b>.</li>' +
            '<li style="' + LI + '">Confirme digitando <b>EXCLUIR</b>. A conta e os dados são apagados na hora.</li>' +
          '</ol>' +

          '<h2 style="' + H2 + '">2. Solicitar por contato (se não tiver acesso ao app)</h2>' +
          '<p style="' + P + '">' +
            'Envie um pedido de exclusão informando o e-mail ou telefone cadastrado na conta:' +
          '</p>' +
          '<ul style="padding-left:1.2rem;margin:0 0 0.75rem;">' +
            '<li style="' + LI + '">E-mail: ' +
              '<a href="mailto:' + supportEmail + '?subject=Excluir%20minha%20conta%20scoreplace" ' +
              'style="color:var(--primary-color);">' + supportEmail + '</a></li>' +
            '<li style="' + LI + '">WhatsApp: ' +
              '<a href="https://wa.me/' + waNumber + '?text=Quero%20excluir%20minha%20conta%20scoreplace" ' +
              'target="_blank" rel="noopener" style="color:var(--primary-color);">' + waLabel + '</a></li>' +
          '</ul>' +
          '<p style="' + P + '">' +
            'Concluímos a exclusão em até <b>7 dias úteis</b> após confirmarmos a titularidade da conta.' +
          '</p>' +

          '<h2 style="' + H2 + '">Quais dados são excluídos</h2>' +
          '<p style="' + P + '">' +
            'Ao excluir a conta, apagamos de forma permanente todos os dados vinculados a ela, incluindo:' +
          '</p>' +
          '<ul style="padding-left:1.2rem;margin:0 0 0.75rem;">' +
            '<li style="' + LI + '">Dados de perfil: nome, e-mail, telefone, foto, cidade, data de nascimento, modalidades e preferências.</li>' +
            '<li style="' + LI + '">Identificador da conta (uid) e token de notificações (push).</li>' +
            '<li style="' + LI + '">Torneios que você organizou e suas inscrições/participações.</li>' +
            '<li style="' + LI + '">Partidas casuais, presenças/check-ins e locais que você cadastrou.</li>' +
            '<li style="' + LI + '">Lista de amigos, convites e notificações.</li>' +
          '</ul>' +

          '<h2 style="' + H2 + '">Dados retidos e prazos</h2>' +
          '<p style="' + P + '">' +
            'Após a exclusão, os dados são removidos das bases ativas imediatamente. Cópias em ' +
            '<b>backups de segurança</b> são sobrescritas no ciclo normal e apagadas em até <b>30 dias</b>. ' +
            'Podemos reter, de forma isolada, o mínimo necessário para cumprir obrigações legais, prevenir ' +
            'fraude ou resolver disputas, pelo prazo exigido por lei. Registros que não identificam você ' +
            '(estatísticas agregadas/anonimizadas) podem ser mantidos.' +
          '</p>' +

          '<p style="font-size:0.85rem;color:var(--text-muted);line-height:1.7;margin:1.5rem 0 0;">' +
            'Dúvidas sobre privacidade e tratamento de dados: consulte a ' +
            '<a href="#privacy" style="color:var(--primary-color);">Política de Privacidade</a> ' +
            'ou fale com ' +
            '<a href="mailto:' + supportEmail + '" style="color:var(--primary-color);">' + supportEmail + '</a>.' +
          '</p>' +

        '</div>' +
      '</div>';

    container.innerHTML = html;
  }

  // Expose globally pra router
  window.renderDeleteAccount = renderDeleteAccountPage;
})();
