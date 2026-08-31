/* invite-email-core.js — CONVITE DE DUPLA E DE CO-ORGANIZAÇÃO, decisões puras  (L1.1, 2.1.75)
 *
 * ⛔ O QUE ISTO TIRA DO CLIENTE. Até a 2.1.74, `js/views/tournaments-organizer.js` montava o
 * ASSUNTO, o HTML e os deep-links dos dois convites no navegador e chamava
 * `FirestoreDB.queueEmail(emails, subject, html)` → `.add()` em `/mail`. Com
 * `firestore.rules` aceitando write de qualquer autenticado, isso é um relay: destinatário,
 * assunto e corpo escolhidos por quem chama, saindo do remetente do produto.
 *
 * ⭐ AGORA o cliente manda só IDENTIFICADORES — `tournamentId` + o uid do convidado. Quem
 * resolve torneio, permissão, destinatário, URL, assunto e HTML é o servidor.
 *
 * ⭐ E A AUTORIZAÇÃO É O CONVITE PERSISTIDO, não um campo do payload:
 *   · dupla        → existe `pairRequests[]` com `inviterUid === quem chama` e o
 *                    `inviteeUid` pedido;
 *   · co-organização → quem chama é organizador/co-host ativo E o alvo está em
 *                    `coHosts[]` com `status === 'pending'`.
 * Mentir no payload não abre caminho nenhum: sem o registro no documento, recusa.
 *
 * ⭐ IDEMPOTÊNCIA PELA IDENTIDADE DO CONVITE, não pelo instante da chamada. A chave sai do
 * REGISTRO — `(torneio, id do convite, carimbo do convite)`. Reentrega/retry do MESMO
 * convite cai no MESMO documento e a extensão manda UMA vez; recusar e convidar de novo
 * gera um registro com carimbo novo, logo chave nova, logo e-mail novo — que é o
 * comportamento legítimo. ⚠️ Derivar do `Date.now()` da chamada quebraria as duas metades
 * ao mesmo tempo: duplicaria o retry e não distinguiria o convite novo.
 *
 * Puro: não lê nem escreve. Quem faz I/O é functions/index.js.
 */
'use strict';
const crypto = require('crypto');

const normalizaEmail = (raw) => String(raw == null ? '' : raw).trim().toLowerCase();

/* ⛔ O DESTINATÁRIO SAI DO PERFIL, NO SERVIDOR — nunca do payload. Espelha exatamente o que
 * o cliente fazia em `_sendUserNotification`: principal + `linkedEmails` (vinculados por
 * prova de posse), dedup case-insensitive, e o opt-out `notifyEmail === false` cala tudo.
 * Manter a MESMA régua importa: uma segunda definição divergiria e mandaria e-mail pra
 * quem pediu para não receber. */
function destinatariosDoPerfil(perfil) {
  const p = perfil || {};
  if (p.notifyEmail === false) return [];
  const vistos = {}, out = [];
  const põe = (e) => {
    const k = normalizaEmail(e);
    if (k && k.indexOf('@') > 0 && !vistos[k]) { vistos[k] = true; out.push(k); }
  };
  põe(p.email);
  if (Array.isArray(p.linkedEmails)) p.linkedEmails.forEach(põe);
  return out;
}

const _hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/** Chave do convite de DUPLA: torneio + id do convite + carimbo de criação. */
function chaveDoConvitePar(tournamentId, req) {
  const r = req || {};
  return _hash(String(tournamentId) + '\n' + String(r.id || '') + '\n' + String(r.createdAt || ''));
}
/** Chave do convite de CO-ORGANIZAÇÃO: torneio + uid do alvo + `invitedAt` da entrada. */
function chaveDoConviteCoHost(tournamentId, entry) {
  const e = entry || {};
  return _hash(String(tournamentId) + '\n' + String(e.uid || '') + '\n' + String(e.invitedAt || ''));
}
function mailDocIdDoPar(chave) { return 'pairinv_' + String(chave).slice(0, 40); }
function mailDocIdDoCoHost(chave) { return 'chinv_' + String(chave).slice(0, 40); }

/* ⭐ OS DEEP-LINKS SÃO MONTADOS AQUI, do id canônico — eram montados no navegador e
 * viajavam no payload. Um link vindo de fora é um link pra onde quem chamou quiser. */
