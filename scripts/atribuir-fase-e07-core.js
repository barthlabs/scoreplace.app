'use strict';

const crypto = require('node:crypto');
const { stable } = require('./backup-torneio-operacional-core.js');
const { report } = require('./auditar-indice-fases-core.js');

const TARGET_NAMES = Object.freeze(['BT Corpus Christi 2026', 'Torneio Misto FUTVOLEI']);
const canonical = value => stable(stable(value));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const time = doc => stable(doc.updateTime);
const entry = doc => ({ path: doc.ref.path, updateTime: time(doc), hash: hash(doc.data()) });
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

function validate(tournaments, backups, requireAmbiguous = true) {
  if (!Array.isArray(tournaments) || tournaments.length !== 2 || backups.length !== 2) throw Error('alvos incompletos');
  for (let i = 0; i < 2; i++) {
    const { root, matches, results } = tournaments[i];
    const backup = backups[i];
    const data = root.data();
    if (!root.exists || data.name !== TARGET_NAMES[i] || backup.tournamentId !== root.id ||
        backup.project !== 'scoreplace-app' || !same(data, backup.tournament.data) ||
        !same(time(root), backup.tournament.updateTime)) throw Error('raiz divergente do backup');
    if (!Array.isArray(data.phases) || data.phases.length !== 1 || data.phases[0].name !== 'Fase 1' ||
        data._nPartes?.matches !== 7 || data._phaseReadCertificate != null) throw Error('configuração de fase mudou');
    if (matches.length !== 7 || results.length !== backup.subcollections.results.length ||
        backup.subcollections.matches.length !== 7) throw Error('contagem de documentos mudou');
    const matchBackup = new Map(backup.subcollections.matches.map(x => [x.id, x.data]));
    const resultBackup = new Map(backup.subcollections.results.map(x => [x.id, x.data]));
    if (matchBackup.size !== 7 || resultBackup.size !== results.length) throw Error('backup duplicado');
    for (const doc of matches) {
      const item = doc.data();
      if (!same(item, matchBackup.get(doc.id)) || item?._loc?.tipo !== 'matches' || !item.jogo ||
          (requireAmbiguous && (Object.hasOwn(item, '_phaseIndex') || Object.hasOwn(item.jogo, 'phaseIndex')))) {
        throw Error('jogo divergente ou já atribuído');
      }
    }
    for (const doc of results) {
      const item = doc.data();
      if (!same(item, resultBackup.get(doc.id)) || Object.hasOwn(item, 'jogo') ||
          Object.hasOwn(item, 'phaseIndex') || Object.hasOwn(item, '_phaseIndex')) throw Error('resultado divergente');
    }
    if (requireAmbiguous) {
      const audit = report(data, matches.map(doc => doc.data()));
      if (audit.counts.ambiguo !== 7 || audit.counts.ok !== 0 || !audit.counterMatches) throw Error('jogos não ambíguos');
    }
  }
}

function manifest(tournaments, backupHashes) {
  const entries = tournaments.map(({ root, matches, results }, index) => ({
    name: TARGET_NAMES[index], root: entry(root),
    matches: matches.map(entry).sort((a, b) => a.path.localeCompare(b.path)),
    results: results.map(entry).sort((a, b) => a.path.localeCompare(b.path)),
    backupHash: backupHashes[index]
  }));
  return { entries, digest: hash(entries) };
}

function assertManifest(current, expected) {
  if (!expected || !/^[a-f0-9]{64}$/.test(expected.digest) ||
      expected.digest !== hash(expected.entries) || !same(current, expected)) throw Error('prévia obsoleta');
}

function assertAfter(before, after) {
  for (let i = 0; i < 2; i++) {
    const prior = before[i], now = after[i];
    if (!same(entry(prior.root), entry(now.root)) || prior.matches.length !== 7 || now.matches.length !== 7 ||
        prior.results.length !== now.results.length) throw Error('pós-auditoria: contagem ou raiz divergente');
    const oldMatches = new Map(prior.matches.map(x => [x.id, x]));
    const oldResults = new Map(prior.results.map(x => [x.id, x]));
    for (const doc of now.matches) {
      const beforeDoc = oldMatches.get(doc.id);
      if (!beforeDoc) throw Error('pós-auditoria: jogo inesperado');
      const item = canonical(doc.data());
      if (item.jogo?.phaseIndex !== 0 || item._phaseIndex !== 0) throw Error('pós-auditoria: fase ausente');
      delete item.jogo.phaseIndex;
      delete item._phaseIndex;
      if (!same(item, beforeDoc.data())) throw Error('pós-auditoria: outro campo do jogo mudou');
    }
    for (const doc of now.results) {
      const old = oldResults.get(doc.id);
      if (!old || !same(entry(old), entry(doc))) throw Error('pós-auditoria: resultado mudou');
    }
    const audit = report(now.root.data(), now.matches.map(x => x.data()));
    if (audit.counts.ok !== 7 || audit.counts.ambiguo !== 0 || audit.counts.divergente !== 0 ||
        !audit.counterMatches || audit.coverage !== 'completa') throw Error('pós-auditoria: cobertura incompleta');
  }
}

module.exports = { TARGET_NAMES, hash, same, entry, validate, manifest, assertManifest, assertAfter };
