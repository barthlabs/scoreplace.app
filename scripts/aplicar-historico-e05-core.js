'use strict';

const { stable, digest } = require('./backup-torneio-operacional-core.js');
const MAX_DELETES = 450;
const MAX_BYTES = 4 * 1024 * 1024;

function entry(doc) {
  if (!doc || !doc.ref || typeof doc.ref.path !== 'string' ||
      !/^users\/[^/]+\/matchHistory\/[^/]+$/.test(doc.ref.path) ||
      !doc.updateTime || typeof doc.data !== 'function') {
    throw new Error('[E05] documento de histórico inválido');
  }
  return { path: doc.ref.path, updateTime: stable(doc.updateTime), data: stable(doc.data()) };
}

function makePlan(docs) {
  if (!Array.isArray(docs)) throw new Error('[E05] consulta de histórico incompleta');
  const all = docs.map(entry).sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(all.map(item => item.path)).size !== all.length) throw new Error('[E05] histórico duplicado');
  const targets = all.filter(item => item.data.matchType === 'tournament');
  for (const item of all) {
    if (item.data.matchType !== 'tournament' && item.data.tournamentId) {
      throw new Error('[E05] tipo de histórico ambíguo');
    }
  }
  if (targets.some(item => typeof item.data.tournamentId !== 'string' ||
      !item.data.tournamentId || typeof item.data.matchId !== 'string' ||
      !item.data.matchId)) throw new Error('[E05] histórico de torneio sem vínculo');
  if (targets.length > MAX_DELETES) throw new Error('[E05] lote excede o teto de exclusões');
  const serialized = JSON.stringify(targets);
  if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('[E05] lote excede o teto de bytes');
  return { digest: digest(serialized), count: targets.length,
    untouched: all.length - targets.length, targets: targets.map(item => item.path),
    bytes: Buffer.byteLength(serialized) };
}

async function applyPlan(db, plan, coverage) {
  if (!db || !plan || !Array.isArray(plan.targets) || plan.count !== plan.targets.length ||
      plan.count > MAX_DELETES || !coverage || !Array.isArray(coverage.physical) ||
      !Array.isArray(coverage.orphanRoots)) throw new Error('[E05] plano inválido');
  await db.runTransaction(async tx => {
    const snap = await tx.get(db.collectionGroup('matchHistory'));
    const fresh = makePlan(snap.docs);
    if (fresh.digest !== plan.digest || fresh.count !== plan.count ||
        fresh.targets.some((path, index) => path !== plan.targets[index])) {
      throw new Error('[E05] CAS: histórico mudou após a prévia');
    }
    const refs = coverage.physical.map(item => db.doc(item.path))
      .concat(coverage.orphanRoots.map(id => db.collection('tournaments').doc(id)));
    const proofs = refs.length ? await tx.getAll(...refs) : [];
    coverage.physical.forEach((item, index) => {
      const doc = proofs[index];
      if (!doc.exists || JSON.stringify(stable(doc.updateTime)) !== JSON.stringify(item.updateTime) ||
          !doc.data() || !doc.data().jogo) throw new Error('[E05] CAS: jogo físico mudou');
    });
    coverage.orphanRoots.forEach((_, index) => {
      if (proofs[coverage.physical.length + index].exists) {
        throw new Error('[E05] CAS: torneio de teste reapareceu');
      }
    });
    for (const path of plan.targets) tx.delete(db.doc(path));
  });
}

module.exports = { MAX_DELETES, MAX_BYTES, entry, makePlan, applyPlan };
