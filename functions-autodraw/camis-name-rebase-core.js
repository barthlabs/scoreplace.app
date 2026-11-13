'use strict';

const rehearsal = require('./tournament-rehearsal');
const ID = 'tour_1793804848447_94bfe2282535789667cb35f1080024ee';
const OWNER = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';

function prepare(tournament, baseline, summary, newName) {
  const t = tournament || {}, b = baseline || {};
  const name = typeof newName === 'string' ? newName.trim() : '';
  if (t.id !== ID || t.creatorUid !== OWNER || t.isPublic !== false ||
      t.organizerOnly !== true || t.isSandbox === true ||
      t.rehearsal?.state !== 'active' || t.rehearsal?.mode !== 'postDraw' ||
      b.state !== 'active' || b.mode !== 'postDraw' || b.epoch !== t.rehearsal.epoch ||
      b.hash !== t.rehearsal.hash || !Array.isArray(b.tree) || !b.root || !b.summary ||
      !summary || b.root.name !== t.name || b.summary.name !== summary.name ||
      rehearsal.fingerprint({ root:b.root, tree:b.tree, summary:b.summary }) !== b.hash ||
      name.length < 2 || name.length > 120 || /[<>\x00-\x1f]/.test(name)) {
    throw Error('Fotografia CAMIS divergente; nome não alterado.');
  }
  const root = { ...b.root, name };
  const nextSummary = { ...b.summary, name };
  const hash = rehearsal.fingerprint({ root, tree:b.tree, summary:nextSummary });
  if (rehearsal.projectedSize({ root, tree:b.tree, summary:nextSummary }) > 900 * 1024)
    throw Error('Fotografia CAMIS próxima do limite do Firestore.');
  return { root, summary:nextSummary, hash };
}

module.exports = { ID, prepare };
