'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync('js/views/bracket.js', 'utf8');
const server = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = server.indexOf("exports.assignMatchCourt = onCall({ invoker: 'public' }");
const end = server.indexOf('// ─── Atribuições da análise', start);
assert(start >= 0 && end > start);
let nowIso = '2026-10-20T18:00:00.000Z';
class TestDate extends Date {
  constructor(value) { super(value === undefined ? nowIso : value); }
  static now() { return Date.parse(nowIso); }
}
const HttpsError = class extends Error { constructor(code, message) { super(message); this.code = code; } };
const paths = [], saved = [], courtStates = new Map(), releases = new Map(), receipts = new Map();
const deleted = Symbol('delete-field');
let autoId = 0;
let tournament, ownerProfile = null, isAdmin = true;
const context = {
  exports: {}, onCall: (...args) => args.at(-1), HttpsError,
  db: {
    collection: collection => ({ doc: id => { const path = collection + '/' + id; const ref = {
      path, collection: child => ({ doc: childId => ({ path: path + '/' + child + '/' + (childId || 'auto-' + (++autoId)) }) })
    }; paths.push(ref.path); return ref; } }),
    runTransaction: async fn => { let wrote = false; return fn({ get: async ref => {
      if (wrote) throw new Error('Firestore transaction read after write');
      return ref.path.startsWith('users/')
      ? { exists: !!ownerProfile, data: () => ownerProfile }
      : ref.path.includes('/courtState/') ? { exists: courtStates.has(ref.path), data: () => courtStates.get(ref.path) }
      : ref.path.includes('/courtReleases/') ? { exists: releases.has(ref.path), data: () => releases.get(ref.path) }
      : ref.path.includes('/operationReceipts/') ? { exists: receipts.has(ref.path), data: () => receipts.get(ref.path) }
      : { exists: true, ref }; },
      set: (ref, data) => { wrote = true; courtStates.set(ref.path, { ...(courtStates.get(ref.path) || {}), ...data }); },
      update: (ref, ...values) => { wrote = true; const data = { ...(courtStates.get(ref.path) || {}) };
        for (let i = 0; i < values.length; i += 2) { const field = values[i], value = values[i + 1];
          if (field.segments) { const [parent, key] = field.segments; data[parent] = { ...(data[parent] || {}) };
            if (value === deleted) delete data[parent][key]; else data[parent][key] = value;
          } else data[field] = value;
        } courtStates.set(ref.path, data); },
      create: (ref, data) => { wrote = true; (ref.path.includes('/operationReceipts/') ? receipts : releases).set(ref.path, data); },
      delete: ref => { wrote = true; courtStates.delete(ref.path); } }); }
  },
  drawWindow: {
    _findMatch: (t, id) => t.matches.find(m => m.id === id),
    _collectAllMatches: t => t.matches,
    _clearTournamentDraw: t => { t.matches = []; },
    _matchHasRealPlay: () => false,
    ScoreplaceNextMatch: { conflictsWithActive: () => false }
  },
  _assertSandboxDrawOwner: async () => {},
  _leTorneio: async () => tournament,
  _isTournamentAdmin: () => isAdmin,
  _antesDoMotor: () => ({}),
  _gravaTorneio: (_tx, _ref, t) => { saved.push(JSON.stringify(t.matches)); return { clean: {} }; },
  _drawFail: (code, message) => new HttpsError(code, message),
  _courtOccupancy: require('../js/domain/court-occupancy.js'),
  ScoreplaceRefereeRoster: { sanitizeAll: value => value || [] },
  FieldValue: { increment: n => n, delete: () => deleted },
  FieldPath: class { constructor(...segments) { this.segments = segments; } },
  _operationReceipt: require('../functions-autodraw/operation-receipt-core.js'),
  _operationProtocolGuard: async () => {},
  _matchTiming: require('../js/domain/match-timing.js'),
  _agenda: require('../functions-autodraw/agenda-core.js'),
  Date: TestDate, Intl, Number, String, Array, Set, console
};
const helperStart = server.indexOf('async function _fusoDoEvento(');
const helperEnd = server.indexOf('/* ── L6.R1', helperStart);
assert(helperStart >= 0 && helperEnd > helperStart);
vm.runInNewContext(server.slice(helperStart, helperEnd), context);
vm.runInNewContext(server.slice(start, end), context);
const resetStart = server.indexOf('exports.resetTournamentToEnrollment = onCall(');
const resetEnd = server.indexOf('// ─── Rodada extra manual', resetStart);
assert(resetStart > 0 && resetEnd > resetStart);
vm.runInNewContext(server.slice(resetStart, resetEnd), context);
const callable = context.exports.assignMatchCourt;
const endOnCourt = context.exports.endMatchOnCourt;
const resetToEnrollment = context.exports.resetTournamentToEnrollment;
const request = (id, matchId, court, confirmCall = false) => ({ auth: { uid: 'owner' }, data: {
  tournamentId: id, sandbox: id.startsWith('sb_'), matchId, court, confirmCall
} });
const game = (id, court, scheduledAt = '2026-10-22T21:00:00.000Z') => ({ id, court, scheduledAt });

