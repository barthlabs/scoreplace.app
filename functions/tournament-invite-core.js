/* tournament-invite-core.js — CONVITE AVULSO DE TORNEIO, decisões puras  (L1.3a, 2.1.69)
 *
 * ⛔ O QUE ISTO TIRA DO CLIENTE, e por que era a pior superfície do inventário L1.2:
 *   · `js/views/tournaments-sharing.js` chamava `queueEmail(email, subject, html)` com o
 *     endereço vindo de um INPUT LIVRE, validado só por `email.indexOf('@') === -1`;
 *   · a UI que expõe esse campo é montada em `tournaments.js` dentro de `if (tournamentId)`
 *     e ANTES de qualquer `if (isOrg)` — ou seja, sem gate de organizador;
 *   · `firestore.rules` permite `write` em `/mail` a QUALQUER autenticado.
 * Somados: qualquer pessoa logada podia mandar e-mail com assunto e corpo escolhidos por ela
 * para qualquer endereço, saindo do remetente do produto. Não é "convite" — é um relay.
 *
 * ⭐ AGORA o cliente manda só `tournamentId` e UM e-mail candidato. Quem resolve torneio,
 * permissão, URL, remetente, assunto e HTML é o servidor.
 *
 * ⛔ POR QUE ESTA CAPABILITY ACEITA UM ENDEREÇO DO CLIENTE, ao contrário do e-mail
 * secundário: o convidado por definição NÃO TEM CONTA — não há uid pra resolver. O endereço
 * é o dado do convite. O que o torna seguro não é esconder o campo, é o conjunto: só
 * organizador/co-organizador dispara, 20 por dia por (organizador, torneio), 2 minutos entre
 * reenvios pro mesmo endereço, e nada de assunto/corpo vindo de fora.
 *
 * Puro: não lê nem escreve. Quem faz I/O é o gatilho/callable.
 */
'use strict';
const crypto = require('crypto');

const COOLDOWN_MS = 2 * 60 * 1000;   // 2 min entre reenvios pro MESMO e-mail no MESMO torneio
const LIMITE_DIARIO = 20;            // por (organizador, torneio), por dia UTC

const normalizaEmail = (raw) => String(raw == null ? '' : raw).trim().toLowerCase();

/* ⛔ VALIDAÇÃO ROBUSTA, não `indexOf('@')`. O que o cliente fazia aceitava "@", "a@b",
 * "x@y z", vírgulas (que viram MÚLTIPLOS destinatários em alguns relays) e quebras de linha
 * (injeção de cabeçalho SMTP). Aqui:
 *   · uma arroba só, com parte local e domínio não vazios;
 *   · domínio com pelo menos um ponto e TLD de 2+ letras;
 *   · nenhum caractere de controle, espaço, vírgula, ponto-e-vírgula, aspas ou < >;
 *   · comprimento total <= 254 (RFC 5321) e parte local <= 64. */
