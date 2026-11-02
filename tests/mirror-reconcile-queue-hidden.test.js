'use strict';
const assert = require('node:assert/strict');
const queue = require('../functions/mirror-reconcile-queue-core');
const { MirrorProjectionLimit } = require('../functions/mirror-transaction-core');

function harness(hidden, pending) {
  const state = { hidden, pending: { ...pending }, limits: [], writes: [] };
  const rootRef = { id: 'fixture', kind: 'root', collection(name) {
    return {
      name,
      doc(id) { return { kind: 'doc', name, id, async get() { return snapshot(state.pending); } }; },
      orderBy() { return { name, startAfter() { return this; },
        limit(n) { return { kind: 'query', name, maxDocs: n }; } }; },
    };
  } };
  const pendingRef = rootRef.collection('mirrorReconcilePending').doc('root');
  const snapshot = (data) => ({ exists: data != null, data: () => data,
    updateTime: { seconds: 1, nanoseconds: 0 } });
  const db = { runTransaction: async (fn) => {
    const changes = [];
    const tx = {
      async get(ref) {
        if (ref === rootRef) return snapshot({ organizerOnly: state.hidden });
        if (ref.kind === 'query') {
          state.limits.push(ref.maxDocs);
          if (ref.maxDocs > 12) throw new MirrorProjectionLimit('documents');
          return { docs: [] };
        }
        if (ref.name === 'mirrorReconcilePending') return snapshot(state.pending);
        if (ref.name === 'resultVisibilityFence') return snapshot(null);
        throw new Error('unexpected read');
      },
      set(ref, data) { changes.push(() => { state.pending = data; state.writes.push('set:' + ref.name); }); },
      update(ref, patch) { changes.push(() => { Object.assign(state.pending, patch);
        state.writes.push('update:' + ref.name); }); },
    };
    const result = await fn(tx);
    changes.forEach(change => change());
    return result;
  } };
  return { db, rootRef, pendingRef, state };
}

(async () => {
  const blocked = { type: 'root', phase: 'verify-results', phaseCursor: 'result-17',
    generation: 4, status: 'blocked', permanent: true, rootUpdateTime: '1:0',
    lastErrorCode: 'documents', updatedAtMs: 900, pageLimit: 50 };
  const hidden = harness(true, blocked);
  assert.equal((await queue.enqueueRoot(hidden.db, hidden.rootRef, { code: 'ABORTED' }, 1000)).action,
    'blocked', 'evento comum não reabre bloqueio');
  assert.equal(hidden.state.pending.generation, 4);
  assert.equal((await queue.enqueueRoot(hidden.db, hidden.rootRef, { code: 'ABORTED' }, 1001,
    { supersedeVisibleBlock: true })).action, 'queued');
  assert.equal(hidden.state.pending.generation, 5);
  assert.equal(hidden.state.pending.phase, 'hidden-results');
  assert.equal(hidden.state.pending.phaseCursor, null);
  assert.equal(hidden.state.pending.previousBlock.phase, 'verify-results');
  assert.equal(hidden.state.pending.permanent, false);
  assert.equal((await queue.recoverPending(hidden.db, hidden.rootRef, hidden.pendingRef, 1002)).action,
    'completed');
  assert.deepEqual(hidden.state.limits, [50, 25, 12], 'limite de documentos reduz a página');
  assert.equal(hidden.state.pending.status, 'completed');
  assert.equal(hidden.state.writes.some(write => write.includes('results')), false,
    'recuperação oculta não publica playerUids');

  const visible = harness(false, blocked);
  assert.equal((await queue.enqueueRoot(visible.db, visible.rootRef, { code: 'ABORTED' }, 1000,
    { supersedeVisibleBlock: true })).action, 'blocked', 'raiz visível não supera bloqueio');
  const alreadyHidden = harness(true, { ...blocked, phase: 'hidden-results' });
  assert.equal((await queue.enqueueRoot(alreadyHidden.db, alreadyHidden.rootRef,
    { code: 'ABORTED' }, 1000, { supersedeVisibleBlock: true })).action, 'blocked',
  'bloqueio já oculto exige retomada administrativa');

  const resumed = harness(true, blocked);
  assert.equal((await queue.resumeBlocked(resumed.db, resumed.rootRef, resumed.pendingRef, 4, 1000)).action,
    'resumed');
  assert.equal(resumed.state.pending.pageLimit, 25,
    'retomada de limite de documentos reduz a página também');

  const irreducible = harness(true, { ...blocked, phase: 'hidden-results', status: 'queued',
    permanent: false, pageLimit: 1, leaseOwner: null, leaseUntilMs: 0 });
  irreducible.state.limits.length = 0;
  // Um erro persistente mesmo com página mínima não confirma qualquer limpeza.
  const originalRun = irreducible.db.runTransaction;
  irreducible.db.runTransaction = async (fn, opts) => originalRun(async (tx) => fn({
    ...tx, get: async (ref) => {
      if (ref.kind === 'query') throw new MirrorProjectionLimit('documents');
      return tx.get(ref);
    },
  }), opts);
  assert.deepEqual(await queue.recoverPending(irreducible.db, irreducible.rootRef,
    irreducible.pendingRef, 1000), { action: 'permanent', code: 'documents' });
  assert.equal(irreducible.state.pending.status, 'blocked');
  assert.equal(irreducible.state.writes.some(write => write.includes('results')), false);
  console.log('✓ E19 fila: bloqueio visível superado ao ocultar; redução por documentos e falha fechada');
})().catch(error => { console.error(error); process.exitCode = 1; });
