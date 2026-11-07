'use strict';
const crypto = require('crypto');

const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const roles = { cohost: 'co-organizador', referee: 'árbitro' };
function normalizePhone(parts) {
  const ddi = String(parts && parts.ddi || '').replace(/\D/g, '');
  const ddd = String(parts && parts.ddd || '').replace(/\D/g, '');
  const number = String(parts && parts.number || '').replace(/\D/g, '');
  const digits = ddi + ddd + number;
  if (!/^\d{1,3}$/.test(ddi) || !/^\d{1,4}$/.test(ddd) || !/^\d{6,10}$/.test(number) ||
      digits.length < 10 || digits.length > 15) return '';
  if (ddi === '55' && (ddd.length !== 2 || !/^[1-9][0-9]$/.test(ddd) ||
      (number.length !== 8 && number.length !== 9))) return '';
  return '+' + digits;
}
const esc = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function newSecret() {
  const inviteId = crypto.randomBytes(18).toString('hex');
  const token = crypto.randomBytes(32).toString('hex');
  return { inviteId, token, tokenHash: hash(token), mailId: 'trole_' + inviteId };
}
function hash(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function matchesHash(saved, token) {
  if (!/^[a-f0-9]{64}$/.test(String(saved || '')) || !/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(saved, 'hex'), Buffer.from(hash(token), 'hex'));
}
function link(inviteId, token) {
  return 'https://scoreplace.app/#role-invite/' + encodeURIComponent(inviteId) + '/' + encodeURIComponent(token);
}
function mailDoc({ email, role, tournamentName, inviterName, inviteId, token, now }) {
  if (!roles[role]) throw new Error('cargo inválido');
  const title = roles[role];
  const url = link(inviteId, token);
  const name = String(tournamentName || 'Torneio').slice(0, 240);
  const sender = String(inviterName || 'A organização').slice(0, 160);
  return {
    to: [email], replyTo: 'contato@barthlabs.com', createdAt: new Date(now).toISOString(),
    message: {
      subject: 'Convite para ser ' + title + ' no torneio ' + name,
      html: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#111827">' +
        '<h1>Convite para ' + esc(title) + '</h1><p>' + esc(sender) + ' convidou você para atuar como ' +
        esc(title) + ' em <b>' + esc(name) + '</b>.</p>' +
        '<p>Entre no scoreplace.app com este e-mail verificado para ativar o acesso.</p>' +
        '<p><a href="' + esc(url) + '">Abrir convite</a></p>' +
        '<p>Se você não esperava este convite, ignore esta mensagem.</p></div>',
      text: sender + ' convidou você para atuar como ' + title + ' em ' + name +
        '.\nEntre com este e-mail verificado para ativar o acesso: ' + url
    }
  };
}
module.exports = { EXPIRY_MS, roles, normalizePhone, newSecret, hash, matchesHash, link, mailDoc };
