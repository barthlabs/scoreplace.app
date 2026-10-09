'use strict';

const { planLegacyPhaseProjection, verifyProjectedDocument } = require('../functions/legacy-phase-projection-core');

async function runOne(options) {
  const opts = options || {};
  const tournamentId = String(opts.tournamentId || '').trim();
  if (!tournamentId) throw new Error('--id é obrigatório');
  if (typeof opts.load !== 'function' || typeof opts.write !== 'function' || typeof opts.project !== 'function') {
    throw new Error('transporte ou projetor indisponível');
  }
  const first = await opts.load(tournamentId);
  if (!first || !first.tournament) throw new Error('torneio não existe');
  const plan = planLegacyPhaseProjection(first.tournament, opts.project, {
    tournamentId,
    updateTime: first.updateTime,
  });
  if (!opts.apply) return { outcome: plan.changed ? 'planned' : 'unchanged', plan };
  const expected = String(opts.fingerprint || '').trim();
  if (!expected) throw new Error('--apply exige --fingerprint');
  if (expected !== plan.fingerprint) throw new Error('recibo divergente; gere um novo dry-run antes de aplicar');
  if (!plan.changed) return { outcome: 'unchanged', plan };

  // A escrita é CAS: o transporte deve enviar currentDocument.updateTime.
  // Se outro ator alterar o doc após a releitura, o PATCH falha sem sobrescrever.
  await opts.write(tournamentId, plan.phases, first.updateTime);
  const after = await opts.load(tournamentId);
  if (!after || !after.tournament) throw new Error('torneio sumiu após a escrita');
  const verification = verifyProjectedDocument(tournamentId, first.tournament, after.tournament, plan, opts.project);
  return {
    outcome: 'applied',
    plan,
    verificationFingerprint: verification.fingerprint,
    verifiedUpdateTime: String(after.updateTime || '')
  };
}

module.exports = { runOne };
