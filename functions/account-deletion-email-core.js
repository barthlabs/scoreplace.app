'use strict';
/*
 * account-deletion-email-core.js — E-MAIL DE CONFIRMAÇÃO DE EXCLUSÃO DE CONTA (puro).
 *
 * Pedido do dono (13/ago/2026): _"sempre que qualquer conta for excluída no app
 * (por qualquer motivo — solicitação do usuário, admin, etc.), o sistema deve
 * automaticamente enviar e-mail de confirmação"_.
 *
 * ⚠️ DESTINATÁRIOS — regra FINAL, confirmada pelo dono (13/ago/2026): _"e-mail de
 * exclusão vai APENAS para o e-mail da conta excluída, com CC para
 * contato@barthlabs.com. Nenhum outro destinatário. Não enviar para
 * rstbarth@gmail.com em nenhuma hipótese."_
 *
 * É UM e-mail só. Existiu por algumas horas um SEGUNDO e-mail (relatório interno
 * endereçado à caixa da empresa) — ele foi REMOVIDO, junto com o construtor, e
 * não deve voltar: "nenhum outro destinatário" cobre também um segundo envio pro
 * mesmo endereço. O detalhe operacional (uid, caminhos de sobra) vive no LOG da
 * função, que é onde detalhe de máquina pertence — não numa caixa de e-mail.
 *
 * Há asserção travando a ausência de rstbarth@gmail.com em código e a ausência de
 * um segundo destinatário — as duas correções foram explícitas e não podem voltar
 * por descuido ([[feedback_contact_email_always_barthlabs]]).
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

var CC_CONTATO = 'contato@barthlabs.com';

/* ── ROTEAMENTO ─────────────────────────────────────────────────────────────
 * UM destino: a conta excluída, com CC pra caixa da empresa. Mora aqui, e não
 * solto no gatilho, pra "nenhum outro destinatário" ser uma regra verificável
 * num lugar só — espalhada pelo gatilho, ela divergiria no primeiro endereço novo.
 *
 * ⚠️ SEM E-MAIL, SEM ENVIO. Conta só-celular (13 na base) não tem caixa, e a
 * regra é "apenas para o e-mail da conta excluída" — sem esse endereço não há
 * e-mail a enviar. Mandar só pro CC transformaria a caixa da empresa em
 * destinatário PRIMÁRIO, que é exatamente o que a regra exclui. Nesses casos o
 * registro fica só no log da função.
 *
 * O CC é descartado quando a própria conta excluída É a caixa da empresa — senão
 * o mesmo endereço entraria como to e cc e receberia duplicado.
 */
function mailTargets(destinatario) {
  var alvo = String(destinatario || '').trim();
  if (!alvo) return { user: null };
  var cc = (alvo.toLowerCase() === CC_CONTATO.toLowerCase()) ? [] : [CC_CONTATO];
  return { user: { to: [alvo], cc: cc, replyTo: CC_CONTATO } };
}

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

// (_phoneFmt saiu junto com o relatório interno — só ele formatava celular, e a
//  confirmação do titular não mostra telefone.)

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
  var itensSobra = (info.leftovers || []).length;

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
    // A conferência PÓS-exclusão. Com o relatório interno removido, é esta linha
    // que carrega a prova — e ela é boa notícia pra quem pediu a exclusão. O
    // detalhe técnico (quais caminhos) fica no log; aqui vai o veredito.
    (info.swept
      ? '<p style="margin:14px 0 0;font-size:14px;' +
        (itensSobra ? 'color:#92400e;' : 'color:#065f46;') + '">' +
        (itensSobra
          ? 'Conferimos logo após a exclusão e ainda há ' + itensSobra +
            ' registro(s) técnico(s) em remoção. Vamos concluir e não é preciso fazer nada.'
          : '<strong>Conferimos logo após a exclusão:</strong> nenhum registro seu permaneceu em nossos sistemas.') +
        '</p>'
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
    (info.swept
      ? (itensSobra
          ? 'Conferimos logo após a exclusão e ainda há ' + itensSobra + ' registro(s) técnico(s) em remoção. Vamos concluir e não é preciso fazer nada.\n\n'
          : 'Conferimos logo após a exclusão: nenhum registro seu permaneceu em nossos sistemas.\n\n')
      : '') +
    'A exclusão é permanente e não pode ser desfeita.\n\n' +
    'Comprovante de atendimento ao pedido de exclusão de dados (LGPD, Lei nº 13.709/2018).\n' +
    'Dúvidas: ' + CC_CONTATO + '\n';

  return { subject: subject, html: html, text: text };
}

/* ── (2) O RELATÓRIO INTERNO FOI REMOVIDO ───────────────────────────────────
 * Existiu aqui um segundo e-mail — relatório operacional (uid, provedores, datas
 * da conta, varredura de sobras) endereçado primeiro ao e-mail pessoal do dono e
 * depois à caixa da empresa. Saiu junto com o construtor quando a regra virou
 * "APENAS o e-mail da conta excluída, com CC pra contato@barthlabs.com. Nenhum
 * outro destinatário" — e sai por completo de propósito: construtor sem chamador
 * é decoy, e é o que faz o próximo leitor consertar o lugar errado.
 *
 * O que ele carregava de útil não se perdeu, mudou de lugar: o VEREDITO da
 * varredura virou uma linha da confirmação do titular (info.swept/info.leftovers),
 * e o detalhe de máquina (quais caminhos sobraram) vai pro LOG da função, em nível
 * de erro quando sobra algo. Detalhe operacional pertence ao log, não a uma caixa.
 */

/* id determinístico: reentrega do gatilho não vira e-mail duplicado (o `create()`
 * falha se já existir). É UM id porque é UM e-mail — o sufixo _admin sumiu junto
 * com o relatório interno.
 * O Firestore aceita '/' só como separador de caminho; o uid não tem, mas sanitizo
 * por garantia. */
function mailDocId(uid) {
  return 'acctdel_' + String(uid || 'desconhecido').replace(/[^A-Za-z0-9_-]/g, '_');
}

module.exports = {
  decideDeletionNotice,
  buildUserEmail,
  mailTargets,
  mailDocId,
  fmtBR,
  CC_CONTATO
};
