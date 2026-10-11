'use strict';

/*
 * Recortes puros para aplicar um manifesto de inscrições em operações pequenas.
 *
 * Não abre conexão, não escreve Firestore e não decide se a migração pode
 * começar. A execução externa deve fornecer a confirmação explícita do recibo,
 * reler cada torneio e fazer cada recorte em um único commit transacional.
 */

const { verifyPlan } = require('./registration-batch-plan-core');

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
    if (!['migrated', 'already_migrated'].includes(result.outcome)) throw new Error('resultado de migração inválido');
    if (!Number.isInteger(result.registrations) || result.registrations !== item.registrations) {
      throw new Error('recibo com contagem divergente');
    }
  });
  return { verified: true, tournaments: planned.length, nextCursor: batch.nextCursor };
}

module.exports = { batchPlan, verifyBatchReceipt };
