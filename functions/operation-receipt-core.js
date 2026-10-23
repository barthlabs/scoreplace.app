'use strict';
const crypto = require('node:crypto');
// Igual à validação de operationId já usada pelo grupo do torneio.
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('número inválido na intenção');
    return value;
  }
  if (Array.isArray(value)) return value.map(canonical);
  // Aceita objeto JSON também quando nasceu em outro realm (shim do motor ou
  // teste VM), mas recusa instâncias como Date/Timestamp/classes.
  const proto = typeof value === 'object' && value ? Object.getPrototypeOf(value) : null;
  if (proto && Object.getPrototypeOf(proto) === null) {
    const out = {};
    Object.keys(value).sort().forEach(key => {
      if (value[key] !== undefined) out[key] = canonical(value[key]);
    });
    return out;
  }
  throw new Error('tipo inválido na intenção');
}

function prepare({ operationId, actorUid, parentPath, kind, target, action, payload }) {
  if (!UUID_V4_RE.test(String(operationId || ''))) throw new Error('operationId tem que ser um UUID v4');
  if (!actorUid || !/^(tournaments|sandboxes)\/[A-Za-z0-9_-]+$/.test(String(parentPath || '')) || !kind) {
    throw new Error('identidade da intenção inválida');
  }
  const envelope = canonical({ operationId: String(operationId).toLowerCase(),
    actorUid: String(actorUid), parentPath: String(parentPath), kind: String(kind),
    target: String(target || ''), action: String(action || ''), payload: payload == null ? null : payload });
  const hash = crypto.createHash('sha256').update(JSON.stringify(envelope)).digest('hex');
  return { id: envelope.operationId, actorUid: envelope.actorUid, kind: envelope.kind, hash };
}

function matches(receipt, prepared) {
  return !!receipt && receipt.actorUid === prepared.actorUid &&
    receipt.kind === prepared.kind && receipt.hash === prepared.hash;
}

function document(prepared, response, now = Date.now()) {
  return { schema: 1, actorUid: prepared.actorUid, kind: prepared.kind, hash: prepared.hash,
    response: canonical(response), committedAt: new Date(now), expireAt: new Date(now + RETENTION_MS) };
}

function replay(receipt) {
  // O recibo nunca guarda o torneio inteiro. O roteador B2 deve reler o estado
  // canônico antes de confirmar visualmente um replay; clientes antigos não
  // enviam operationId nestas operações e não entram neste caminho.
  return Object.assign({}, receipt.response || {}, { replayed: true, requiresRefresh: true });
}

module.exports = { UUID_V4_RE, RETENTION_MS, canonical, prepare, matches, document, replay };
