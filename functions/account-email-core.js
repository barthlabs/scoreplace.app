'use strict';
/*
 * account-email-core.js — E-MAIL DE CONSOLIDAÇÃO DA CONTA (puro, v1.8.40).
 *
 * Pedido do dono (13/ago/2026): _"seria legal o sistema mandar automaticamente um
 * email dizendo como a pessoa escolheu logar"_ e, na sequência: _"vamos disparar um
 * para todos os que já entraram consolidando as informações das contas de cada um.
 * e sempre que mudar algo consolida e envia novamente um email de confirmação."_
 *
 * O e-mail é o REGISTRO PESQUISÁVEL na caixa da pessoa: quando ela não lembrar como
 * entrou (a causa nº1 de conta duplicada), busca "scoreplace" no e-mail e encontra
 * a foto atual da conta — nome, e-mail, celular e as formas de entrar.
 *
 * PURO de propósito (nada de admin/firestore): o MESMO construtor serve
 *   (a) o gatilho accountSummaryEmail (functions/index.js) e
 *   (b) o backfill scripts/send-account-summary-emails.js —
 * duas montagens do mesmo e-mail divergiriam na primeira mudança de texto.
 *
 * A ASSINATURA (accountDocSig) é o anti-spam: o gatilho só envia quando ela muda.
 * Ela cobre os campos de IDENTIDADE do doc (nome, e-mail, celular) — mudança de
 * tema/preferência/stats não dispara nada. Formas de entrar mudam no AUTH (não no
 * doc); o vínculo de provedor novo já é avisado pelo cliente (_notifyLoginMethodAdded).
 */

var NOMES_PROVEDOR = {
  'google.com': 'Google',
  'apple.com': 'Apple',
  'password': 'e-mail e senha',
  'emailLink': 'link por e-mail',
  'phone': 'celular (SMS)',
  'facebook.com': 'Facebook'
};

// Assinatura da identidade consolidada NO DOC. Mudou → re-envia a confirmação.
function accountDocSig(p) {
  p = p || {};
  return [
    String(p.displayName || '').trim(),
    String(p.email || '').trim().toLowerCase(),
    String(p.phone || '').replace(/\D/g, '')
  ].join('|');
}

function isAppleRelay(email) {
  return /@privaterelay\.appleid\.com$/i.test(String(email || ''));
}

function _fmtPhoneBR(ph) {
  var d = String(ph || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length === 11) return '+55 (' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '+55 (' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return ph;
}

function providerLabels(providerIds, authProviderFallback) {
  var ids = (providerIds || []).filter(Boolean);
  if (!ids.length && authProviderFallback) ids = [authProviderFallback];
  var out = [];
  ids.forEach(function (id) {
    var nome = NOMES_PROVEDOR[id] || id;
    if (out.indexOf(nome) === -1) out.push(nome);
  });
  return out;
}

