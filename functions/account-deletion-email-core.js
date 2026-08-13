'use strict';
/*
 * account-deletion-email-core.js — E-MAIL DE CONFIRMAÇÃO DE EXCLUSÃO DE CONTA (puro).
 *
 * Pedido do dono (13/ago/2026): _"sempre que qualquer conta for excluída no app
 * (por qualquer motivo — solicitação do usuário, admin, etc.), o sistema deve
 * automaticamente enviar e-mail de confirmação"_ — para a pessoa excluída, para
 * rstbarth@gmail.com e com CC contato@barthlabs.com.
 *
 * POR QUE UM GATILHO DE FIRESTORE, e não uma linha dentro do deleteAccount:
 * a mesma lição do syncMatchRosters — o gatilho vê TODA escrita, de QUALQUER
 * origem (a CF deleteAccount, um script de admin, o console do Firebase, uma
 * limpeza agendada). Pendurar o e-mail só no deleteAccount deixaria de fora
 * exatamente as exclusões feitas "por fora", que são as que mais precisam de
 * registro. O Auth de 2ª geração não tem gatilho onDelete, então o doc do
 * Firestore é o ponto de observação certo.
 *
 * PURO de propósito (nada de admin/firestore aqui): o MESMO construtor serve o
 * gatilho e qualquer script/backfill. Duas montagens do mesmo e-mail divergiriam
 * na primeira mudança de texto ([[feedback_unify_dual_entry_points]]).
 *
 * ⚠️ O E-MAIL SAI DO `before`, NUNCA DO `after`. A exclusão canônica grava o
 * tombstone com `set` SEM merge — o doc perde nome e e-mail no mesmo instante.
 * Quem lê só o estado final não tem para quem escrever. O evento traz `before` e
 * `after`; a identidade vem do `before`.
 *
 * ⚠️ FUSÃO NÃO É EXCLUSÃO — e este é o erro que o teste trava. O merge grava
 * `mergedInto` e deixa o doc; sete dias depois o cleanupAbandonedAuth APAGA esse
 * doc de verdade. Um gatilho ingênuo mandaria "sua conta foi excluída" para quem
 * apenas uniu duas contas, com a conta sobrevivente viva — alarme falso sobre um
 * fato que não aconteceu. Por isso `mergedInto` no `before` é descarte.
 */

var ADMIN_TO = 'rstbarth@gmail.com';
var CC_CONTATO = 'contato@barthlabs.com';

/* ── DECISÃO ────────────────────────────────────────────────────────────────
 * Recebe os dois lados CRUS do evento (objetos simples ou null), não o snapshot,
 * para o teste poder exercitar a regra sem Firestore.
 *   before = dados do doc antes  (null = não existia)
 *   after  = dados do doc depois (null = foi apagado)
 * Devolve { notify, kind, reason }.
 *   kind: 'hard' (doc apagado) | 'tombstone' (deleted:true)
 */
function decideDeletionNotice(before, after) {
  if (!before) return { notify: false, kind: null, reason: 'sem before — doc nasceu agora' };

  // Fusão: a pessoa não perdeu a conta, ela foi absorvida por outra que segue viva.
  if (before.mergedInto) return { notify: false, kind: null, reason: 'conta absorvida (mergedInto)' };

  // Já era tombstone antes: a exclusão já foi comunicada no evento anterior.
  if (before.deleted === true) return { notify: false, kind: null, reason: 'já era tombstone' };

  if (!after) return { notify: true, kind: 'hard', reason: 'documento apagado' };
  if (after.deleted === true) return { notify: true, kind: 'tombstone', reason: 'tombstone deleted:true' };

  return { notify: false, kind: null, reason: 'escrita comum' };
}

/* ── formatação ─────────────────────────────────────────────────────────── */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Horário sempre em BRT e ROTULADO. Log de servidor é UTC, e misturar os dois já
// custou uma conclusão errada neste projeto — o rótulo é parte do dado.
function fmtBR(d) {
  var dt = (d instanceof Date) ? d : new Date(d || Date.now());
  if (isNaN(dt.getTime())) return '(data desconhecida)';
  try {
    return dt.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) + ' (BRT)';
  } catch (e) {
    return dt.toISOString() + ' (UTC)';
  }
}

function _phoneFmt(ph) {
  var d = String(ph || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length === 11) return '+55 (' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '+55 (' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return ph;
}

