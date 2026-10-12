'use strict';

/*
 * Planejamento puro de uma materialização canônica em lote.
 *
 * Este módulo NÃO conhece Firestore e NÃO escreve. Ele recebe os relatórios
 * que já foram validados individualmente e produz um manifesto estável para
 * revisão humana. A aplicação futura deve reler cada torneio e comparar o
 * fingerprint antes de abrir sua própria transação; este manifesto nunca é
 * autorização implícita para uma escrita.
 */

const crypto = require('crypto');

function text(value) { return typeof value === 'string' ? value.trim() : ''; }

function asCount(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(label + ' inválido');
  return value;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizeItem(item) {
  const source = item || {};
  const tournamentId = text(source.tournamentId);
  const fingerprint = text(source.fingerprint);
  const updateTime = text(source.updateTime);
  if (!tournamentId || !fingerprint || !updateTime) throw new Error('item de materialização incompleto');
  const registrations = asCount(source.registrations, 'inscrições');
  const formedPairs = asCount(source.formedPairs || 0, 'duplas');
  const conflicts = asCount(source.conflicts || 0, 'conflitos');
  const unsupported = asCount(source.unsupported || 0, 'sem-suporte');
  const divergent = asCount(source.divergent || 0, 'divergências');
  const unexpectedExisting = asCount(source.unexpectedExisting || 0, 'documentos fora da projeção');
  const historicalExisting = asCount(source.historicalExisting || 0, 'histórico aposentado');
  const creates = asCount(source.creates, 'criações');
  const already = asCount(source.already || 0, 'já materializadas');
  // O manifesto assinado só precisa reter a decisão final (`already`). O
  // contador bruto é útil durante o censo, mas seria redundante no recibo.
  const existing = asCount(source.existing == null ? already : source.existing, 'documentos existentes');
  if (conflicts || unsupported || divergent || unexpectedExisting) throw new Error('item contém exceção e não pode entrar no lote');
  if (creates + already !== registrations) throw new Error('contagem canônica não confere');
  if (existing !== already + historicalExisting + unexpectedExisting) throw new Error('documentos existentes divergem da decisão');
  return { tournamentId, fingerprint, updateTime, registrations, formedPairs, creates, already, historicalExisting };
}

function planBatch(items, generatedAt) {
  if (!Array.isArray(items) || !items.length) throw new Error('lote vazio');
  const ids = new Set();
  const tournaments = items.map(normalizeItem).sort((a, b) => a.tournamentId.localeCompare(b.tournamentId));
  tournaments.forEach((item) => {
    if (ids.has(item.tournamentId)) throw new Error('torneio duplicado no lote');
    ids.add(item.tournamentId);
  });
  const createdAt = text(generatedAt);
  if (!createdAt) throw new Error('instante do plano obrigatório');
  const totals = tournaments.reduce((acc, item) => {
    acc.tournaments += 1;
    acc.registrations += item.registrations;
    acc.formedPairs += item.formedPairs;
    acc.creates += item.creates;
    acc.already += item.already;
    acc.historicalExisting += item.historicalExisting;
    return acc;
  }, { tournaments: 0, registrations: 0, formedPairs: 0, creates: 0, already: 0, historicalExisting: 0 });
  const unsigned = {
    schemaVersion: 1,
    generatedAt: createdAt,
    purpose: 'canonical-registration-materialization',
    totals,
    tournaments,
  };
  return Object.assign({}, unsigned, { manifestFingerprint: stableHash(unsigned) });
}

/* Ponte única entre a fotografia de uma Function e o manifesto puro. Mantê-la
 * aqui evita que a tela ou uma nova callable reconstrua contagens/fingerprints
 * por conta própria e introduza um segundo formato de lote. */
function planFromMigrationPreviews(previews, generatedAt) {
  if (!Array.isArray(previews) || !previews.length) throw new Error('prévia de lote vazia');
  return planBatch(previews.map((item) => {
    const source = item || {};
    const summary = source.summary || {};
    return {
      tournamentId: source.tournamentId,
      fingerprint: source.fingerprint,
      updateTime: source.updateTime,
      registrations: summary.registrations,
      formedPairs: summary.formedPairs,
      conflicts: summary.conflicts,
      unsupported: summary.unsupported,
      divergent: summary.divergent,
      unexpectedExisting: summary.unexpectedExisting,
      historicalExisting: summary.historicalExisting,
      creates: summary.creates,
      already: summary.already,
      existing: (summary.already || 0) + (summary.historicalExisting || 0),
    };
  }), generatedAt);
}

function verifyPlan(plan) {
  const source = plan || {};
  const expected = text(source.manifestFingerprint);
  const unsigned = {
    schemaVersion: source.schemaVersion,
    generatedAt: source.generatedAt,
    purpose: source.purpose,
    totals: source.totals,
    tournaments: source.tournaments,
  };
  if (source.schemaVersion !== 1 || source.purpose !== 'canonical-registration-materialization') {
    throw new Error('manifesto incompatível');
  }
  if (!expected || stableHash(unsigned) !== expected) throw new Error('manifesto adulterado ou vencido');
  const rebuilt = planBatch(source.tournaments, source.generatedAt);
  if (JSON.stringify(rebuilt.totals) !== JSON.stringify(source.totals) || rebuilt.manifestFingerprint !== expected) {
    throw new Error('totais do manifesto divergentes');
  }
  return rebuilt;
}

module.exports = { planBatch, planFromMigrationPreviews, verifyPlan, stableHash };