// Constrói o e-mail. info = { name, email, phone, providers[], authProviderFallback, isNew }
// Retorna { subject, html, text } — o chamador enfileira na mail/ com
// replyTo contato@barthlabs.com ([[feedback_contact_email_always_barthlabs]]).
function buildAccountEmail(info) {
  info = info || {};
  var email = String(info.email || '');
  var labels = providerLabels(info.providers, info.authProviderFallback);
  var metodo = labels.length ? labels.join(' ou ') : 'e-mail e senha';
  var relay = isAppleRelay(email);
  var phoneFmt = _fmtPhoneBR(info.phone);
  var nome = String(info.name || '').trim();

  var subject = info.isNew
    ? 'Sua conta no scoreplace — como você entra'
    : 'Confirmação: os dados da sua conta no scoreplace';

  var linhas = [];
  if (nome) linhas.push(['Nome', nome]);
  linhas.push(['E-mail', relay ? email + ' (e-mail oculto da Apple)' : email]);
  if (phoneFmt) linhas.push(['Celular', phoneFmt]);
  linhas.push(['Como você entra', metodo]);

  var text =
    'scoreplace.app — ' + (info.isNew ? 'sua conta foi criada' : 'os dados da sua conta mudaram') + '\n\n' +
    'Esta é a foto atual da sua conta:\n\n' +
    linhas.map(function (l) { return '  ' + l[0] + ': ' + l[1]; }).join('\n') + '\n\n' +
    'GUARDE ESTE E-MAIL: para entrar, use SEMPRE o mesmo caminho (' + metodo + ').\n' +
    'Entrar por outro caminho pode criar uma conta separada — suas inscrições e seu histórico ficam divididos.\n\n' +
    (phoneFmt ? '' : 'Dica: cadastre seu CELULAR no perfil (https://scoreplace.app/#profile) — é a forma mais segura de recuperar seu acesso.\n\n') +
    (relay ? 'Você usa o "Ocultar meu e-mail" da Apple: sem o celular no perfil, não temos como reconhecer sua conta se você entrar por outro caminho.\n\n' : '') +
    (info.isNew ? 'Já tinha uma conta antes? Entre nela e abra Perfil > Formas de entrar para unir as duas.\n\n'
                : 'Não reconhece esta mudança? Escreva pra contato@barthlabs.com.\n\n') +
    'Dúvidas: contato@barthlabs.com\n' +
    'scoreplace.app · Jogue em outro nível';

  var esc = function (s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  var rows = linhas.map(function (l) {
    return '<tr><td style="padding:4px 10px 4px 0;color:#6b7280;white-space:nowrap;">' + esc(l[0]) + '</td>' +
           '<td style="padding:4px 0;font-weight:bold;">' + esc(l[1]) + '</td></tr>';
  }).join('');

  var html =
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2937;">' +
      '<h2 style="font-size:18px;margin:18px 0 6px;">🎾 ' +
        (info.isNew ? 'Sua conta no scoreplace foi criada' : 'Os dados da sua conta no scoreplace') + '</h2>' +
      '<p style="font-size:14px;line-height:1.6;margin:10px 0;">Esta é a foto atual da sua conta:</p>' +
      '<table style="font-size:14px;line-height:1.5;border-collapse:collapse;margin:8px 0;">' + rows + '</table>' +
      '<p style="font-size:14px;line-height:1.6;margin:12px 0;background:#fef3c7;border-radius:8px;padding:10px 12px;">' +
        '📌 <b>Guarde este e-mail.</b> Para entrar, use sempre o mesmo caminho (<b>' + esc(metodo) + '</b>). ' +
        'Entrar por outro caminho pode criar uma conta separada — e suas inscrições e seu histórico ficam divididos.' +
      '</p>' +
      (phoneFmt ? '' :
        '<p style="font-size:13px;line-height:1.6;margin:10px 0;">💡 Cadastre seu <b>celular</b> no ' +
        '<a href="https://scoreplace.app/#profile">seu perfil</a> — é a forma mais segura de recuperar seu acesso.</p>') +
      (relay ?
        '<p style="font-size:13px;line-height:1.6;margin:10px 0;">Você usa o <b>“Ocultar meu e-mail”</b> da Apple: sem o celular no perfil, ' +
        'não temos como reconhecer sua conta se você entrar por outro caminho um dia.</p>' : '') +
      (info.isNew
        ? '<p style="font-size:13px;line-height:1.6;margin:10px 0;color:#4b5563;">Já tinha uma conta antes? Entre nela e abra ' +
          '<a href="https://scoreplace.app/#profile">Perfil → Formas de entrar</a> para unir as duas.</p>'
        : '<p style="font-size:13px;line-height:1.6;margin:10px 0;color:#4b5563;">Não reconhece esta mudança? Escreva pra contato@barthlabs.com.</p>') +
      '<p style="font-size:12px;color:#6b7280;margin:16px 0 6px;">Dúvidas: contato@barthlabs.com<br>scoreplace.app · Jogue em outro nível</p>' +
    '</div>';

  return { subject: subject, html: html, text: text };
}

module.exports = { accountDocSig, buildAccountEmail, providerLabels, isAppleRelay, NOMES_PROVEDOR };
