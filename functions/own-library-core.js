'use strict';

// Dados de biblioteca pessoal não são identidade, placar ou configuração viva de
// torneio. Ainda assim, não podem ser um envelope ilimitado vindo do navegador:
// o servidor fixa o dono, a data e a forma serializável antes de persistir.
const MAX_TEMPLATE_BYTES = 800 * 1024;
const MAX_NOTIFICATION_IDS = 400;
const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,200}$/;

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizeTemplate(input) {
  if (!isPlainObject(input)) throw new Error('template inválido');
  let json;
  try { json = JSON.stringify(input); }
  catch (_) { throw new Error('template não serializável'); }
  if (!json || Buffer.byteLength(json, 'utf8') > MAX_TEMPLATE_BYTES) {
    throw new Error('template excede o limite permitido');
  }
  const out = JSON.parse(json);
  // Metadados são exclusivamente do servidor; um template nunca escolhe dono ou id.
  delete out._id;
  delete out.createdAt;
  delete out.ownerUid;
  return out;
}

function normalizeNotificationIds(input) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_NOTIFICATION_IDS) {
    throw new Error('lista de notificações inválida');
  }
  const seen = new Set();
  input.forEach((value) => {
    const id = String(value || '');
    if (!DOCUMENT_ID.test(id)) throw new Error('id de notificação inválido');
    seen.add(id);
  });
  return Array.from(seen);
}

function normalizeDocumentId(input, label) {
  const id = String(input || '');
  if (!DOCUMENT_ID.test(id)) throw new Error((label || 'id') + ' inválido');
  return id;
}

module.exports = { MAX_TEMPLATE_BYTES, MAX_NOTIFICATION_IDS, normalizeTemplate, normalizeNotificationIds, normalizeDocumentId };
