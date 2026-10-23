'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const auto = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');
const basic = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const metadata = { ok: true, region: 'us-east1', revision: 'test-revision', sourceDigest: 'test-digest' };
function section(source, begin, end) {
  const a = source.indexOf(begin), b = source.indexOf(end, a + begin.length);
  assert(a >= 0 && b > a, `seção ausente: ${begin}`);
  return source.slice(a, b);
}
function probeReply(context) {
  vm.runInNewContext(`const _operationProbeReply = ${auto.match(/const _operationProbeReply = \(\) => \(\{[\s\S]*?\}\);/)[0].split('= ')[1]}`, context);
}
function store() {
  const calls = [];
  const snap = { exists: true, data: () => ({ creatorUid: 'owner', memberUids: ['owner'], matches: [{ id: 'game' }] }) };
  const ref = { get: async () => snap, collection: () => ({ doc: () => ({}) }) };
  const tx = {
    get: async () => snap,
    set: () => calls.push('set'), update: () => calls.push('update'),
    delete: () => calls.push('delete'), create: () => calls.push('create')
  };
  const db = {
    collection: () => ({ doc: () => ref }),
    batch: () => { calls.push('batch'); throw Error('sonda tentou batch'); },
    runTransaction: async (fn, options) => { calls.push('transaction'); assert.equal(options.readOnly, true); return fn(tx); }
  };
  return { calls, db, snap };
}
function baseContext(db) {
  const context = { exports: {}, onCall: (...args) => args.at(-1), HttpsError, db,
    process: { env: { SP_OPERATION_REGION: 'us-east1', K_REVISION: 'test-revision', SP_SOURCE_DIGEST: 'test-digest' } },
    String, Array, Date, console };
  probeReply(context);
  return context;
}
async function check(name, source, begin, end, options) {
  const state = store();
  const context = Object.assign(baseContext(state.db), options.context || {});
  vm.runInNewContext(section(source, begin, end), context);
  const handler = context.exports[name];
  assert.equal(typeof handler, 'function', name);
  const data = { ...options.data, probe: true };
  await assert.rejects(handler({ data }), e => e.code === 'unauthenticated', `${name}: sem login`);
  assert.deepEqual(state.calls, [], `${name}: sem login não acessa banco`);
  const result = await handler({ auth: { uid: 'owner' }, data });
  assert.deepEqual(JSON.parse(JSON.stringify(result)), metadata, `${name}: metadados apenas`);
  // A sonda mede saúde da região. Não concede papel no torneio: a autorização
  // é verificada pela operação real, depois de escolhido o servidor.
  const outsider = await handler({ auth: { uid: 'outsider' }, data });
  assert.deepEqual(JSON.parse(JSON.stringify(outsider)), metadata, `${name}: saúde independe de papel`);
  assert(!state.calls.some(x => x !== 'transaction'), `${name}: sonda escreveu: ${state.calls}`);
}
(async () => {
  await check('setTournamentPresenceWithWOSubstitution', auto,
    'exports.setTournamentPresenceWithWOSubstitution = onCall',
    '// ─── Escolha explícita de substituto', {
      data: { tournamentId: 'tour_test', targetUid: 'person', action: 'present' },
      context: { setPresenceWithWOSubstitutionFn: () => {}, drawWindow: {},
        _isTournamentAdmin: () => true, _drawFail: (code, msg) => new HttpsError(code, msg) }
    });
  await check('applyMatchResult', auto,
    'exports.applyMatchResult = onCall',
    '/* ── A FILA DO PLACAR', {
      data: { tournamentId: 'tour_test', matchId: 'game', payload: { s1: 1 } },
      context: { applyResultFn: () => {}, drawWindow: {},
        _isTournamentParticipant: () => true, _isTournamentAdmin: () => true,
        _isConfirmedTournamentReferee: () => false,
        _drawFail: (code, msg) => new HttpsError(code, msg) }
    });
  await check('assignMatchCourt', auto,
    'exports.assignMatchCourt = onCall',
    '// ─── Atribuições da análise', {
      data: { tournamentId: 'tour_test', matchId: 'game', court: 'Quadra 4' },
      context: { drawWindow: { _findMatch: () => ({ id: 'game' }) },
        ScoreplaceRefereeRoster: { sanitizeAll: () => [] },
        _isTournamentAdmin: () => true,
        _drawFail: (code, msg) => new HttpsError(code, msg) }
    });
  const state = store();
  const context = baseContext(state.db);
  context.admin = { firestore: () => state.db };
  context._partesPerm = { idDeDocumentoValido: () => true };
  context.APP_ORIGINS = [];
  context._sandboxAutorizado = async () => {};
  context._isTournamentOrgCaller = () => true;
  vm.runInNewContext(section(basic, 'exports.setTournamentPresence = onCall',
    '/* ═══════════════════════════════════════════════════════════════════════════════'), context);
  const handler = context.exports.setTournamentPresence;
  const data = { tournamentId: 'tour_test', targetKey: 'person', action: 'present', probe: true };
  await assert.rejects(handler({ data }), e => e.code === 'unauthenticated');
  assert.deepEqual(state.calls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(await handler({ auth: { uid: 'owner' }, data }))), metadata);
  assert.deepEqual(state.calls, [], 'presença simples não abre lote nem transação');
  console.log('✓ sondas autenticadas e sem escrita para presença, W.O., placar e quadra');
})().catch(e => { console.error(e); process.exitCode = 1; });
