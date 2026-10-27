'use strict';
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const client = fs.readFileSync('js/views/tournaments-draw-prep.js', 'utf8');
const start = server.indexOf('exports.setTournamentEnrollmentStatus = onCall(');
const end = server.indexOf('\nexports.runEnrollmentSlotsDraw = onCall(', start);
assert(start >= 0 && end > start);
const handler = server.slice(start, end);
assert(/sandbox\s*:\s*String\(tId\)\.startsWith\('sb_'\)/.test(client), 'cliente identifica a cópia');

const docs = new Map([
  ['sandboxes/sb_event', { id:'sb_event', status:'open', isSandbox:true, sandboxOwnerUid:'owner', notificationsMuted:true }],
  ['tournaments/event', { id:'event', status:'open' }]
]);
const writes = [];
const reads = [];
const context = {
  exports:{},
  onCall: fn => fn,
  HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
  db: {
    collection(name) { return { doc(id) { return { path:name + '/' + id }; } }; },
    runTransaction(fn) { return fn({ get:async ref => ({ exists:docs.has(ref.path), data:() => docs.get(ref.path) }) }); }
  },
  _assertSandboxDrawOwner:async (tx, snap, uid) => {
    assert(snap.exists && snap.data().isSandbox && snap.data().sandboxOwnerUid === uid);
  },
  _leTorneio:async (tx, ref) => { reads.push(ref.path); return docs.get(ref.path) || null; },
  _isTournamentAdmin:(t, uid) => uid === 'owner',
  _drawFail:(code, message) => Object.assign(new Error(message), { code }),
  _hasTournamentDraw:() => false,
  _antesDoMotor:t => ({...t}),
  _promoteWaitlistsWhenOpeningEnrollment:() => 0,
  _enqueueEnrollmentNotice:() => {},
  _gravaTorneio:(tx, ref, t) => { writes.push(ref.path); docs.set(ref.path, {...t}); return { clean:t }; },
  drawWindow:null
};
vm.createContext(context);
vm.runInContext(handler, context);
const call = context.exports.setTournamentEnrollmentStatus;

(async () => {
  const sb = await call({ auth:{uid:'owner'}, data:{tournamentId:'sb_event', sandbox:true, action:'close'} });
  assert.strictEqual(sb.changed, true);
  assert.strictEqual(docs.get('sandboxes/sb_event').status, 'closed');
  assert.strictEqual(docs.get('tournaments/event').status, 'open');
  assert.deepStrictEqual(writes, ['sandboxes/sb_event']);
  await assert.rejects(call({ auth:{uid:'owner'}, data:{tournamentId:'sb_event', action:'close'} }), /Torneio não encontrado/);
  assert.deepStrictEqual(reads, ['sandboxes/sb_event'], 'payload sem sandbox não lê produção');
  const prod = await call({ auth:{uid:'owner'}, data:{tournamentId:'event', sandbox:false, action:'close'} });
  assert.strictEqual(prod.changed, true);
  assert.deepStrictEqual(writes, ['sandboxes/sb_event', 'tournaments/event']);
  const resetStart = server.indexOf('exports.resetTournamentToEnrollment = onCall(');
  const resetEnd = server.indexOf('\nexports.generateExtraTournamentRound = onCall(', resetStart);
  const reset = server.slice(resetStart, resetEnd);
  assert(reset.includes("t.status = isSandboxRestore ? 'closed' : 'open';"), 'reset só mantém a cópia fechada; produção preserva o comportamento anterior');
  console.log('Roteamento das inscrições: sandbox isolado, produção isolada, reset fechado.');
})().catch(error => { console.error(error); process.exitCode = 1; });
