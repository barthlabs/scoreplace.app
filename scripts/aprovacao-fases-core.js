'use strict';

const { validTimestamp } = require('./backup-torneio-operacional-core');

function parseArgs(args) {
  if (!args.length) return { apply: false };
  if (args.length !== 5) throw new Error('uso: sem argumentos, ou --apply --manifest-fingerprint <recibo> --aprovacoes <arquivo>');
  const seen = new Set();
  const out = { apply: true };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (!['--apply', '--manifest-fingerprint', '--aprovacoes'].includes(flag) || seen.has(flag)) {
      throw new Error('flag inválida ou repetida: ' + flag);
    }
    seen.add(flag);
    if (flag === '--apply') continue;
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error('valor ausente para ' + flag);
    if (flag === '--manifest-fingerprint') out.expected = value;
    else out.approvalFile = value;
  }
  if (seen.size !== 3 || !out.expected || !out.approvalFile) throw new Error('flags de aplicação incompletas');
  return out;
}

function normalizedTime(value) {
  if (validTimestamp(value)) return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  if (typeof value !== 'string') throw new Error('updateTime ausente ou inválido');
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new Error('updateTime REST inválido');
  const seconds = Date.parse(match[1] + match[3]);
  if (!Number.isFinite(seconds) || !Number.isSafeInteger(seconds / 1000)) throw new Error('updateTime REST fora do intervalo');
  const nanoseconds = Number((match[2] || '').padEnd(9, '0'));
  return { seconds: seconds / 1000, nanoseconds };
}

function sameTime(left, right) {
  const a = normalizedTime(left);
  const b = normalizedTime(right);
  return a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
}

function validateApprovals({ manifest, approvals, receipts }) {
  if (!manifest || !manifest.ready || !Array.isArray(manifest.pending) || (manifest.exceptions || []).length) {
    throw new Error('manifesto de fases indisponível ou com exceções');
  }
  if (!Array.isArray(approvals) || !approvals.length) throw new Error('aprovações individuais ausentes');
  const pending = new Map(manifest.pending.map((item) => [item.tournamentId, item]));
  const seen = new Set();
  const approved = [];
  for (const approval of approvals) {
    if (!approval || typeof approval !== 'object' || Array.isArray(approval) ||
      Object.keys(approval).sort().join(',') !== 'backupManifestPath,fingerprint,tournamentId' ||
      !['tournamentId', 'fingerprint', 'backupManifestPath'].every((key) => typeof approval[key] === 'string' && approval[key].trim())) {
      throw new Error('aprovação deve conter apenas tournamentId, fingerprint e backupManifestPath não vazios');
    }
    const id = approval.tournamentId;
    if (seen.has(id)) throw new Error('aprovação duplicada: ' + id);
    seen.add(id);
    const item = pending.get(id);
    if (!item) throw new Error('torneio não pendente no manifesto: ' + id);
    if (approval.fingerprint !== item.fingerprint) throw new Error('fingerprint individual divergente: ' + id);
    const receipt = receipts && receipts.get(id);
    if (!receipt || receipt.path !== approval.backupManifestPath) throw new Error('backup não foi verificado: ' + id);
    const payload = receipt.payload;
    const backupManifest = receipt.manifest;
    if (!payload || !backupManifest || payload.schema !== 'scoreplace/tournament-operational-backup/1' ||
      backupManifest.schema !== payload.schema || payload.project !== 'scoreplace-app' ||
      backupManifest.project !== payload.project || payload.tournamentId !== id ||
      payload.tournament?.id !== id || backupManifest.tournamentId !== id ||
      backupManifest.sha256 !== receipt.sha256) {
      throw new Error('recibo de backup incompatível: ' + id);
    }
    if (!sameTime(payload.tournament.updateTime, backupManifest.tournamentUpdateTime) ||
      !sameTime(payload.tournament.updateTime, item.updateTime)) {
      throw new Error('backup não corresponde ao estado atual do torneio: ' + id);
    }
    approved.push(item);
  }
  return approved;
}

module.exports = { parseArgs, normalizedTime, sameTime, validateApprovals };
