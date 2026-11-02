'use strict';
const assert = require('node:assert/strict');
const parts = require('../functions/split-parts.js');
const split = require('../functions/vendor/tournament-split-core.js');
const game = id => ({ id, p1: 'A', p2: 'B', scoreP1: 6, scoreP2: 4, winner: 'A' });

function db(records) {
  const calls = [], reads = [];
  const ref = { path: 'tournaments/fake', collection: name => ({
    get: async () => { reads.push(name); return { docs: (records[name] || []).map(entry => ({ data: () => entry })) }; },
    doc: id => ({ path: 'tournaments/fake/' + name + '/' + id })
  }) };
  const tx = { update(_ref, data) { calls.push({ type: 'update', data }); },
    set(_ref, data) { calls.push({ type: 'set', data }); },
    delete(_ref) { calls.push({ type: 'delete' }); } };
  return { ref, tx, calls, reads };
}

(async () => {
  for (const root of [{}, { _semPesados: [] }, { _inlineGamesExternalized: true }]) {
    assert.deepEqual(parts.partesDivididas(root), split.partesDe(root));
    assert(parts.partesDivididas(root).length > 0,
      'gravar nunca alcança o retorno antecipado sem partes canônicas');
  }
  const original = { _inlineGamesExternalized: true, _nPartes: { matches: 5, grupos: 0 },
    groups: [{ rounds: [{ matches: [game('g')], round: 1 }] }],
    thirdPlaceMatch: game('third'), rounds: [{ matches: [game('r')] }],
    phaseRounds: { '2': { rounds: [{ matches: [game('p')] }] } }, matches: [game('m')] };
  const separated = split.dividir(original, ['matches']);
  const fake = db({ matches: separated.matches });
  const mounted = await parts.hidratar(null, fake.ref, JSON.parse(JSON.stringify(separated.config)), ['matches']);
  assert.deepEqual(mounted.groups, original.groups);
  assert.deepEqual(mounted.thirdPlaceMatch, original.thirdPlaceMatch);
  assert.deepEqual(mounted.rounds, original.rounds);
  assert.deepEqual(mounted.phaseRounds, original.phaseRounds);
  assert.deepEqual(mounted.matches, original.matches);
  assert.deepEqual(await parts.hidratar(null, fake.ref, { groups: [], _inlineGamesExternalized: true }, []),
    { groups: [], _inlineGamesExternalized: true });

  const updated = JSON.parse(JSON.stringify(mounted.groups));
  updated[0].label = 'Grupo A';
  const updatedRounds = JSON.parse(JSON.stringify(mounted.rounds));
  updatedRounds[0].label = 'Rodada A';
  const updatedPhaseRounds = JSON.parse(JSON.stringify(mounted.phaseRounds));
  updatedPhaseRounds['2'].label = 'Fase A';
  parts.gravar(fake.tx, fake.ref, mounted, { groups: updated, rounds: updatedRounds,
    phaseRounds: updatedPhaseRounds, thirdPlaceMatch: mounted.thirdPlaceMatch });
  assert.equal(fake.calls.filter(x => x.type === 'delete').length, 0);
  assert.equal(fake.calls.length, 1);
  assert.equal(fake.calls[0].data.groups[0].rounds[0].matches.length, 0);
  assert.equal(fake.calls[0].data.rounds[0].matches.length, 0);
  assert.equal(fake.calls[0].data.phaseRounds['2'].rounds[0].matches.length, 0);
  assert.equal(fake.calls[0].data.rounds[0].label, 'Rodada A');
  assert.equal(fake.calls[0].data.phaseRounds['2'].label, 'Fase A');
  assert(!Object.hasOwn(fake.calls[0].data, 'thirdPlaceMatch'));
  assert.equal(updated[0].rounds[0].matches.length, 1, 'entrada do chamador preservada');
  assert.equal(updatedRounds[0].matches.length, 1);
  assert.equal(updatedPhaseRounds['2'].rounds[0].matches.length, 1);

  for (const changed of [
    { groups: [{ rounds: [{ matches: [{ ...game('g'), scoreP1: 7 }] }] }] },
    { groups: [{ rounds: [{ matches: [game('other')] }] }] },
    { groups: [] },
    { thirdPlaceMatch: { ...game('third'), scoreP2: 5 } },
    { rounds: [{ matches: [{ ...game('r'), scoreP1: 7 }] }] },
    { phaseRounds: { '2': { rounds: [{ matches: [] }] } } },
    { rounds: [{ matches: [game('r'), game('r')] }] },
    { rounds: [{ matches: [] }], phaseRounds: { '2': { rounds: [{ matches: [game('p'), game('r')] }] } } }
  ]) {
    const before = fake.calls.length;
    assert.throws(() => parts.gravar(fake.tx, fake.ref, mounted, changed), /escrita física específica|ID de jogo repetido/);
    assert.equal(fake.calls.length, before);
  }
  assert.throws(() => parts.gravar(fake.tx, fake.ref, mounted, { matches: [game('m')] }),
    /escrita física específica/);
  assert.equal(fake.calls.filter(x => x.type === 'delete').length, 0);
  parts.gravar(fake.tx, fake.ref, mounted, { updatedAt: 'later' });
  assert.equal(fake.calls.filter(x => x.type === 'delete').length, 0);

  const partial = { _inlineGamesExternalized: true, _nPartes: { matches: 1 },
    rounds: [{ matches: [] }] };
  const partialFake = db({});
  assert.throws(() => parts.gravar(partialFake.tx, partialFake.ref, partial,
    { rounds: partial.rounds }), /não foram hidratados por completo/);
  assert.equal(partialFake.calls.length, 0);
  parts.gravar(partialFake.tx, partialFake.ref, partial, { opinionPolls: [{ id: 'p' }] });
  assert.equal(partialFake.calls.length, 1, 'metadados sem estrutura aceitos com hidratação parcial');

  const groupedOriginal = { _inlineGamesExternalized: true,
    _nPartes: { matches: 2, grupos: 1 },
    rounds: [{ matches: [game('rg')], monarchGroups: [{ id: 'mg', playersUids: ['u1'] }] }],
    phaseRounds: { '2': { rounds: [{ matches: [game('pg')] }] } } };
  const groupedSplit = split.dividir(groupedOriginal, ['matches', 'grupos']);
  const groupedFake = db({ matches: groupedSplit.matches, grupos: groupedSplit.grupos });
  const groupedMounted = await parts.hidratar(null, groupedFake.ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['matches', 'grupos']);
  assert.deepEqual(groupedFake.reads, ['matches', 'grupos']);
  assert.deepEqual(groupedMounted.rounds, groupedOriginal.rounds);
  assert.deepEqual(groupedMounted.phaseRounds, groupedOriginal.phaseRounds);
  assert.equal(groupedFake.calls.length, 0);
  const groupsOnlyFake = db({ matches: groupedSplit.matches, grupos: groupedSplit.grupos });
  const groupsOnly = await parts.hidratar(null, groupsOnlyFake.ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['grupos']);
  assert.deepEqual(groupsOnlyFake.reads, ['matches', 'grupos']);
  assert.deepEqual(groupsOnly.rounds, groupedMounted.rounds);
  assert.equal(groupsOnly.rounds[0].matches[0].id, 'rg');
  assert.equal(groupsOnly.rounds[0].monarchGroups[0].id, 'mg');
  const fullFake = db({ matches: groupedSplit.matches, grupos: groupedSplit.grupos });
  const full = await parts.hidratar(null, fullFake.ref,
    JSON.parse(JSON.stringify(groupedSplit.config)));
  assert.deepEqual(full.rounds, groupsOnly.rounds);
  const participantsOnlyFake = db({ matches: groupedSplit.matches, grupos: groupedSplit.grupos });
  await parts.hidratar(null, participantsOnlyFake.ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['participants']);
  assert.deepEqual(participantsOnlyFake.reads, ['inscritos']);
  const noIndicatorFake = db({ matches: groupedSplit.matches, grupos: groupedSplit.grupos });
  await parts.hidratar(null, noIndicatorFake.ref, { rounds: [] }, ['grupos']);
  assert.deepEqual(noIndicatorFake.reads, []);

  const lostLoc = JSON.parse(JSON.stringify(groupedSplit.grupos[0]));
  lostLoc._loc.ri = 9;
  await assert.rejects(parts.hidratar(null,
    db({ matches: groupedSplit.matches, grupos: [lostLoc] }).ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['grupos']));
  const duplicateLoc = JSON.parse(JSON.stringify(groupedSplit.grupos[0]));
  duplicateLoc._chave = 'other';
  await assert.rejects(parts.hidratar(null,
    db({ matches: groupedSplit.matches, grupos: [groupedSplit.grupos[0], duplicateLoc] }).ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['grupos']), /repetida|remontar falhou/);
  const adulterated = JSON.parse(JSON.stringify(groupedSplit.grupos[0]));
  adulterated.grupo.playersUids = ['u2'];
  await assert.rejects(parts.hidratar(null,
    db({ matches: groupedSplit.matches, grupos: [adulterated] }).ref,
    JSON.parse(JSON.stringify(groupedSplit.config)), ['grupos']), /perdeu ou alterou/);
  const groupedUpdate = { rounds: JSON.parse(JSON.stringify(groupedMounted.rounds)),
    phaseRounds: JSON.parse(JSON.stringify(groupedMounted.phaseRounds)) };
  groupedUpdate.rounds[0].label = 'metadado';
  parts.gravar(groupedFake.tx, groupedFake.ref, groupedMounted, groupedUpdate);
  assert.equal(groupedFake.calls.length, 1);

  const legacyGroups = { _semPesados: ['grupos'], _nPartes: { grupos: 1 },
    rounds: [{ round: 1, matches: [game('inline-round')],
      monarchGroups: [{ id: 'legacy-mg', playersUids: ['u1'] }] }] };
  const legacyGroupsSplit = split.dividir(legacyGroups, ['grupos']);
  const legacyGroupsFake = db({ matches: [], grupos: legacyGroupsSplit.grupos });
  const legacyGroupsMounted = await parts.hidratar(null, legacyGroupsFake.ref,
    JSON.parse(JSON.stringify(legacyGroupsSplit.config)));
  assert.deepEqual(legacyGroupsMounted.rounds, legacyGroups.rounds);
  const legacyRound = JSON.parse(JSON.stringify(legacyGroupsMounted.rounds[0]));
  legacyRound.label = 'renomeada';
  parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref, legacyGroupsMounted,
    { rounds: [legacyRound] });
  assert.equal(legacyGroupsFake.calls.length, 1);
  assert.equal(legacyGroupsFake.calls[0].data.rounds[0].matches[0].id, 'inline-round');
  assert.deepEqual(legacyGroupsFake.calls[0].data.rounds[0].monarchGroups, []);
  const noGroupsInRound = JSON.parse(JSON.stringify(legacyRound));
  delete noGroupsInRound.monarchGroups;
  parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref, legacyGroupsMounted,
    { rounds: [noGroupsInRound] });
  assert.equal(legacyGroupsFake.calls.length, 2);
  assert.equal(legacyGroupsFake.calls[1].data.rounds[0].matches[0].id, 'inline-round');
  assert.deepEqual(legacyGroupsFake.calls[1].data.rounds[0].monarchGroups, []);
  const emptyGroupRound = { ...legacyRound, monarchGroups: [] };
  parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref, legacyGroupsMounted,
    { rounds: [emptyGroupRound] });
  assert.equal(legacyGroupsFake.calls.length, 3);
  assert.deepEqual(legacyGroupsFake.calls[2].data.rounds[0].monarchGroups, [],
    'array vazio mantém grupo físico e não o reembute');
  assert.equal(legacyGroupsFake.calls.filter(x => x.type === 'delete').length, 0);
  const changedLegacy = JSON.parse(JSON.stringify(legacyRound));
  changedLegacy.monarchGroups[0].playersUids = ['u2'];
  for (const invalid of [
    [changedLegacy],
    [],
    [legacyRound, { round: 2, monarchGroups: [{ id: 'new', playersUids: ['u3'] }] }]
  ]) {
    assert.throws(() => parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref,
      legacyGroupsMounted, { rounds: invalid }), /grupos físicos exigem escrita específica/);
    assert.equal(legacyGroupsFake.calls.length, 3);
  }
  const extraRound = { round: 2, matches: [] };
  parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref, legacyGroupsMounted,
    { rounds: [legacyRound, extraRound] });
  assert.equal(legacyGroupsFake.calls.length, 4);
  const legacyPartialFake = db({ matches: [], grupos: legacyGroupsSplit.grupos });
  const legacyPartial = await parts.hidratar(null, legacyPartialFake.ref,
    JSON.parse(JSON.stringify(legacyGroupsSplit.config)), ['participants']);
  assert.deepEqual(legacyPartialFake.reads, ['inscritos']);
  assert.throws(() => parts.gravar(legacyPartialFake.tx, legacyPartialFake.ref,
    legacyPartial, { rounds: legacyPartial.rounds }), /não foram hidratados por completo/);
  assert.equal(legacyPartialFake.calls.length, 0);
  const noLegacyCount = JSON.parse(JSON.stringify(legacyGroupsMounted));
  delete noLegacyCount._nPartes.grupos;
  assert.throws(() => parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref,
    noLegacyCount, { rounds: noLegacyCount.rounds }), /não foram hidratados por completo/);
  const legacyAlias = JSON.parse(JSON.stringify(noLegacyCount));
  legacyAlias._nGrupos = 1;
  parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref,
    legacyAlias, { rounds: legacyAlias.rounds });
  assert.equal(legacyGroupsFake.calls.at(-1).data.rounds[0].matches[0].id, 'inline-round');
  const legacyConflict = JSON.parse(JSON.stringify(legacyGroupsMounted));
  legacyConflict._nGrupos = 2;
  assert.throws(() => parts.gravar(legacyGroupsFake.tx, legacyGroupsFake.ref,
    legacyConflict, { rounds: legacyConflict.rounds }), /contadores físicos de grupos divergentes/);
  assert.deepEqual(groupedFake.calls[0].data.rounds[0].matches, []);
  assert.deepEqual(groupedFake.calls[0].data.rounds[0].monarchGroups, []);
  assert.deepEqual(groupedFake.calls[0].data.phaseRounds['2'].rounds[0].matches, []);
  assert.equal(groupedFake.calls.filter(x => x.type === 'delete').length, 0,
    'sem campo grupos no update não apaga a subcoleção');
  assert.equal(groupedUpdate.rounds[0].monarchGroups.length, 1);
  const groupedChanged = JSON.parse(JSON.stringify(groupedMounted.rounds));
  groupedChanged[0].monarchGroups[0].playersUids = ['u2'];
  assert.throws(() => parts.gravar(groupedFake.tx, groupedFake.ref, groupedMounted,
    { rounds: groupedChanged }), /grupos migrados exigem escrita física específica/);
  assert.equal(groupedFake.calls.length, 1);
  const noGroupCount = JSON.parse(JSON.stringify(groupedMounted));
  delete noGroupCount._nPartes.grupos;
  assert.throws(() => parts.gravar(groupedFake.tx, groupedFake.ref, noGroupCount,
    { rounds: noGroupCount.rounds }), /grupos migrados não foram hidratados por completo/);
  assert.equal(groupedFake.calls.length, 1);
  const markerAlias = JSON.parse(JSON.stringify(noGroupCount));
  markerAlias._nGrupos = 1;
  parts.gravar(groupedFake.tx, groupedFake.ref, markerAlias,
    { rounds: markerAlias.rounds });
  assert.equal(groupedFake.calls.length, 2);
  const markerConflict = JSON.parse(JSON.stringify(groupedMounted));
  markerConflict._nGrupos = 2;
  assert.throws(() => parts.gravar(groupedFake.tx, groupedFake.ref, markerConflict,
    { rounds: markerConflict.rounds }), /contadores físicos de grupos divergentes/);

  // A posição física de um jogo migrado não muda por reordenação implícita.
  // Grupos/rodadas sem jogos físicos não fazem parte desta recusa.
  const withPositions = { _inlineGamesExternalized: true, _nPartes: { matches: 3, grupos: 0 }, groups: [
    { rounds: [{ round: 1, matches: [game('g-a')] }, { round: 2, matches: [game('g-b')] }] },
    { rounds: [{ round: 1, matches: [game('g-c')] }] }
  ] };
  const positioned = split.dividir(withPositions, ['matches']);
  const positionFake = db({ matches: positioned.matches });
  const positionMounted = await parts.hidratar(null, positionFake.ref,
    JSON.parse(JSON.stringify(positioned.config)), ['matches']);
  const reversedGroups = JSON.parse(JSON.stringify(positionMounted.groups)).reverse();
  assert.throws(() => parts.gravar(positionFake.tx, positionFake.ref, positionMounted,
    { groups: reversedGroups }), /escrita física específica/);
  const reversedRounds = JSON.parse(JSON.stringify(positionMounted.groups));
  reversedRounds[0].rounds.reverse();
  assert.throws(() => parts.gravar(positionFake.tx, positionFake.ref, positionMounted,
    { groups: reversedRounds }), /escrita física específica/);
  assert.equal(positionFake.calls.length, 0, 'reordenação com jogo físico não inicia escrita');

  const old = { groups: [{ rounds: [{ matches: [game('inline')] }] }] };
  const oldFake = db({ matches: [] });
  const oldMounted = await parts.hidratar(null, oldFake.ref, old, ['matches']);
  assert.equal(oldMounted.groups[0].rounds[0].matches[0].id, 'inline');
  parts.gravar(oldFake.tx, oldFake.ref, oldMounted, { updatedAt: 'later' });
  assert.equal(oldFake.calls.filter(x => x.type === 'delete').length, 0);
  const legacyGroupEdit = [{ label: 'Renomeado', rounds: [{ round: 1, matches: [game('inline')] }] }];
  const beforeLegacyEdit = oldFake.calls.length;
  parts.gravar(oldFake.tx, oldFake.ref, oldMounted, { groups: legacyGroupEdit });
  assert.equal(oldFake.calls.length, beforeLegacyEdit + 1);
  assert.equal(oldFake.calls.at(-1).type, 'update');
  assert.equal(oldFake.calls.at(-1).data.groups[0].rounds[0].matches[0].id, 'inline');
  assert.equal(oldFake.calls.filter(x => x.type === 'set' || x.type === 'delete').length, 0);
  const legacy = { groups: [{ rounds: [{ matches: [game('inline')] }] }],
    thirdPlaceMatch: game('bronze'), rounds: [{ matches: [] }] };
  const legacySplit = split.dividir({ rounds: [{ matches: [game('physical')] }] }, ['matches']);
  const legacyFake = db({ matches: legacySplit.matches });
  const legacyMounted = await parts.hidratar(null, legacyFake.ref,
    JSON.parse(JSON.stringify(legacy)), ['matches']);
  assert.deepEqual(legacyMounted.groups, legacy.groups);
  assert.deepEqual(legacyMounted.thirdPlaceMatch, legacy.thirdPlaceMatch);
  assert.equal(legacyMounted.rounds[0].matches[0].id, 'physical');
  const moreLegacy = { ...legacy, matches: [game('inline-root')],
    phaseRounds: { '2': { rounds: [{ matches: [game('inline-phase')] }] } } };
  const moreMounted = await parts.hidratar(null, legacyFake.ref,
    JSON.parse(JSON.stringify(moreLegacy)), ['matches']);
  assert.deepEqual(moreMounted.matches, moreLegacy.matches);
  assert.deepEqual(moreMounted.phaseRounds, moreLegacy.phaseRounds);
  assert.deepEqual(moreMounted.groups, moreLegacy.groups);
  assert.deepEqual(moreMounted.thirdPlaceMatch, moreLegacy.thirdPlaceMatch);
  const collisionRoot = { _inlineGamesExternalized: true,
    _nPartes: { matches: 1 }, groups: [{ rounds: [{ matches: [game('same-id')] }] }] };
  const collisionPhysical = split.dividir(collisionRoot, ['matches']).matches;
  assert.equal(split.remontar({ config: collisionRoot, matches: collisionPhysical }), null,
    'marcador ligado nunca aceita o mesmo jogo na raiz e na subcoleção');
  await assert.rejects(parts.hidratar(null, db({ matches: collisionPhysical }).ref,
    JSON.parse(JSON.stringify(collisionRoot)), ['matches']), /remontar falhou/);
  console.log('E05: hidratação física e gravação sem reembutir ou apagar jogos OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