(async () => {
  const browser = { window: { _callCF: async (_name, data) => ({ data: { ok: true, ...data } }) } };
  const clientStart = client.indexOf('window._assignMatchCourt = function');
  const clientEnd = client.indexOf('window._spFormatElapsed = function', clientStart);
  assert(clientStart >= 0 && clientEnd > clientStart);
  vm.runInNewContext(client.slice(clientStart, clientEnd), browser);
  assert.equal((await browser.window._assignMatchCourt('sb_test', 'j1', 'Quadra 4')).sandbox, true);
  assert.equal((await browser.window._assignMatchCourt('tour_test', 'j1', 'Quadra 4')).sandbox, false);

  tournament = { timeZone: 'America/Sao_Paulo', callTime: 5, courtNames: ['Quadra 4', 'Quadra 5'], matches: [game('j1', 'Quadra 4')] };
  await callable(request('sb_test', 'j1', 'Quadra 4', true));
  assert.equal(paths.at(-1), 'sandboxes/sb_test');
  assert.ok(tournament.matches[0].courtCalledAt, 'sandbox pode simular antes do evento');
  tournament.matches[0] = game('j1', 'Quadra 4');
  const savesBeforeEarlyCall = saved.length;
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message));
  assert.equal(saved.length, savesBeforeEarlyCall, 'recusa antecipada não grava');
  assert.equal(paths.at(-1), 'tournaments/tour_test');
  const withZone = tournament.timeZone;
  delete tournament.timeZone;
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /fuso/.test(e.message));
  tournament.venueCity = 'São Paulo';
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message), 'fuso do local autoriza a regra de dia');
  delete tournament.venueCity;
  tournament.creatorUid = 'owner';
  ownerProfile = { city: 'São Paulo' };
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /programado/.test(e.message), 'fuso do perfil do dono autoriza a regra de dia');
  ownerProfile = null;
  delete tournament.creatorUid;
  tournament.timeZone = withZone;
  await assert.rejects(callable({ auth: { uid: 'owner' }, data: {
    tournamentId: 'sb_test', sandbox: false, matchId: 'j1', court: 'Quadra 4'
  } }), e => e.code === 'not-found');

  nowIso = '2026-10-22T02:59:59.000Z';
  await assert.rejects(callable(request('tour_test', 'j1', 'Quadra 4', true)),
    e => e.code === 'failed-precondition');
  nowIso = '2026-10-22T03:00:00.000Z';
  await callable(request('tour_test', 'j1', 'Quadra 4', true));
  assert.ok(tournament.matches[0].courtCalledAt, 'chamada começa no dia local correto');

  tournament.matches.push(game('j2', 'Quadra 5', '2026-10-22T22:00:00.000Z'));
  const beforeOccupied = saved.length;
  await assert.rejects(callable(request('tour_test', 'j2', 'Quadra 4', true)),
    e => e.code === 'failed-precondition' && /Quadra ocupada/.test(e.message));
  assert.equal(saved.length, beforeOccupied, 'quadra ocupada não grava nem desloca jogo');
  tournament.matches[0].resultAt = nowIso;
  tournament.matches[0].winner = 'p1';
  await callable(request('tour_test', 'j2', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'resultado libera a quadra');

  tournament.matches = [game('release-prod', 'Quadra 4'), game('follow-prod', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  const beforeRelease = JSON.stringify(tournament.matches);
  const productionRelease = await endOnCourt({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'release-prod'
  } });
  assert.equal(productionRelease.changed, true);
  assert.equal(JSON.stringify(tournament.matches), beforeRelease, 'Encerrado em produção não altera jogo nem placar');
  assert.ok(courtStates.get('tournaments/tour_test/courtState/main').released['release-prod']);
  await callable(request('tour_test', 'follow-prod', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'produção pode chamar próximo jogo para quadra liberada');
  assert.equal((await endOnCourt({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'release-prod'
  } })).changed, false, 'liberação repetida não cria novo estado');
  isAdmin = false;
  await assert.rejects(callable({ auth: { uid: 'stranger' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'release-prod', court: 'Quadra 4', confirmCall: true
  } }), e => e.code === 'permission-denied', 'chamada não revela a liberação a quem não tem permissão');
  await assert.rejects(endOnCourt({ auth: { uid: 'stranger' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'release-prod'
  } }), e => e.code === 'permission-denied', 'nem liberação repetida revela o estado a estranhos');
  tournament.matches.push(game('release-ref', 'Quadra 5'));
  tournament.matches.at(-1).courtCalledAt = nowIso;
  tournament.arbitros = [{ uid: 'ref', status: 'confirmed' }];
  assert.equal((await endOnCourt({ auth: { uid: 'ref' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'release-ref'
  } })).changed, true, 'árbitro confirmado pode liberar a quadra em produção');
  tournament.matches.push(game('assign-ref', 'Quadra 5'));
  await callable({ auth: { uid: 'ref' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: 'assign-ref', court: 'Quadra 5', confirmCall: true
  } });
  assert.ok(tournament.matches.at(-1).courtCalledAt, 'árbitro confirmado pode chamar para quadra em produção');
  isAdmin = true;

  tournament.matches = [game('release-sandbox', 'Quadra 4'), game('follow-sandbox', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  const sandboxRelease = await endOnCourt({ auth: { uid: 'owner' }, data: {
    tournamentId: 'sb_test', sandbox: true, matchId: 'release-sandbox'
  } });
  assert.equal(sandboxRelease.changed, true);
  assert.ok(courtStates.get('sandboxes/sb_test/courtState/main').released['release-sandbox']);
  await callable(request('sb_test', 'follow-sandbox', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'sandbox segue o mesmo fluxo de liberação');

  // O reset apaga o marcador na mesma transação. Se o sorteio seguinte reutilizar
  // o ID, ele poderá ser chamado e encerrado sem herdar o placar pendente antigo.
  tournament.isSandbox = true;
  await resetToEnrollment({ auth: { uid: 'owner' }, data: { tournamentId: 'sb_test', restoreMode: 'sandbox' } });
  assert.equal(courtStates.has('sandboxes/sb_test/courtState/main'), false, 'reset limpa liberações da chave antiga');
  tournament.matches = [game('release-sandbox', 'Quadra 4')];
  tournament.matches[0].courtCalledAt = nowIso;
  assert.equal((await endOnCourt({ auth: { uid: 'owner' }, data: {
    tournamentId: 'sb_test', sandbox: true, matchId: 'release-sandbox'
  } })).changed, true, 'ID reutilizado pode ser liberado em novo sorteio');
  assert.equal([...releases.values()].filter(entry => entry.matchId === 'release-sandbox').length, 2,
    'auditoria guarda as duas liberações em documentos separados');
  delete tournament.isSandbox;

  const drawStart = server.indexOf('exports.drawRound = onCall(');
  const drawEnd = server.indexOf('// ───', drawStart + 30);
  assert(drawStart > 0 && drawEnd > drawStart);
  const redrawSource = server.slice(drawStart, drawEnd);
  assert.match(redrawSource, /if \(hadBracket\) tx\.delete\(ref\.collection\('courtState'\)\.doc\('main'\)\)/,
    're-sorteio limpa o marcador junto com a gravação da nova chave');

  tournament.matches = [game('w1', 'Quadra 4'), game('w2', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  tournament.matches[0].wo = true;
  await callable(request('tour_test', 'w2', 'Quadra 4', true));
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'W.O. libera a quadra');

  tournament.matches = [game('a', 'Quadra 4'), game('b', 'Quadra 5')];
  tournament.matches[0].courtCalledAt = nowIso;
  await callable(request('tour_test', 'a', 'Quadra 5'));
  assert.equal(tournament.matches[0].court, 'Quadra 5');
  assert.equal(tournament.matches[1].court, 'Quadra 4', 'troca automática não vê o próprio jogo como ocupante');
  const op = (action, id, operationId) => ({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId: id, action, operationId
  } });
  const releaseId = 'b5334898-7c8a-4915-8c88-a53180496fa1';
  const restoreId = '7c1969f6-c371-47e0-9352-66f1b5403ed1';
  const cancelId = '73cf344a-157a-4de4-83a9-ddc292261ef1';
  tournament.matches = [game('dot.part', 'Quadra 4')];
  tournament.matches[0].courtCalledAt = nowIso;
  tournament.matches[0].courtClockBaseAt = nowIso;
  const originalClock = tournament.matches[0].courtClockBaseAt;
  assert.equal((await endOnCourt(op('release', 'dot.part', releaseId))).changed, true);
  assert.equal((await endOnCourt(op('release', 'dot.part', releaseId))).replayed, true,
    'retry de liberação usa recibo antes do estado released');
  assert.equal((await endOnCourt(op('restore', 'dot.part', restoreId))).changed, true);
  assert.equal(courtStates.get('tournaments/tour_test/courtState/main').released['dot.part'], undefined,
    'FieldPath preserva ponto no ID e apaga somente a marca do jogo');
  assert.equal(tournament.matches[0].courtClockBaseAt, originalClock,
    'restauração preserva o relógio contínuo da chamada');
  assert.equal((await endOnCourt(op('restore', 'dot.part', restoreId))).replayed, true,
    'retry de restauração não depende do marcador já apagado');
  assert.equal((await endOnCourt(op('release', 'dot.part', '6cc8c722-961f-43c1-a72b-75c6fe265f96'))).changed, true,
    'após restaurar, nova liberação cria um evento novo');
  await assert.rejects(endOnCourt(op('cancel-call', 'dot.part', cancelId)),
    e => e.code === 'failed-precondition' && /Restaure primeiro/.test(e.message));
  assert.equal((await endOnCourt(op('restore', 'dot.part', '5f7e6d04-fbb9-4a54-8d93-a1fe4c19e01e'))).changed, true);
  assert.equal((await endOnCourt(op('cancel-call', 'dot.part', cancelId))).changed, true);
  assert.equal(tournament.matches[0].courtCalledAt, undefined, 'desfazer chamada não altera quadra agendada');
  assert.equal(tournament.matches[0].court, 'Quadra 4');
  assert.equal((await endOnCourt(op('cancel-call', 'dot.part', cancelId))).replayed, true);
  tournament.matches[0].courtCalledAt = nowIso;
  tournament.matches[0].scoreP1 = '2';
  await assert.rejects(endOnCourt(op('cancel-call', 'dot.part', '4cd36370-f078-4dc2-94cf-3b8039203a43')),
    e => e.code === 'failed-precondition' && /Editar placar/.test(e.message),
    'qualquer placar parcial impede Cancelar');
  await assert.rejects(endOnCourt(op('release', 'dot.part', 'b6cc1f22-c962-4c69-920d-e9616a4045a6')),
    e => e.code === 'failed-precondition' && /sem resultado/.test(e.message),
    'placar parcial também impede liberar a quadra');
  tournament.matches[0].resultAt = nowIso;
  tournament.matches[0].winner = 'p1';
  await assert.rejects(endOnCourt(op('release', 'dot.part', 'e72286aa-dd6e-4a1c-8d7a-8fe36d47c80b')),
    e => e.code === 'failed-precondition' && /sem resultado/.test(e.message));
  await assert.rejects(endOnCourt(op('cancel-call', 'dot.part', '952f667d-4744-4312-977a-2b927546b2ba')),
    e => e.code === 'failed-precondition' && /Editar placar/.test(e.message),
    'Cancelar nunca corrige resultado lançado');
  delete tournament.matches[0].resultAt;
  delete tournament.matches[0].winner;
  delete tournament.matches[0].scoreP1;
  tournament.matches[0].pendingResult = { scoreP1: 6, scoreP2: 3 };
  await assert.rejects(endOnCourt(op('cancel-call', 'dot.part', 'af885541-8772-4c40-9840-83ad381d81b8')),
    e => e.code === 'failed-precondition' && /Editar placar/.test(e.message),
    'proposta de placar também bloqueia Cancelar');
  tournament.matches = [game('fila1', 'Quadra 4'), game('fila2', 'Quadra 5'), game('fila3', 'Quadra 6')];
  const statePath = 'tournaments/tour_test/courtState/main';
  courtStates.set(statePath, { released: {}, postponed: [], revision: 0 });
  const postpone = (matchId, expectedRevision, operationId) => endOnCourt({ auth: { uid: 'owner' }, data: {
    tournamentId: 'tour_test', sandbox: false, matchId, action: 'postpone', expectedRevision, operationId
  } });
  const skip1 = '4b3d7597-0e0a-44b2-9d2c-6dc03943bd55';
  const skip2 = '944ed108-55e8-48e8-bbd0-fd5efc722ab3';
  assert.equal((await postpone('fila1', 0, skip1)).changed, true);
  assert.deepEqual(Array.from(courtStates.get(statePath).postponed), ['fila1']);
  assert.equal((await postpone('fila1', 0, skip1)).replayed, true, 'retry usa recibo antes da revisão');
  await assert.rejects(postpone('fila2', 0, skip2), e => e.code === 'failed-precondition' && /fila mudou/.test(e.message));
  assert.equal((await postpone('fila2', 1, skip2)).changed, true);
  assert.deepEqual(Array.from(courtStates.get(statePath).postponed), ['fila1', 'fila2']);
  assert.equal(tournament.matches.every(m => !m.courtCalledAt), true, 'pular não chama nem altera partida');
  tournament.matches[2].courtCalledAt = nowIso;
  await assert.rejects(postpone('fila3', 1, 'fb51aff9-5549-47ca-96e8-c1f4b5f7c26d'),
    e => e.code === 'failed-precondition' && /já saiu da fila/.test(e.message));
  console.log('✓ sandbox isolado; dia local, ocupação e troca de quadra validados na callable real');
})().catch(error => { console.error(error); process.exitCode = 1; });
