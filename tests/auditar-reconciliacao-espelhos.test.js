'use strict';

const assert = require('node:assert/strict');
const split = require('../functions/vendor/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const core = require('../scripts/auditar-reconciliacao-espelhos-core.js');
const script = require('../scripts/auditar-reconciliacao-espelhos.js');

const root = 'projects/test/databases/(default)/documents/tournaments/private-fixture';
const stamp = '2026-10-31T00:00:00Z';
const doc = (name, fields) => ({ name, fields, updateTime: stamp });
const decode = (item) => item.fields;
const config = { id: 'private-fixture', name: 'Nome reservado', _nPartes: { matches: 1 } };
const record = { _loc: { tipo: 'matches', mi: 0 }, _phaseIndex: 0,
  jogo: { id: '1', phaseIndex: 0, p1: 'Alex', p2: 'Bia', team1Uids: ['uid-a', 'uid-b'],
    team2Uids: ['uid-c', 'uid-d'], scoreP1: 6, scoreP2: 4 } };

async function fixture(overrides = {}) {
  const game = overrides.game || record;
  const tournament = overrides.config || config;
  const participantRecords = split.dividir({ ...tournament, participants: overrides.participants || [] }, ['participants']).participants;
  const loaded = { matches: [game], inscritos: participantRecords, opponentHistory: [] };
  const mounted = await split.montarDoBanco(tournament, (name) => loaded[name]);
  const desired = roster.buildSeedDoc(mounted, mounted.matches[0]);
  return { tournament: doc(root, tournament), game: doc(root + '/matches/1', game),
    result: doc(root + '/results/1', { ...desired, ...overrides.result }), desired,
    mounted, extraCollections: { inscritos: participantRecords.map((item, index) =>
      doc(root + '/inscritos/' + index, item)), opponentHistory: [] } };
}

async function inspect(f, matches = [f.game], results = [f.result]) {
  return core.aggregate([await core.analyze(f.tournament, matches, results, f.extraCollections, decode)]);
}

(async () => {
  const clean = await fixture();
  assert.equal((await inspect(clean)).healthy, true);
  assert.equal(core.difference({ playerUids: ['a', 'b'] }, { playerUids: ['b', 'a'] }, 'playerUids'), 'orderOnly');
  assert.equal(core.difference({ playerUids: [] }, { playerUids: ['a'] }, 'playerUids'), 'emptyMirrorToDerivedUids');
  assert.equal(core.difference({ playerUids: ['a'] }, { playerUids: ['b'] }, 'playerUids'), 'differentUids');
  assert.equal(core.difference({}, { p1: 'A' }, 'p1'), 'absentInMirror');
  assert.equal(core.difference({ pendingResult: { x: 1 } }, { pendingResult: { x: 2 } }, 'pendingResult'), 'pendingResultDiff');
  assert.equal(core.difference({ pendingResult: { nested: { b: 2, a: 1 }, values: [1, 2] } },
    { pendingResult: { values: [1, 2], nested: { a: 1, b: 2 } } }, 'pendingResult'), null);
  assert.equal(core.difference({ pendingResult: { values: [1, 2] } },
    { pendingResult: { values: [2, 1] } }, 'pendingResult'), 'pendingResultDiff');

  const missingField = await fixture({ result: { p1: undefined } });
  assert.equal((await inspect(missingField)).fields.absentInMirror, 1);
  assert.equal((await inspect(missingField)).healthy, false);
  const uidGap = await fixture({ result: { playerUids: [] } });
  assert.equal((await inspect(uidGap)).fields.emptyMirrorToDerivedUids, 1);
  assert.equal((await inspect(uidGap)).evidence.uidEvidenceInsufficient, 1);
  assert.equal((await inspect(uidGap)).evidence.uidInsufficientRegistration, 1);
  const enrolled = [
    { uid: 'uid-a', p1Uid: 'uid-a' }, { uid: 'uid-b' }, { uid: 'uid-c' }, { uid: 'uid-d' }
  ];
  const registered = await fixture({ result: { playerUids: [] }, participants: enrolled });
  assert.equal(registered.mounted.participants.length, 4);
  assert.equal(registered.mounted.participants[0].uid, 'uid-a');
  assert.deepEqual(registered.mounted.matches[0].team1Uids, ['uid-a', 'uid-b']);
  assert.equal((await inspect(registered)).evidence.uidStructuralEvidence, 1,
    'uid repetido no mesmo objeto de inscrição não é inscrição duplicada');
  const duplicateEnrollment = await fixture({ result: { playerUids: [] },
    participants: [...enrolled, { uid: 'uid-a' }] });
  assert.equal((await inspect(duplicateEnrollment)).evidence.uidEvidenceInsufficient, 1);
  const missingEnrollment = await fixture({ result: { playerUids: [] }, participants: enrolled.slice(1) });
  assert.equal((await inspect(missingEnrollment)).evidence.uidEvidenceInsufficient, 1);
  const nameOnly = await fixture({ game: { ...record,
    jogo: { id: '1', phaseIndex: 0, p1: 'Alex', p2: 'Bia' } },
  result: { playerUids: [] }, participants: [
    { uid: 'uid-a', displayName: 'Alex' }, { uid: 'uid-c', displayName: 'Bia' }
  ] });
  assert.equal((await inspect(nameOnly)).evidence.uidStructuralEvidence, 0);
  assert.equal((await inspect(nameOnly)).evidence.uidEvidenceInsufficient, 1);
  assert.equal((await inspect(nameOnly)).evidence.uidInsufficientMissingSide, 1);
  const noExplicit = await fixture({ game: { ...record,
    jogo: { id: '1', phaseIndex: 0, p1: 'TBD', p2: 'BYE' } },
  result: { playerUids: ['unexpected-uid'] } });
  assert.equal((await inspect(noExplicit)).evidence.uidInsufficientNoExplicitUid, 1);
  const overlapping = await fixture({ game: { ...record,
    jogo: { ...record.jogo, team1Uids: ['uid-a'], team2Uids: ['uid-a'] } },
  result: { playerUids: [] } });
  assert.equal((await inspect(overlapping)).evidence.uidInsufficientOverlappingSides, 1);
  const swapped = await fixture({ participants: enrolled,
    result: { team1Uids: ['uid-c', 'uid-d'], team2Uids: ['uid-a', 'uid-b'] } });
  assert.equal((await inspect(swapped)).evidence.uidSideConflict, 1);
  const conflictAndMissing = await fixture({ game: { ...record,
    jogo: { ...record.jogo, team1Uids: ['uid-a'], team2Uids: undefined } },
  result: { playerUids: [], team1Uids: ['other-uid'] } });
  assert.equal((await inspect(conflictAndMissing)).evidence.uidSideConflict, 1);
  assert.equal((await inspect(conflictAndMissing)).evidence.uidInsufficientSideConflict, 1);
  assert.equal((await inspect(conflictAndMissing)).evidence.uidInsufficientMissingSide, 0);
  const absentSide = await fixture({ participants: enrolled,
    result: { team1Uids: undefined } });
  assert.equal((await inspect(absentSide)).evidence.uidSideConflict, 0);
  assert.equal((await inspect(absentSide)).healthy, false);
  const emptySide = await fixture({ participants: enrolled,
    result: { team1Uids: [] } });
  assert.equal((await inspect(emptySide)).evidence.uidSideConflict, 0);
  assert.equal((await inspect(emptySide)).healthy, false);
  const uidOrder = await fixture({ result: { playerUids: [...clean.desired.playerUids].reverse() } });
  assert.equal((await inspect(uidOrder)).fields.orderOnly, 1);
  const score = await fixture({ result: { scoreP1: 9 } });
  assert.equal((await inspect(score)).fields.scoreDiff, 1);
  const pending = await fixture({ result: { pendingResult: { winner: 'wrong' } } });
  assert.equal((await inspect(pending)).fields.absentInMatch, 1);
  assert.equal((await inspect(pending)).evidence.pendingMirrorOnly, 1);
  assert.equal((await inspect(pending)).evidence.pendingWithoutEventTimestamp, 1);
  const pendingGame = await fixture({ game: { ...record,
    jogo: { ...record.jogo, pendingResult: { winner: 'right' } } },
  result: { pendingResult: { winner: 'wrong' } } });
  assert.equal((await inspect(pendingGame)).fields.pendingResultDiff, 1);
  assert.equal((await inspect(pendingGame)).evidence.pendingBothDifferent, 1);
  const pendingReordered = await fixture({ game: { ...record,
    jogo: { ...record.jogo, pendingResult: { nested: { b: 2, a: 1 }, values: [1, 2] } } },
  result: { pendingResult: { values: [1, 2], nested: { a: 1, b: 2 } } } });
  assert.equal((await inspect(pendingReordered)).fields.pendingResultDiff, 0);
  assert.equal((await inspect(pendingReordered)).evidence.pendingBothDifferent, 0);
  const future = await fixture({ game: { ...record,
    jogo: { id: '1', phaseIndex: 0, p1: 'TBD', p2: 'BYE' } } });
  assert.equal((await inspect(future)).healthy, true);
  const walkover = await fixture({ game: { ...record, jogo: { ...record.jogo,
    wo: true, woAbsent: 'p2', winner: 'p1' } } });
  assert.equal((await inspect(walkover)).healthy, true);
  const absentResult = await inspect(clean, [clean.game], []);
  assert.equal(absentResult.missingResults, 1);
  assert.equal(absentResult.evidence.withoutMirror, 1);
  assert.equal(absentResult.evidence.pairedMatches, 0);
  const duplicateResult = await inspect(clean, [clean.game], [clean.result, clean.result]);
  assert.equal(duplicateResult.duplicateResults, 1);
  const wrongReference = await inspect(clean, [clean.game], [doc(clean.result.name, { ...clean.result.fields, matchId: '2' })]);
  assert.equal(wrongReference.invalidDocuments, 1);
  assert.equal(wrongReference.missingResults, 1);
  assert.equal(wrongReference.evidence.withoutMirror, 1);
  const orphan = await inspect(clean, [clean.game], [clean.result, doc(root + '/results/2', { matchId: '2', scoreP1: 6, replay: { point: 1 } })]);
  assert.equal(orphan.orphanResults, 1);
  assert.equal(orphan.evidence.orphanWithRecordedPlay, 1);
  assert.equal(orphan.evidence.orphanWithReplay, 1);
  const noPlayOrphan = doc(root + '/results/2', { matchId: '2' });
  const inline = await fixture({ config: { ...config, matches: [{ id: '2' }] } });
  const inlineReport = await inspect(inline, [inline.game], [inline.result, noPlayOrphan]);
  assert.equal(inlineReport.orphanResults, 1);
  assert.equal(inlineReport.evidence.orphanInlineRoot, 1);
  assert.equal(inlineReport.evidence.orphanWithoutPlayEvidence, 1);
  const duplicateInline = await fixture({ config: { ...config, matches: [{ id: 2 }, { id: '2' }] } });
  const duplicateReport = await inspect(duplicateInline, [duplicateInline.game], [duplicateInline.result, noPlayOrphan]);
  assert.equal(duplicateReport.orphanResults, 1);
  assert.equal(duplicateReport.evidence.orphanInlineRoot, 0);
  assert.equal(duplicateReport.evidence.orphanWithoutPlayEvidence, 1);
  const invalidInline = await fixture({ config: { ...config,
    matches: [{ id: NaN }, { id: Infinity }, { id: {} }, { id: null }, { id: '' }] } });
  assert.equal((await inspect(invalidInline, [invalidInline.game], [invalidInline.result, noPlayOrphan])).evidence.orphanInlineRoot, 0);
  const zeroInline = await fixture({ config: { ...config, matches: [{ id: 0 }] } });
  const zeroOrphan = doc(root + '/results/0', { matchId: '0' });
  assert.equal((await inspect(zeroInline, [zeroInline.game], [zeroInline.result, zeroOrphan])).evidence.orphanInlineRoot, 1);
  const invalidOrphan = await inspect(clean, [clean.game], [clean.result, doc(root + '/results/2', { matchId: '9', scoreP1: 6 })]);
  assert.equal(invalidOrphan.orphanResults, 0);
  assert.equal(invalidOrphan.invalidDocuments, 1);
  const ambiguous = await fixture({ game: { ...record, _phaseIndex: undefined,
    jogo: { ...record.jogo, phaseIndex: undefined } } });
  assert.equal((await inspect(ambiguous)).phase.ambiguo, 1);
  const noIndex = await fixture({ game: { _loc: record._loc, jogo: record.jogo } });
  assert.equal((await inspect(noIndex)).phase.ausente, 1);
  const wrongCounter = await fixture({ config: { ...config, _nPartes: { matches: 2 } } });
  assert.equal((await inspect(wrongCounter)).counterMismatches, 1);
  const malformed = await inspect(clean, [{ ...clean.game, updateTime: undefined }], [clean.result]);
  assert.equal(malformed.invalidDocuments > 0, true);
  const unmountable = await inspect(clean, [doc(clean.game.name, { _loc: { tipo: 'unknown' }, jogo: record.jogo })], [clean.result]);
  assert.equal(unmountable.invalidDocuments > 0, true);
  // O remonte agora falha fechado antes de contar pares quando o _loc é inválido.
  assert.equal(unmountable.evidence.unmountableMatch, 0);
  assert.equal(unmountable.evidence.pairedMatches, 0);
  const summed = core.aggregate([await core.analyze(registered.tournament, [registered.game], [registered.result],
    registered.extraCollections, decode), await core.analyze(registered.tournament, [registered.game], [registered.result],
    registered.extraCollections, decode)]);
  assert.equal(summed.evidence.uidStructuralEvidence, 2);
  assert.equal(summed.healthy, false);
  const reasonKeys = Object.keys(summed.evidence).filter((key) => key.startsWith('uidInsufficient'));
  for (const sample of [uidGap, nameOnly, noExplicit, overlapping, conflictAndMissing]) {
    const result = await inspect(sample);
    assert.equal(reasonKeys.reduce((sum, key) => sum + result.evidence[key], 0), result.evidence.uidEvidenceInsufficient);
    assert.equal(core.aggregate([result]).evidence.uidEvidenceInsufficient, result.evidence.uidEvidenceInsufficient);
    for (const key of [...reasonKeys, 'orphanInlineRoot']) {
      assert.equal(core.aggregate([result]).evidence[key], result.evidence[key]);
    }
  }
  assert.equal((await inspect(uidGap)).evidence.uidInsufficientOther, 0);
  const onlyEvidence = core.aggregate([{ ...core.aggregate([]), evidence: { ...core.aggregate([]).evidence,
    uidStructuralEvidence: 1 } }]);
  assert.equal(onlyEvidence.healthy, true);

  // Homônimos não podem autorizar UID por nome; a dupla usa identidade de cada lado.
  const homonyms = { ...config, participants: [{ displayName: 'Alex', uid: 'a' },
    { displayName: 'Alex', uid: 'b' }] };
  assert.deepEqual(roster.matchRoster(homonyms, { p1: 'Alex', p2: 'TBD' }), []);
  assert.deepEqual(roster.matchRoster(homonyms, record.jogo).sort(), ['uid-a', 'uid-b', 'uid-c', 'uid-d']);
  assert.deepEqual(roster.matchRoster(homonyms, { p1: 'TBD', p2: 'BYE' }), []);
  assert.deepEqual(roster.matchRoster(homonyms, { p1: 'Alex', p2: 'Bia', wo: true,
    team1Uids: ['uid-a', 'uid-b'], team2Uids: ['uid-c', 'uid-d'] }).sort(),
  ['uid-a', 'uid-b', 'uid-c', 'uid-d']);

  const calls = [];
  const firestoreValue = (value) => {
    if (value === undefined || value === null) return { nullValue: null };
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { integerValue: String(value) };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(firestoreValue) } };
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, firestoreValue(child)])) } };
  };
  const firestoreDoc = (item) => ({ ...item,
    fields: Object.fromEntries(Object.entries(item.fields).map(([key, value]) => [key, firestoreValue(value)])) });
  const readOnlyFetch = async (input, options) => {
    calls.push({ input: String(input), options });
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    const path = decodeURIComponent(new URL(input).pathname);
    const documents = path.endsWith('/tournaments') ? [clean.tournament] :
      path.endsWith('/matches') ? [clean.game] : path.endsWith('/results') ? [clean.result] : [];
    return { ok: true, json: async () => ({ documents: documents.map(firestoreDoc) }) };
  };
  const report = await script.audit(readOnlyFetch, 'private-token');
  assert.equal(report.healthy, true);
  assert(calls.length >= 4);
  const stdout = script.formatReport(report);
  assert.equal(stdout, JSON.stringify(report, null, 2) + '\n');
  for (const secret of ['private-fixture', 'private-token', 'uid-a', 'Nome reservado', 'Alex', stamp]) {
    assert(!JSON.stringify(report).includes(secret));
    assert(!stdout.includes(secret));
  }
  console.log('auditar-reconciliacao-espelhos: classificação, privacidade e GET-only OK');
})().catch((error) => { console.error(error); process.exitCode = 1; });
