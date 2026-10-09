'use strict';
/*
 * Reserva canônica do nome de exibição.
 *
 * UID é a identidade e nunca é deduzido do nome. A política de produto, porém,
 * exige um rótulo de apresentação exclusivo. A reserva mora em
 * `displayNameClaims`, é manipulada somente por Cloud Functions e sempre na
 * mesma transação que cria ou renomeia o perfil. Não há auto-sufixo, consulta
 * client-side de terceiros ou mesclagem inferida por nome.
 */

const _dupPerson = require('./duplicate-person-core.js');
const DISPLAY_NAME_CLAIMS = 'displayNameClaims';

// Nome é apresentação, mas a política do produto exige que seja exclusivo.
// A identidade continua sendo o UID; esta chave só reserva a apresentação e
// jamais é usada para autorizar acesso a conta, torneio ou inscrição.
function normalizeDisplayNameKey(name) {
  return String(name == null ? '' : name).trim().replace(/\s+/g, ' ').toLowerCase();
}

function displayNameClaimId(name) {
  // Doc IDs não podem conter '/'. encodeURIComponent preserva a mesma chave
  // humana e produz um caminho estável para a transação e para a migração.
  return encodeURIComponent(normalizeDisplayNameKey(name));
}

function displayNameClaimRef(db, name) {
  const key = normalizeDisplayNameKey(name);
  return key ? db.collection(DISPLAY_NAME_CLAIMS).doc(displayNameClaimId(key)) : null;
}

// Reserva/libera o nome exclusivamente dentro da transação que grava o perfil.
// Retorna um veredito, em vez de lançar, para o chamador escolher a mensagem
// pública sem expor o UID do titular da reserva.
async function reserveDisplayName(tx, db, uid, nextName, previousName) {
  const nextKey = normalizeDisplayNameKey(nextName);
  const previousKey = normalizeDisplayNameKey(previousName);
  const nextRef = displayNameClaimRef(db, nextKey);
  const previousRef = previousKey && previousKey !== nextKey
    ? displayNameClaimRef(db, previousKey) : null;
  const reads = [];
  if (nextRef) reads.push(tx.get(nextRef));
  if (previousRef) reads.push(tx.get(previousRef));
  const snapshots = await Promise.all(reads);
  const nextSnap = nextRef ? snapshots[0] : null;
  const previousSnap = previousRef ? snapshots[nextRef ? 1 : 0] : null;
  const nextData = nextSnap && nextSnap.exists ? (nextSnap.data() || {}) : {};
  const ownerUid = String(nextData.uid || '');
  // Colisão legada fica reservada até revisão: ninguém toma este nome
  // silenciosamente, inclusive um dos UIDs envolvidos.
  if (nextRef && nextSnap && nextSnap.exists && nextData.state === 'conflict') {
    return { ok: false, code: 'taken' };
  }
  if (nextRef && ownerUid && ownerUid !== String(uid)) {
    return { ok: false, code: 'taken' };
  }
  if (previousRef && previousSnap && previousSnap.exists) {
    const previousData = previousSnap.data() || {};
    if (String(previousData.uid || '') === String(uid)) {
      tx.delete(previousRef);
    } else if (previousData.state === 'conflict' && Array.isArray(previousData.uids)) {
      const remaining = previousData.uids.filter((candidate) => String(candidate) !== String(uid));
      if (remaining.length === 1) {
        tx.set(previousRef, { state: 'active', uid: String(remaining[0]), uids: [], updatedAt: new Date().toISOString() }, { merge: true });
      } else {
        tx.set(previousRef, { uids: remaining, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }
  }
  if (nextRef) {
    tx.set(nextRef, {
      uid: String(uid), key: nextKey, displayName: String(nextName).trim().replace(/\s+/g, ' '),
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  }
  return { ok: true };
}

// Espelha window._isUnfriendlyName (store.js): só placeholders genéricos são
// "não-nome" e ficam fora da disputa de unicidade. Telefone/e-mail como nome é
// identificador válido de conta phone-only (v1.8.60) — mas também não disputa
// unicidade de NOME DE PESSOA, então tratamos igual ao cliente: passa direto.
function isUnfriendlyName(name) {
  if (!name) return true;
  const n = String(name).trim().toLowerCase();
  if (!n) return true;
  const BAD = ['usuário', 'usuario', 'user', 'teste', 'test', 'undefined', 'null', 'anon', 'anônimo', 'visitante'];
  return BAD.indexOf(n) !== -1;
}

// E-mail sintético de conta phone-only NUNCA aparece pra usuário (espelha
// _isSyntheticEmail de index.js/store.js).
function isSyntheticEmail(email) {
  return typeof email === 'string' && /@phone\.scoreplace\.app$/i.test(email.trim());
}

// Máscaras — mesmas de index.js (_maskEmail/_maskPhone). Duplicadas aqui de
// propósito: index.js não é require-ável em teste (inicializa admin/secrets).
function maskEmail(email) {
  if (!email || String(email).indexOf('@') < 0) return null;
  const parts = String(email).split('@');
  const local = parts[0];
  const head = local.slice(0, Math.min(2, local.length));
  return head + '***@' + parts[1];
}
function maskPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 4) return null;
  return '(••) •••••-••' + d.slice(-2);
}

// Denormaliza o par displayName/displayName_lower num payload de perfil — o MESMO
// contrato do saveUserProfile do cliente. Todo write de nome no servidor passa
// por aqui pra que a conta seja encontrável pelas checagens futuras.
function denormalizeDisplayName(profilePayload, displayName) {
  const nm = String(displayName == null ? '' : displayName).trim();
  if (!nm) return profilePayload;
  profilePayload.displayName = nm;
  profilePayload.displayName_lower = nm.toLowerCase();
  // v1.8.3 — CHAVES DE BUSCA DE DUPLICATA. `displayName_lower` é `toLowerCase()` cru:
  // preserva acento, ponto e espaço, então "Dėbora Castello" nunca casa com "Debora
  // Castello" e "M.Delia" nunca casa com "MDelia". Era esse o furo pelo qual duas pessoas
  // ficaram com duas contas cada no MESMO torneio (Confra, 11/ago/2026) — a comparação
  // sabia resolver, mas a consulta nunca entregava o candidato. Estas chaves são geradas
  // pela MESMA função que compara, pra que buscar e comparar deixem de divergir.
  // Ver [[project_duplicate_detection_two_normalizations]].
  profilePayload.displayName_keys = _dupPerson.chavesDeBusca(nm);
  profilePayload.displayName_lastkey = _dupPerson.chaveSobrenome(nm);
  profilePayload.displayName_firstkey = _dupPerson.chavePrimeiroNome(nm);
  return profilePayload;
}

// Não existe resolvedor de variante: nome repetido exige outro nome ou revisão
// explícita da conta; nunca se cria "Nome 2" automaticamente.

module.exports = {
  DISPLAY_NAME_CLAIMS,
  normalizeDisplayNameKey,
  displayNameClaimId,
  displayNameClaimRef,
  reserveDisplayName,
  isUnfriendlyName,
  isSyntheticEmail,
  maskEmail,
  maskPhone,
  denormalizeDisplayName,
};
