'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const core = require('../functions/historical-athlete-claim-core');

const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const start = source.indexOf('exports.listMyHistoricalAthleteClaims = onCall(');
const end = source.indexOf('// Lê sempre a fotografia atual', start);
assert(start >= 0 && end > start);

function fixture(options = {}) {
  const writes = [];
  const root = { status: options.reopened ? 'ongoing' : 'finished', startDate: '2026-11-13T08:00:00Z',
    participants: options.inlineParticipants ? [{ displayName:'Outra Pessoa' }] : [] };
  const profile = { displayName: 'Maria Souza', createdAt: '1900-01-01T00:00:00Z' };
  const reg = { registrationId: 'manual-m1', manualParticipantId: 'm1',
    manualDisplayName: 'Maria Souza', manualNameKey: options.noIndex ? undefined : 'maria souza',
    participantKind: 'manual', status: 'confirmed' };
  const accountReg = { registrationId: 'account-other', participantKind: 'account',
    participantUid: 'other-uid', status: 'confirmed' };
  const game = { id: 'j1', team1: ['Maria Souza'], team2: ['Ana Paula'], score1: 6, score2: 4,
    ...(options.structured ? { team1Obj:{ p1Name:options.structuredConflict ? 'Outra Pessoa' : 'Maria Souza',
      p1ManualId:'m1' } } : {}) };
  const match = { id: 'j1', data: () => ({ _chave: 'j1', jogo: game, playerUids: [] }) };
  const second = { id: 'j2', data: () => ({ _chave: 'j2', jogo: { id: 'j2',
    team1: ['Maria Souza'], team2: ['Carla Dias'], score1: 5, score2: 7,
    team1Uids: options.secondConflict ? ['outro-uid'] : [null] } }) };
  const participant = { id:'old-mirror', data:() => ({ _k:'old-mirror', _idx:0,
    item:{ manualParticipantId:'m1', displayName:'Maria Souza' } }) };
  const ref = { path: 'tournaments/t1', async get() { return { exists:true, data:() => root }; }, collection(name) {
    return { path: name, doc(id) { return { path: `${name}/${id}` }; } };
  } };
  const db = { collection(name) {
    if (name === 'tournaments') return { doc() { return ref; } };
    return { doc(id) { return { path: `${name}/${id}`, async get() { return { exists:true, data:() => profile }; } }; } };
  }, collectionGroup() { return { where() { return this; }, limit() { return this; },
    async get() { return { size:options.withdrawnHomonym ? 2 : 1, docs:[
      { ref:{ path:'tournaments/t1/registrations/manual-m1' }, data:() => reg },
      ...(options.withdrawnHomonym ? [{ ref:{ path:'tournaments/t1/registrations/manual-m2' },
        data:() => ({ ...reg, registrationId:'manual-m2', manualParticipantId:'m2', status:'withdrawn' }) }] : []),
    ] }; } }; }, async runTransaction(fn) {
    return fn({ async get(target) {
      if (target === ref) return { exists: true, data: () => root };
      if (target.path === 'users/maria' || target.path === 'users/outra') {
        return { exists: true, data: () => profile };
      }
      if (target.path === 'users/other-uid') {
        return { exists: true, data: () => ({ displayName: options.accountHomonym ? 'Maria Souza' : 'Outra Pessoa' }) };
      }
      if (target.path === 'historicalAthleteClaims/m1') {
        return options.audit ? { exists: true, data: () => options.audit } : { exists: false };
      }
      if (target.path === 'name-claim') return { exists: false };
      if (target.path === 'matches') return { docs: options.secondMatch || options.secondConflict ? [match, second] : [match] };
      if (target.path === 'participants') {
        const docs = options.missingMirror ? [] : options.partialMirror ? [{
          id:'other-mirror', data:() => ({ _k:'other-mirror', _idx:0,
            item:{ manualParticipantId:'other', displayName:'Outra Pessoa' } }),
        }] : [participant];
        return { docs, empty: docs.length === 0 };
      }
      throw new Error('Leitura inesperada: ' + target.path);
    }, update(target, patch) { writes.push({ kind: 'update', path: target.path, patch }); },
    create(target, data) { writes.push({ kind: 'create', path: target.path, data }); },
    delete(target) { writes.push({ kind:'delete', path:target.path }); },
    set(target, data) { writes.push({ kind:'set', path:target.path, data }); } });
  } };
  const context = { exports: {}, APP_ORIGINS: [],
    onCall(_config, handler) { return handler; },
    HttpsError: class HttpsError extends Error {
      constructor(code, message) { super(message); this.code = code; }
    }, admin: { firestore: () => db, auth: () => ({ getUser: async () => ({
      metadata: { creationTime: options.creationTime === undefined ? '2026-01-01T00:00:00Z' : options.creationTime },
    }) }) }, _CANONICAL_REGISTRATION_MUTATIONS_READY: options.canonicalReady !== false,
    _historicalAthleteClaim: core,
    _registrationCore: { legacySlots: () => [] },
    _nameUnique: { displayNameClaimRef() { return { path: 'name-claim' }; } },
    _loadCanonicalRosterForMutation: async () => ({ registrations: options.accountHomonym || options.accountDistinct ? [reg, accountReg] : [reg] }),
    _registrationClaim: { claimManualParticipant() { return { creates: [], updates: [] }; } },
    _tSplitFn: { colecaoDaParte: (name) => name },
    _writeCanonicalRosterChanges() { writes.push({ kind: 'roster' }); },
    _FV: { delete() { return 'delete-marker'; }, serverTimestamp() { return 'server-time'; } },
    Promise, Map, Set, Object, String, Array, Date, console };
  vm.runInNewContext(source.slice(start, end), context, { filename: 'historical-claim-handler' });
  return { handler: context.exports.acceptHistoricalAthleteClaim,
    list:context.exports.listMyHistoricalAthleteClaims, writes };
}

