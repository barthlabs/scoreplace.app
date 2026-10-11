'use strict';

/*
 * Recortes puros para aplicar um manifesto de inscrições em operações pequenas.
 *
 * Não abre conexão, não escreve Firestore e não decide se a migração pode
 * começar. A execução externa deve fornecer a confirmação explícita do recibo,
 * reler cada torneio e fazer cada recorte em um único commit transacional.
 */

const { verifyPlan, stableHash } = require('./registration-batch-plan-core');

function positiveInt(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(label + ' inválido');
  return number;
}

function batchPlan(plan, options) {
  const verified = verifyPlan(plan);
  const opts = options || {};
  const batchSize = Math.min(10, positiveInt(opts.batchSize || 5, 'tamanho do lote'));
  const afterTournamentId = typeof opts.afterTournamentId === 'string' ? opts.afterTournamentId.trim() : '';
  const remaining = afterTournamentId
    ? verified.tournaments.filter((item) => item.tournamentId > afterTournamentId)
    : verified.tournaments.slice();
  const items = remaining.slice(0, batchSize);
  return {
    manifestFingerprint: verified.manifestFingerprint,
    batchSize,
    cursor: afterTournamentId || null,
    items,
    nextCursor: items.length ? items[items.length - 1].tournamentId : null,
    remaining: remaining.length,
    complete: items.length === 0,
  };
}

/* Assina só os IDs e fingerprints que o servidor deve receber nesta chamada.
 * O manifesto completo continua sendo o artefato humano/auditável; esta
 * assinatura menor impede que a requisição seja truncada, reordenada ou tenha
 * um torneio trocado no trajeto até a Function. */
function requestFingerprint(batch) {
  const items = batch && Array.isArray(batch.items) ? batch.items : [];
  if (!items.length) throw new Error('lote vazio não pode ser aplicado');
  return stableHash(items.map((item) => ({
    tournamentId: String(item.tournamentId || ''),
    fingerprint: String(item.fingerprint || ''),
  })));
}

function batchRequest(batch) {
  return {
    manifestFingerprint: String(batch && batch.manifestFingerprint || ''),
    requestFingerprint: requestFingerprint(batch),
    items: (batch && Array.isArray(batch.items) ? batch.items : []).map((item) => ({
      tournamentId: item.tournamentId,
      fingerprint: item.fingerprint,
    })),
  };
}

function verifyBatchReceipt(batch, receipt) {
  const planned = batch && Array.isArray(batch.items) ? batch.items : [];
  const results = receipt && Array.isArray(receipt.results) ? receipt.results : [];
  if (!planned.length) throw new Error('lote vazio não possui recibo');
  if (results.length !== planned.length) throw new Error('recibo incompleto');
  const expected = new Map(planned.map((item) => [item.tournamentId, item]));
  const seen = new Set();
  results.forEach((result) => {
    const id = String(result && result.tournamentId || '').trim();
    const item = expected.get(id);
    if (!item || seen.has(id)) throw new Error('recibo contém torneio inesperado');
    seen.add(id);
    if (String(result.fingerprint || '') !== item.fingerprint) throw new Error('recibo com fingerprint divergente');
    if (!['migrated', 'already_migrated', 'blocked'].includes(result.outcome)) throw new Error('resultado de migração inválido');
    // Bloqueio não afirma uma contagem: a transação recusou o estado atual e
    // o operador deve gerar prévia nova. Exigir a contagem antiga aqui seria
    // transformar o próprio recibo de segurança numa falsa confirmação.
    if (result.outcome === 'blocked') return;
    if (!Number.isInteger(result.registrations) || result.registrations !== item.registrations) {
      throw new Error('recibo com contagem divergente');
    }
  });
  const blocked = results.filter((result) => result.outcome === 'blocked').length;
  return { verified: true, tournaments: planned.length, blocked, nextCursor: batch.nextCursor };
}

module.exports = { batchPlan, requestFingerprint, batchRequest, verifyBatchReceipt };