function urlsDoPar(tournamentId, requestId) {
  const base = 'https://scoreplace.app/#pair/';
  const t = encodeURIComponent(String(tournamentId));
  const r = encodeURIComponent(String(requestId));
  return { aceitar: base + 'accept/' + t + '/' + r, recusar: base + 'reject/' + t + '/' + r };
}
function urlsDoCoHost(tournamentId) {
  const base = 'https://scoreplace.app/#cohost/';
  const t = encodeURIComponent(String(tournamentId));
  return { aceitar: base + 'accept/' + t + '/cohost', recusar: base + 'reject/' + t + '/cohost' };
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/* O corpo é o MESMO desenho que o cliente montava (dois botões, Recusar à esquerda e
 * Aceitar à direita — ordem do dono na v2.7.94/v2.8.52). O que mudou é QUEM monta: o
 * assunto e o HTML são fixos aqui, e os únicos dados variáveis vêm do documento canônico
 * lido no servidor, escapados. */
function _corpo(args) {
  const a = args || {};
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;border-radius:14px;padding:28px 24px;color:#e2e8f0;">' +
      '<div style="font-size:1.3rem;font-weight:800;margin-bottom:6px;color:#fbbf24;">' + a.titulo + '</div>' +
      '<p style="font-size:1rem;line-height:1.5;margin:0 0 22px;color:#cbd5e1;">' + a.frase + '</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>' +
        '<td style="padding:0 6px;"><a href="' + esc(a.recusar) + '" style="display:inline-block;background:#ef4444;color:#fff;text-decoration:none;font-weight:800;font-size:0.95rem;padding:13px 26px;border-radius:10px;">❌ Recusar</a></td>' +
        '<td style="padding:0 6px;"><a href="' + esc(a.aceitar) + '" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-weight:800;font-size:0.95rem;padding:13px 26px;border-radius:10px;">✅ Aceitar</a></td>' +
      '</tr></table>' +
      '<p style="font-size:0.78rem;color:#64748b;margin:22px 0 0;text-align:center;">Clique em um botão pra responder — você será levado ao torneio.</p>' +
    '</div>';
}

/** Documento de /mail do convite de DUPLA. */
function montaEmailPar(args) {
  const a = args || {};
  const nomeT = String(a.tournamentName || '');
  const quem = String(a.inviterName || 'Alguém');
  const u = urlsDoPar(a.tournamentId, a.requestId);
  return {
    to: (a.destinatarios || []).map(normalizaEmail),
    replyTo: 'contato@barthlabs.com',
    message: {
      subject: '🤝 Convite de dupla — ' + (nomeT || 'scoreplace.app'),
      html: _corpo({
        titulo: '🤝 Convite de dupla',
        frase: '<b>' + esc(quem) + '</b> quer formar dupla com você' + (nomeT ? ' em <b>' + esc(nomeT) + '</b>' : '') + '.',
        aceitar: u.aceitar, recusar: u.recusar
      }),
      text: quem + ' quer formar dupla com você' + (nomeT ? ' em ' + nomeT : '') + '.\n\n' +
            'Aceitar: ' + u.aceitar + '\nRecusar: ' + u.recusar
    },
    createdAt: new Date(Number(a.agora || Date.now())).toISOString()
  };
}

/** Documento de /mail do convite de CO-ORGANIZAÇÃO. */
function montaEmailCoHost(args) {
  const a = args || {};
  const nomeT = String(a.tournamentName || '');
  const quem = String(a.inviterName || 'O organizador');
  const u = urlsDoCoHost(a.tournamentId);
  return {
    to: (a.destinatarios || []).map(normalizaEmail),
    replyTo: 'contato@barthlabs.com',
    message: {
      subject: '👑 Convite de co-organização — ' + (nomeT || 'scoreplace.app'),
      html: _corpo({
        titulo: '👑 Convite de co-organização',
        frase: '<b>' + esc(quem) + '</b> convidou você pra <b>co-organizar</b>' + (nomeT ? ' <b>' + esc(nomeT) + '</b>' : '') + '.',
        aceitar: u.aceitar, recusar: u.recusar
      }),
      text: quem + ' convidou você pra co-organizar' + (nomeT ? ' ' + nomeT : '') + '.\n\n' +
            'Aceitar: ' + u.aceitar + '\nRecusar: ' + u.recusar
    },
    createdAt: new Date(Number(a.agora || Date.now())).toISOString()
  };
}

/** O convite de DUPLA persistido de (quem convida → convidado). `null` se não existe. */
function achaConvitePar(t, inviterUid, inviteeUid) {
  if (!t || !inviterUid || !inviteeUid) return null;
  const lista = Array.isArray(t.pairRequests) ? t.pairRequests : [];
  for (let i = 0; i < lista.length; i++) {
    const r = lista[i];
    if (r && r.inviterUid === inviterUid && r.inviteeUid === inviteeUid) return r;
  }
  return null;
}

/** A entrada de co-host PENDENTE do uid. `null` se não existe ou já respondeu.
 *  ⚠️ Mesma régua de `cohost-core.pendingCoHostIndex` — só uid, nunca e-mail. */
function achaCoHostPendente(t, targetUid) {
  if (!t || !targetUid) return null;
  const lista = Array.isArray(t.coHosts) ? t.coHosts : [];
  for (let i = 0; i < lista.length; i++) {
    const ch = lista[i];
    if (ch && ch.status === 'pending' && ch.uid && ch.uid === targetUid) return ch;
  }
  return null;
}

module.exports = {
  normalizaEmail, destinatariosDoPerfil,
  chaveDoConvitePar, chaveDoConviteCoHost, mailDocIdDoPar, mailDocIdDoCoHost,
  urlsDoPar, urlsDoCoHost, montaEmailPar, montaEmailCoHost,
  achaConvitePar, achaCoHostPendente
};