(async () => {
  const first = fixture();
  const result = await first.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } });
  assert.equal(result.ok, true);
  assert.equal(result.linkedMatches, 1);
  const matchWrite = first.writes.find((entry) => entry.path === 'matches/j1');
  assert(matchWrite);
  assert.equal(matchWrite.patch['jogo.team1Uids'][0], 'maria');
  assert.deepEqual(Object.keys(matchWrite.patch).sort(),
    ['jogo.historicalClaimUids', 'jogo.team1Uids', 'jogo.p1Uid', 'playerUids'].sort());
  assert.equal(matchWrite.patch['jogo.p1Uid'], 'maria');
  assert(first.writes.some((entry) => entry.kind === 'create' && entry.path === 'participants/umaria'));
  assert(first.writes.some((entry) => entry.kind === 'delete' && entry.path === 'participants/old-mirror'));
  const physical = first.writes.find((entry) => entry.path === 'participants/umaria' && entry.kind === 'create');
  const hydrated = await require('../functions/split-parts').hidratar(
    { get: async () => ({ docs:[{ data:() => physical.data }] }) },
    { collection:() => ({}) },
    { _semPesados:['participants'], _nPartes:{ participants:1 }, participants:[] },
    ['participants']);
  assert.equal(hydrated.participants[0].uid, 'maria', 'hidratação lê o UID pela nova chave física');
  assert.equal(hydrated.participants[0].displayName, 'Maria Souza');
  assert(first.writes.some((entry) => entry.kind === 'roster'));
  const audit = first.writes.find((entry) => entry.path === 'historicalAthleteClaims/m1');
  assert.equal(audit.kind, 'create');
  assert.equal(audit.data.claimedByUid, 'maria');
  assert.equal(audit.data.beforeUidSlots.j1.team1Uids, null);
  assert.equal(audit.data.participantMirrorBeforeId, 'old-mirror');
  assert.equal(audit.data.participantMirrorAfterId, 'umaria');
  assert.equal(audit.data.mirrorAbsent, false);
  assert.equal(matchWrite.patch.playerUids[0], 'maria', 'jogo sem playerUids anterior recebe índice');
  const structured = fixture({ structured:true });
  await structured.handler({ auth:{ uid:'maria' }, data:{ tournamentId:'t1', manualParticipantId:'m1' } });
  assert.equal(structured.writes.find((entry) => entry.path === 'matches/j1').patch['jogo.team1Obj.p1Uid'], 'maria');
  assert.equal(structured.writes.find((entry) => entry.path === 'matches/j1').patch['jogo.score1'], undefined,
    'placar permanece fora do patch da transação');
  const structuredConflict = fixture({ structured:true, structuredConflict:true });
  await assert.rejects(structuredConflict.handler({ auth:{ uid:'maria' },
    data:{ tournamentId:'t1', manualParticipantId:'m1' } }), /diverge/);
  assert.equal(structuredConflict.writes.length, 0, 'identidades discordantes abortam toda a transação');

  const repeat = fixture({ audit: { claimedByUid: 'maria' } });
  const repeated = await repeat.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } });
  assert.equal(repeated.alreadyClaimed, true);
  assert.equal(repeat.writes.length, 0);
  const other = fixture({ audit: { claimedByUid: 'maria' } });
  await assert.rejects(other.handler({ auth: { uid: 'outra' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }),
  (error) => error.code === 'already-exists');
  assert.equal(other.writes.length, 0);
  const twoGames = fixture({ secondMatch: true });
  const twoResult = await twoGames.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } });
  assert.equal(twoResult.linkedMatches, 2, 'grupo e eliminatória física recebem o mesmo UID');
  assert.equal(twoGames.writes.filter((entry) => String(entry.path || '').startsWith('matches/')).length, 2);
  const homonym = fixture({ accountHomonym: true, secondMatch: true });
  await assert.rejects(homonym.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /outra conta/);
  assert.equal(homonym.writes.length, 0, 'homônimo de conta aborta todos os jogos');
  const withdrawnHomonym = fixture({ withdrawnHomonym:true });
  assert.equal((await withdrawnHomonym.list({ auth:{ uid:'maria' } })).candidates.length, 0,
    'vaga retirada homônima não pode ser sugerida');
  const distinct = fixture({ accountDistinct: true });
  assert.equal((await distinct.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } })).ok, true);
  const conflictingGame = fixture({ secondConflict: true });
  await assert.rejects(conflictingGame.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /UID legado/);
  assert.equal(conflictingGame.writes.length, 0, 'conflito no segundo jogo aborta a transação inteira');
  const missingMirror = fixture({ missingMirror:true });
  assert.equal((await missingMirror.handler({ auth:{ uid:'maria' },
    data:{ tournamentId:'t1', manualParticipantId:'m1' } })).ok, true);
  assert.equal(missingMirror.writes.filter((entry) => String(entry.path || '').startsWith('participants/')).length, 0,
    'torneio com espelho inteiro ausente não inventa participantes físicos');
  assert.equal(missingMirror.writes.find((entry) => entry.path === 'historicalAthleteClaims/m1').data.mirrorAbsent, true);
  assert.equal(missingMirror.writes.find((entry) => entry.path === 'historicalAthleteClaims/m1').data.participantMirrorBeforeId, null);
  assert(missingMirror.writes.some((entry) => entry.path === 'matches/j1'));
  assert(missingMirror.writes.some((entry) => entry.kind === 'roster'));
  const inlineWithoutMirror = fixture({ missingMirror:true, inlineParticipants:true });
  await assert.rejects(inlineWithoutMirror.handler({ auth:{ uid:'maria' },
    data:{ tournamentId:'t1', manualParticipantId:'m1' } }), /elenco inline divergente/);
  assert.equal(inlineWithoutMirror.writes.length, 0);
  const partialMirror = fixture({ partialMirror:true });
  await assert.rejects(partialMirror.handler({ auth:{ uid:'maria' },
    data:{ tournamentId:'t1', manualParticipantId:'m1' } }), /espelho da vaga ausente/);
  assert.equal(partialMirror.writes.length, 0);
  const reopened = fixture({ reopened:true });
  await assert.rejects(reopened.handler({ auth:{ uid:'maria' },
    data:{ tournamentId:'t1', manualParticipantId:'m1' } }), /torneio encerrado/);
  assert.equal(reopened.writes.length, 0, 'torneio reaberto entre sugestão e confirmação recusa');
  const noIndex = fixture({ noIndex: true });
  await assert.rejects(noIndex.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /sem índice histórico/);
  assert.equal(noIndex.writes.length, 0);
  const newAccount = fixture({ creationTime: '2026-11-14T00:00:00Z' });
  await assert.rejects(newAccount.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /contas anteriores/);
  assert.equal(newAccount.writes.length, 0);
  const noAuthDate = fixture({ creationTime: '' });
  await assert.rejects(noAuthDate.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /data de criação/);
  assert.equal(noAuthDate.writes.length, 0);
  const gateOff = fixture({ canonicalReady: false });
  await assert.rejects(gateOff.handler({ auth: { uid: 'maria' },
    data: { tournamentId: 't1', manualParticipantId: 'm1' } }), /inscrições canônicas indisponíveis/);
  assert.equal(gateOff.writes.length, 0);
  console.log('✓ historical-athlete-claim-handler: grava UID sem placar, audita, idempotência e conflito');
})().catch((error) => { console.error(error); process.exitCode = 1; });