var WRAP = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;' +
  'max-width:600px;margin:0 auto;padding:24px;color:#1f2937;line-height:1.55;';
var H1 = 'font-size:19px;font-weight:700;margin:0 0 14px;color:#111827;';
var BOX = 'background:#f3f4f6;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:14px;';
var FOOT = 'margin-top:22px;padding-top:14px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;';

function _linhas(pares) {
  return pares.filter(function (p) { return p && p[1]; }).map(function (p) {
    return '<div style="margin:3px 0;"><span style="color:#6b7280;">' + esc(p[0]) +
      ':</span> <strong>' + esc(p[1]) + '</strong></div>';
  }).join('');
}

/* ── 1) E-MAIL PARA A PESSOA EXCLUÍDA ───────────────────────────────────────
 * Confirmação sóbria: o que aconteceu, quando, o que foi removido e como falar
 * com a gente. Sem CTA de volta ao app — quem pediu exclusão não quer conversão.
 */
function buildUserEmail(info) {
  info = info || {};
  var nome = String(info.name || '').trim();
  var quando = fmtBR(info.deletedAt);
  var itens = (info.items || []);
  var prim = nome ? nome.split(/\s+/)[0] : '';

  var subject = 'Sua conta no scoreplace foi excluída';

  var html = '<div style="' + WRAP + '">' +
    '<div style="' + H1 + '">Sua conta no scoreplace foi excluída</div>' +
    '<p style="margin:0 0 12px;">' + (prim ? 'Olá, ' + esc(prim) + '. ' : '') +
    'Confirmamos que sua conta e seus dados pessoais foram <strong>removidos em definitivo</strong> ' +
    'do scoreplace.app.</p>' +
    '<div style="' + BOX + '">' +
      _linhas([
        ['Conta', info.email || ''],
        ['Nome', nome],
        ['Excluída em', quando]
      ]) +
    '</div>' +
    (itens.length
      ? '<p style="margin:16px 0 6px;font-weight:600;">O que foi removido</p>' +
        '<ul style="margin:0;padding-left:20px;font-size:14px;">' +
        itens.map(function (i) { return '<li style="margin:3px 0;">' + esc(i) + '</li>'; }).join('') +
        '</ul>'
      : '') +
    '<p style="margin:16px 0 0;font-size:14px;">A exclusão é <strong>permanente e não pode ser desfeita</strong>. ' +
    'Não guardamos cópia do seu perfil. Se um dia quiser voltar, será preciso criar uma conta nova.</p>' +
    '<div style="' + FOOT + '">' +
      'Esta mensagem é o comprovante do atendimento ao seu pedido de exclusão de dados, ' +
      'conforme a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).<br>' +
      'Dúvidas? Responda este e-mail ou escreva para ' + esc(CC_CONTATO) + '.' +
    '</div>' +
  '</div>';

  var text = 'Sua conta no scoreplace foi excluída\n\n' +
    (prim ? 'Olá, ' + prim + '. ' : '') +
    'Confirmamos que sua conta e seus dados pessoais foram removidos em definitivo do scoreplace.app.\n\n' +
    'Conta: ' + (info.email || '(sem e-mail)') + '\n' +
    (nome ? 'Nome: ' + nome + '\n' : '') +
    'Excluída em: ' + quando + '\n\n' +
    (itens.length ? 'O que foi removido:\n' + itens.map(function (i) { return '  - ' + i; }).join('\n') + '\n\n' : '') +
    'A exclusão é permanente e não pode ser desfeita.\n\n' +
    'Comprovante de atendimento ao pedido de exclusão de dados (LGPD, Lei nº 13.709/2018).\n' +
    'Dúvidas: ' + CC_CONTATO + '\n';

  return { subject: subject, html: html, text: text };
}

/* ── 2) RELATÓRIO PARA O DONO ───────────────────────────────────────────────
 * Registro operacional: identidade, origem da conta, o que saiu e — o que faz
 * este e-mail valer alguma coisa — a VARREDURA DE SOBRAS. Relatório que só diz
 * "apagado" não prova nada; o que prova é a conferência feita depois.
 */