function emailValido(e) {
  const s = String(e == null ? '' : e);
  if (!s || s.length > 254) return false;
  if (/[\s,;<>"'\\()\[\]]/.test(s)) return false;          // separadores e injeção de cabeçalho
  if (/[\u0000-\u001f\u007f]/.test(s)) return false;        // controle (CR/LF = header injection)
  const partes = s.split('@');
  if (partes.length !== 2) return false;
  const [local, dominio] = partes;
  if (!local || local.length > 64 || !dominio || dominio.length > 253) return false;
  if (local.startsWith('.') || local.endsWith('.') || local.indexOf('..') !== -1) return false;
  if (!/^[A-Za-z0-9!#$%&*+/=?^_`{|}~.-]+$/.test(local)) return false;
  if (!/^[A-Za-z0-9.-]+$/.test(dominio)) return false;
  if (dominio.startsWith('-') || dominio.endsWith('-') || dominio.startsWith('.') || dominio.endsWith('.')) return false;
  if (dominio.indexOf('..') !== -1) return false;
  const rot = dominio.split('.');
  if (rot.length < 2) return false;
  return /^[A-Za-z]{2,}$/.test(rot[rot.length - 1]);
}

/** Dia UTC do limite diário. UTC e não local: o servidor não tem fuso da pessoa. */
function diaDe(agoraMs) { return new Date(Number(agoraMs)).toISOString().slice(0, 10); }

/** Chave da COTA: por (organizador, torneio, dia). */
function chaveDeCota(uid, tournamentId, agoraMs) {
  return crypto.createHash('sha256')
    .update(String(uid) + ':' + String(tournamentId) + ':' + diaDe(agoraMs)).digest('hex');
}
/** Chave do COOLDOWN: por (organizador, torneio, e-mail). Sem o dia — o freio atravessa. */
function chaveDeCooldown(uid, tournamentId, emailNorm) {
  return crypto.createHash('sha256')
    .update(String(uid) + ':' + String(tournamentId) + ':' + normalizaEmail(emailNorm)).digest('hex');
}
/* ⭐ Id determinístico do outbox: mesma lição da L1.1.1 — `.add()` duplicava no retry. */
function mailDocIdDoConvite(chaveCooldown, agoraMs) {
  return 'tinv_' + crypto.createHash('sha256')
    .update(String(chaveCooldown) + ':' + String(agoraMs)).digest('hex').slice(0, 40);
}

/** URL do torneio — montada no SERVIDOR, a partir do id canônico. */
function urlDoTorneio(tournamentId) {
  return 'https://scoreplace.app/#tournaments/' + encodeURIComponent(String(tournamentId));
}

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * O documento de /mail. ⛔ Assunto e corpo são FIXOS aqui; o cliente não fornece nenhum dos
 * dois. Os únicos dados variáveis vêm do TORNEIO CANÔNICO (lido no servidor) e do nome de
 * quem convida — todos escapados.
 */
function montaEmail(args) {
  const a = args || {};
  const alvo = normalizaEmail(a.email);
  const nomeT = String(a.tournamentName || 'Torneio');
  const url = urlDoTorneio(a.tournamentId);
  const convidante = String(a.inviterName || '').trim();
  const linhas = [];
  if (a.dateText) linhas.push('📅 ' + esc(a.dateText));
  if (a.venue) linhas.push('📍 ' + esc(a.venue));
  return {
    to: [alvo],
    replyTo: 'contato@barthlabs.com',
    message: {
      subject: 'Convite para o torneio: ' + nomeT,
      html:
        '<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;background:#0f172a;border-radius:14px;padding:28px 24px;color:#e2e8f0;">' +
          '<div style="text-align:center;margin-bottom:18px;">' +
            '<img src="https://scoreplace.app/icons/icon-192.svg" width="44" height="44" style="border-radius:10px;">' +
            '<div style="font-size:1.25rem;font-weight:800;color:#fbbf24;margin-top:10px;">🏆 ' + esc(nomeT) + '</div>' +
          '</div>' +
          '<p style="font-size:1rem;line-height:1.5;margin:0 0 14px;color:#cbd5e1;">' +
            (convidante ? '<b>' + esc(convidante) + '</b> está te convidando para este torneio.'
                        : 'Você foi convidado para este torneio.') +
          '</p>' +
          (linhas.length ? '<p style="font-size:0.9rem;line-height:1.6;margin:0 0 20px;color:#94a3b8;">' + linhas.join('<br>') + '</p>' : '') +
          '<div style="text-align:center;margin:22px 0;">' +
            '<a href="' + esc(url) + '" style="display:inline-block;background:#10b981;color:#fff;text-decoration:none;font-weight:800;font-size:0.95rem;padding:14px 30px;border-radius:10px;">Entrar no torneio</a>' +
          '</div>' +
          '<p style="font-size:0.78rem;color:#64748b;text-align:center;margin:20px 0 0;">Se você não esperava este convite, é só ignorar este e-mail.</p>' +
        '</div>',
      text: (convidante ? convidante + ' está te convidando para o torneio ' : 'Você foi convidado para o torneio ')
        + nomeT + '.\n' + (a.dateText ? a.dateText + '\n' : '') + (a.venue ? a.venue + '\n' : '') + '\n' + url
    },
    createdAt: new Date(Number(a.agora || Date.now())).toISOString()
  };
}

/** Texto de data do torneio, a partir do doc canônico. Sem I/O. */
function textoDaData(t) {
  const d = (t && (t.startDate || t.drawFirstDate)) || '';
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return m[3] + '/' + m[2] + '/' + m[1];
}

module.exports = {
  COOLDOWN_MS, LIMITE_DIARIO,
  normalizaEmail, emailValido, diaDe,
  chaveDeCota, chaveDeCooldown, mailDocIdDoConvite,
  urlDoTorneio, montaEmail, textoDaData
};
