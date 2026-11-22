'use strict';

const { randomUUID } = require('crypto');
const { fingerprint, projectedSize } = require('./tournament-rehearsal');

const MAX_SAFE_BYTES = 800 * 1024;
const MAX_TREE_DOCUMENTS = 5000;
const BATCH_SIZE = 400;

function marker(tournament) {
  return tournament && tournament.drawCheckpoint && tournament.drawCheckpoint.state;
}

function locked(tournament) {
  return marker(tournament) === 'capturing' || marker(tournament) === 'resetting';
}

function prepareDraw(tournament) {
  if (!tournament || tournament.testModeEnabled !== true || tournament.preserveDrawOnTestReset !== true ||
      tournament.isSandbox === true) return null;
  const epoch = randomUUID();
  tournament.drawCheckpoint = { state: 'capturing', epoch, hash: '' };
  return epoch;
}

function makeService({ db, HttpsError, loadTournament }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const rootRef = id => db.collection('tournaments').doc(id);
  const checkpointRef = id => db.collection('tournamentDrawCheckpoints').doc(id);
  const snapshotRef = (id, epoch) => checkpointRef(id).collection('snapshots').doc(epoch);

  async function readTree(ref) {
    const tree = [];
    async function visit(parent) {
      const collections = (await parent.listCollections()).sort((a, b) => a.id.localeCompare(b.id));
      for (const collection of collections) {
        // Payment tokens are intentionally outside a test reset photograph.
        if (collection.id === 'paymentSecrets') continue;
        const docs = (await collection.get()).docs.sort((a, b) => a.id.localeCompare(b.id));
        for (const doc of docs) {
          const path = doc.ref.path.slice(ref.path.length + 1);
          const data = doc.data();
          if (projectedSize({ path, data }) > MAX_SAFE_BYTES) {
            fail('resource-exhausted', `O documento ${path} excede o limite seguro para preservar o sorteio.`);
          }
          tree.push({ path, data });
          if (tree.length > MAX_TREE_DOCUMENTS) fail('resource-exhausted', 'Este torneio excede o limite seguro da fotografia do sorteio.');
          await visit(doc.ref);
        }
      }
    }
    await visit(ref);
    return tree.sort((a, b) => a.path.localeCompare(b.path));
  }

  function rootForSnapshot(data) {
    const root = { ...data };
    delete root.drawCheckpoint;
    return root;
  }

  async function writeEntries(snapshot, tree) {
    const collection = snapshot.collection('entries');
    const old = await collection.get();
    for (let i = 0; i < old.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      old.docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    for (let i = 0; i < tree.length; i += BATCH_SIZE) {
      const batch = db.batch();
      tree.slice(i, i + BATCH_SIZE).forEach((entry, index) => {
        const key = Buffer.from(entry.path).toString('base64url');
        batch.set(collection.doc(key), { path: entry.path, data: entry.data });
      });
      await batch.commit();
    }
  }

  async function readEntries(snapshot) {
    const docs = (await snapshot.collection('entries').get()).docs;
    if (docs.length > MAX_TREE_DOCUMENTS) fail('data-loss', 'A fotografia excedeu o limite de documentos.');
    return docs.map(doc => doc.data()).sort((a, b) => String(a.path).localeCompare(String(b.path)));
  }

  async function deleteExtraTree(ref, keep) {
    const live = await readTree(ref);
    const paths = live.map(item => item.path).filter(path => !keep.has(path))
      .sort((a, b) => b.split('/').length - a.split('/').length);
    for (let i = 0; i < paths.length; i += BATCH_SIZE) {
      const batch = db.batch();
      paths.slice(i, i + BATCH_SIZE).forEach(path => batch.delete(db.doc(`${ref.path}/${path}`)));
      await batch.commit();
    }
  }

  async function writeTree(ref, tree) {
    const ordered = [...tree].sort((a, b) =>
      a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
    for (let i = 0; i < ordered.length; i += BATCH_SIZE) {
      const batch = db.batch();
      ordered.slice(i, i + BATCH_SIZE).forEach(item => batch.set(db.doc(`${ref.path}/${item.path}`), item.data));
      await batch.commit();
    }
  }

  async function capture(id, epoch, options) {
    const keepLocked = !!(options && options.keepLocked);
    const ref = rootRef(id), cpRef = checkpointRef(id), snapRef = snapshotRef(id, epoch);
    const live = await ref.get();
    const allowedStates = keepLocked ? ['capturing', 'resetting'] : ['capturing'];
    if (!live.exists || !allowedStates.includes(marker(live.data())) || live.data().drawCheckpoint.epoch !== epoch) {
      fail('aborted', 'A captura do sorteio perdeu sua trava; tente novamente.');
    }
    const root = rootForSnapshot(live.data());
    const tree = await readTree(ref);
    const hash = fingerprint({ root, tree });
    if (projectedSize(root) > MAX_SAFE_BYTES) {
      fail('resource-exhausted', 'A ficha do torneio excede o limite seguro para preservar o sorteio.');
    }
    await snapRef.set({ state: 'capturing', epoch, root, hash, count: tree.length, createdAt: new Date().toISOString() });
    await writeEntries(snapRef, tree);
    const [againRoot, againTree, entries] = await Promise.all([ref.get(), readTree(ref), readEntries(snapRef)]);
    const after = againRoot.exists ? againRoot.data() : null;
    if (!after || !allowedStates.includes(marker(after)) || after.drawCheckpoint.epoch !== epoch ||
        fingerprint({ root: rootForSnapshot(after), tree: againTree }) !== hash ||
        fingerprint(entries) !== fingerprint(tree)) {
      fail('aborted', 'Os dados mudaram durante a fotografia; o torneio permanece bloqueado para retomada.');
    }
    await db.runTransaction(async tx => {
      const [rootSnap, manifest] = await Promise.all([tx.get(ref), tx.get(cpRef)]);
      const current = rootSnap.exists ? rootSnap.data() : null;
      if (!current || !allowedStates.includes(marker(current)) || current.drawCheckpoint.epoch !== epoch) {
        fail('aborted', 'A trava da fotografia mudou.');
      }
      const previous = manifest.exists ? manifest.data() : {};
      tx.set(cpRef, { ...previous, activeEpoch: epoch, state: keepLocked ? 'resetting' : 'active', hash, updatedAt: new Date().toISOString() });
      tx.update(ref, { drawCheckpoint: { state: keepLocked ? 'resetting' : 'active', epoch, hash } });
      tx.update(snapRef, { state: 'active' });
    });
    return { ok: true, epoch, hash, count: tree.length };
  }

  async function restore(request) {
    const uid = request.auth && request.auth.uid;
    const id = String(request.data && request.data.tournamentId || '').trim();
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    if (!/^tour_[A-Za-z0-9_-]+$/.test(id)) fail('invalid-argument', 'Torneio inválido.');
    if (uid !== 'B17n7JCXYOfqahlcLZ0fKxGGyUu1') fail('permission-denied', 'Reset de torneio em teste reservado ao desenvolvedor.');
    const ref = rootRef(id), cpRef = checkpointRef(id);
    let epoch = '';
    await db.runTransaction(async tx => {
      const [rootSnap, manifestSnap] = await Promise.all([tx.get(ref), tx.get(cpRef)]);
      if (!rootSnap.exists) fail('not-found', 'Torneio não encontrado.');
      const t = rootSnap.data(), cp = manifestSnap.exists ? manifestSnap.data() : {};
      if (t.testModeEnabled !== true || t.preserveDrawOnTestReset !== true || t.creatorUid !== uid || t.isSandbox === true) {
        fail('permission-denied', 'O torneio não está habilitado para preservar o sorteio em teste.');
      }
      const state = marker(t);
      const rootEpoch = t.drawCheckpoint && t.drawCheckpoint.epoch;
      // During capture/recovery the root marker belongs to the newest draw. The
      // manifest may still point at an older, valid checkpoint until this one
      // finishes, so never let that older epoch win over a locked root marker.
      epoch = rootEpoch || cp.activeEpoch || '';
      if (!epoch) fail('failed-precondition', 'Não há fotografia pós-sorteio. Faça um novo sorteio com “Preservar sorteio” ativado.');
      if (state === 'resetting' && t.drawCheckpoint.epoch !== epoch) fail('aborted', 'A operação de reset mudou.');
      if (state === 'active' && (cp.activeEpoch !== rootEpoch || cp.hash !== (t.drawCheckpoint && t.drawCheckpoint.hash))) {
        fail('data-loss', 'A fotografia ativa não corresponde ao sorteio atual; o torneio continua intacto.');
      }
      if (!['active', 'capturing', 'resetting'].includes(state)) fail('failed-precondition', 'Não há fotografia pós-sorteio íntegra.');
      if (state === 'capturing') {
        // A queda ocorreu depois de materializar a chave. Finaliza a fotografia
        // dentro do lock antes de tentar restaurá-la.
        tx.update(ref, { drawCheckpoint: { state: 'resetting', epoch, hash: '' } });
      } else {
        tx.update(ref, { drawCheckpoint: { state: 'resetting', epoch, hash: cp.hash || t.drawCheckpoint.hash || '' } });
      }
      tx.set(cpRef, { ...cp, state: state === 'capturing' ? 'capturing' : 'resetting', activeEpoch: epoch,
        updatedAt: new Date().toISOString() });
    });
    const rootSnap = await ref.get();
    const pendingSnapshot = await snapshotRef(id, epoch).get();
    if (marker(rootSnap.data()) === 'resetting' && (!pendingSnapshot.exists || pendingSnapshot.data().state !== 'active')) {
      await capture(id, epoch, { keepLocked: true });
    }
    const cp = (await cpRef.get()).data() || {};
    epoch = cp.activeEpoch || epoch;
    const snapRef = snapshotRef(id, epoch);
    const snap = await snapRef.get();
    if (!snap.exists || snap.data().state !== 'active') fail('data-loss', 'A fotografia pós-sorteio não está completa; o torneio continua bloqueado.');
    const saved = snap.data(), tree = await readEntries(snapRef);
    if (tree.length !== saved.count || fingerprint({ root: saved.root, tree }) !== saved.hash) {
      fail('data-loss', 'A fotografia pós-sorteio não confere; o torneio continua bloqueado.');
    }
    await writeTree(ref, tree);
    await deleteExtraTree(ref, new Set(tree.map(item => item.path)));
    const restored = { ...saved.root, drawCheckpoint: { state: 'resetting', epoch, hash: saved.hash } };
    await ref.set(restored);
    const [finalRoot, finalTree] = await Promise.all([ref.get(), readTree(ref)]);
    if (!finalRoot.exists || fingerprint({ root: rootForSnapshot(finalRoot.data()), tree: finalTree }) !== saved.hash) {
      fail('data-loss', 'A verificação do reset falhou; o torneio continua bloqueado para retomada.');
    }
    restored.drawCheckpoint = { state: 'active', epoch, hash: saved.hash };
    await ref.update({ drawCheckpoint: restored.drawCheckpoint });
    await cpRef.update({ state: 'active', updatedAt: new Date().toISOString() });
    const tournament = typeof loadTournament === 'function' ? await loadTournament(id) : restored;
    return { ok: true, mode: 'testModePostDraw', tournament, hash: saved.hash };
  }

  return { capture, restore };
}

module.exports = { makeService, marker, locked, prepareDraw, MAX_SAFE_BYTES, MAX_TREE_DOCUMENTS };