function buildAdminEmail(info) {
  info = info || {};
  var nome = String(info.name || '').trim();
  var quando = fmtBR(info.deletedAt);
  var itens = info.items || [];
  var sobras = info.leftovers || [];
  var origem = info.origin || 'exclusão de conta';

  var subject = '[scoreplace] Conta excluída — ' + (nome || info.email || info.uid || 'desconhecida');

  var limpo = sobras.length === 0;
  var selo = limpo
    ? '<div style="background:#ecfdf5;border-left:4px solid #10b981;padding:12px 14px;border-radius:6px;margin:14px 0;font-size:14px;">' +
      '<strong>✓ Varredura limpa.</strong> Nenhuma referência ao uid restou na base.</div>'
    : '<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 14px;border-radius:6px;margin:14px 0;font-size:14px;">' +
      '<strong>⚠️ Sobraram ' + sobras.length + ' referência(s)</strong> — precisam de limpeza manual:' +
      '<ul style="margin:8px 0 0;padding-left:20px;">' +
      sobras.map(function (s) { return '<li style="margin:2px 0;"><code>' + esc(s) + '</code></li>'; }).join('') +
      '</ul></div>';

  var html = '<div style="' + WRAP + '">' +
    '<div style="' + H1 + '">Conta excluída — relatório</div>' +
    '<div style="' + BOX + '">' +
      _linhas([
        ['Nome', nome],
        ['E-mail', info.email || ''],
        ['Celular', _phoneFmt(info.phone)],
        ['uid', info.uid || ''],
        ['Provedores', (info.providers || []).join(', ')],
        ['Conta criada em', info.createdAt ? fmtBR(info.createdAt) : ''],
        ['Último acesso', info.lastSignIn ? fmtBR(info.lastSignIn) : ''],
        ['Excluída em', quando],
        ['Origem', origem]
      ]) +
    '</div>' +
    (itens.length
      ? '<p style="margin:16px 0 6px;font-weight:600;">Dados encontrados e apagados</p>' +
        '<ul style="margin:0;padding-left:20px;font-size:14px;">' +
        itens.map(function (i) { return '<li style="margin:3px 0;">' + esc(i) + '</li>'; }).join('') +
        '</ul>'
      : '<p style="margin:16px 0 6px;font-size:14px;color:#6b7280;">Nenhum item detalhado informado.</p>') +
    selo +
    '<div style="' + FOOT + '">' +
      'Registro automático de conformidade com pedido de exclusão de dados (LGPD, Lei nº 13.709/2018).<br>' +
      'Gerado pelo gatilho <code>accountDeletionEmail</code> do scoreplace.app.' +
    '</div>' +
  '</div>';

  var text = 'Conta excluída — relatório\n\n' +
    'Nome: ' + (nome || '(n/d)') + '\n' +
    'E-mail: ' + (info.email || '(n/d)') + '\n' +
    (info.phone ? 'Celular: ' + _phoneFmt(info.phone) + '\n' : '') +
    'uid: ' + (info.uid || '(n/d)') + '\n' +
    'Provedores: ' + ((info.providers || []).join(', ') || '(n/d)') + '\n' +
    (info.createdAt ? 'Conta criada em: ' + fmtBR(info.createdAt) + '\n' : '') +
    (info.lastSignIn ? 'Último acesso: ' + fmtBR(info.lastSignIn) + '\n' : '') +
    'Excluída em: ' + quando + '\n' +
    'Origem: ' + origem + '\n\n' +
    (itens.length ? 'Dados encontrados e apagados:\n' + itens.map(function (i) { return '  - ' + i; }).join('\n') + '\n\n' : '') +
    (limpo ? 'Varredura limpa — nenhuma referência restou na base.\n'
           : 'ATENÇÃO: sobraram ' + sobras.length + ' referência(s):\n' + sobras.map(function (s) { return '  - ' + s; }).join('\n') + '\n') +
    '\nRegistro de conformidade (LGPD, Lei nº 13.709/2018).\n';

  return { subject: subject, html: html, text: text };
}

/* ids determinísticos: reentrega do gatilho não vira e-mail duplicado.
 * O Firestore aceita '/' só como separador de caminho — o uid não tem, mas
 * sanitizo por garantia. */
function mailDocIds(uid) {
  var safe = String(uid || 'desconhecido').replace(/[^A-Za-z0-9_-]/g, '_');
  return { user: 'acctdel_' + safe + '_user', admin: 'acctdel_' + safe + '_admin' };
}

module.exports = {
  decideDeletionNotice,
  buildUserEmail,
  buildAdminEmail,
  mailDocIds,
  fmtBR,
  ADMIN_TO,
  CC_CONTATO
};
