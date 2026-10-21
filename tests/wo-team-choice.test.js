'use strict';
const assert = require('assert');
const { validateTeamWO } = require('../functions-autodraw/wo-claim-core.js');
const { applyTournamentWO } = require('../functions-autodraw/draw-core.js');

const mixed = () => ({
  id: 'm1', p1: 'Ana / Bia', p2: 'Clara / Dora',
  team1Uids: ['ana'], team2Uids: ['clara', 'dora'],
  team1Obj: { p1Uid: 'ana', p2ManualId: 'manual-bia' },
  team2Obj: { p1Uid: 'clara', p2Uid: 'dora' }
});
let result = validateTeamWO(mixed(), ['ana']);
assert.equal(result.ok, true, 'dupla com uma conta e uma inscrição manual aceita');
assert.equal(result.team.label, 'Ana / Bia');
assert.equal(result.opponent.label, 'Clara / Dora');

const reversed = mixed();
reversed.team1Obj = { p1ManualId: 'manual-ana', p2Uid: 'bia' };
reversed.team1Uids = ['bia'];
assert.equal(validateTeamWO(reversed, ['bia']).ok, true, 'posição manual antes da conta também é dupla');

const single = mixed();
single.p1 = 'Ana'; single.team1Obj = { p1Uid: 'ana' };
assert.equal(validateTeamWO(single, ['ana']).reason, 'not-a-team', 'jogo individual não vira W.O. de dupla');
assert.equal(validateTeamWO(mixed(), ['stranger']).reason, 'stale-or-partial-uids', 'UID fora do jogo é recusado');
assert.equal(validateTeamWO(mixed(), ['ana', 'clara']).reason, 'stale-or-partial-uids', 'conjunto de lados distintos é recusado');
const overlap = mixed(); overlap.team2Uids = ['ana', 'dora'];
assert.equal(validateTeamWO(overlap, ['ana']).reason, 'overlapping-uids', 'mesmo UID nos dois lados é recusado');
const noUid = mixed(); noUid.team1Uids = []; noUid.p1Uid = null; noUid.team1Obj = { p1ManualId: 'a', p2ManualId: 'b' };
assert.equal(validateTeamWO(noUid, ['clara', 'dora']).reason, 'side-without-uid', 'dupla só manual não oferece alvo ambíguo');
const manualOpp = mixed(); manualOpp.team2Uids = []; manualOpp.p2Uid = null; manualOpp.team2Obj = { p1ManualId: 'c', p2ManualId: 'd' };
assert.equal(validateTeamWO(manualOpp, ['ana']).reason, 'side-without-uid', 'adversário só manual bloqueia o botão');

const match = mixed();
const tournament = {
  id: 'T', format: 'Eliminatórias Simples', woScope: 'individual',
  participants: [
    { uid: 'ana', displayName: 'Ana', name: 'Ana' },
    { uid: 'clara', displayName: 'Clara', name: 'Clara' },
    { uid: 'dora', displayName: 'Dora', name: 'Dora' }
  ],
  standbyParticipants: [{ uid: 'reserva', displayName: 'Reserva', name: 'Reserva' }],
  checkedIn: { reserva: Date.now() }, absent: {}, matches: [match]
};
result = applyTournamentWO(tournament, {
  absentName: 'Ana / Bia', absentUids: ['ana'], scope: 'match', matches: [match],
  noSubBehavior: 'escalate', woScope: 'team', _forceNoSub: true, forceWaitlistSub: false
});
assert.equal(result.ok, true, 'motor aceita W.O. de dupla com UID singleton');
assert.equal(result.outcome, 'woApplied', 'fecha o jogo inteiro');
assert.equal(match.winner, 'Clara / Dora', 'adversário completo vence');
assert.equal(match.scoreP1, 'W.O.');
assert.equal(tournament.standbyParticipants.length, 1, 'não consome suplente');

const pair = (first, second, category = 'Fem Light') => ({
  p1Uid: first, p1Name: first, p2Uid: second, p2Name: second,
  displayName: first + ' / ' + second, category
});
const fixture = (candidates) => {
  const old = pair('ana', 'bia');
  const opponent = pair('clara', 'dora');
  const game = { id:'first', p1:'ana / bia', p2:'clara / dora', category:'Fem Light',
    team1Uids:['ana','bia'], team2Uids:['clara','dora'], team1Obj:old,
    team2Obj:opponent, team1:['ana','bia'], team2:['clara','dora'], scoreP1:0, scoreP2:0 };
  const historic = { id:'past', p1:'ana / bia', p2:'clara / dora', category:'Fem Light',
    team1Obj:structuredClone(old), team1Uids:['ana','bia'], winner:'ana / bia', scoreP1:6, scoreP2:3 };
  return { id:'T', format:'Eliminatórias Simples', participants:[old,opponent],
    standbyParticipants:candidates, waitlist:[], checkedIn:{}, absent:{}, matches:[game,historic] };
};
const decision = (t, substitute) => applyTournamentWO(t, {
  absentName:'ana / bia', absentUids:['ana','bia'], scope:'match', matches:[t.matches[0]],
  noSubBehavior:'escalate', woScope:'team', teamSubstitution:substitute,
  requireTeamSubstitution:substitute, _forceNoSub:!substitute, forceWaitlistSub:substitute
});

let t = fixture([pair('eva','flor')]);
result = decision(t, false);
assert.equal(result.outcome, 'woApplied', 'organizador pode escolher W.O. mesmo com suplente');
assert.equal(t.standbyParticipants.length, 1, 'escolha W.O. preserva fila');

t = fixture([pair('eva','flor')]);
result = decision(t, true);
assert.equal(result.outcome, 'subbed', 'organizador pode chamar dupla suplente');
assert.equal(t.matches[0].p1, 'eva / flor');
assert.deepEqual(t.matches[0].team1Uids, ['eva','flor']);
assert.equal(t.matches[0].team1Obj.p1Uid, 'eva');
assert.equal(t.matches[0].team1Obj.p2Uid, 'flor');
assert.deepEqual(t.matches[0].team1, ['eva','flor']);
assert.equal(t.participants[0].p1Uid, 'eva', 'elenco projetado acompanha troca');
assert.equal(t.standbyParticipants.length, 0, 'suplente sai da espera');
assert.equal(t.matches[1].p1, 'ana / bia', 'histórico disputado permanece');
assert.equal(result.subDetails[0].matchId, 'first');
assert.equal(result.subDetails[0].slot, 'p1');

t = fixture([]);
const beforeEmpty = structuredClone(t);
result = decision(t, true);
assert.equal(result.outcome, 'substitute-unavailable');
assert.deepEqual(t.absent, beforeEmpty.absent, 'sem suplente não marca ausência');
assert.equal(t.matches[0].winner, undefined, 'sem suplente não aplica W.O.');
assert.equal(t.matches[0].p1, beforeEmpty.matches[0].p1, 'sem suplente não troca slot');

t = fixture([pair('eva','flor','Fem Power')]);
assert.equal(decision(t,true).outcome, 'substitute-unavailable', 'categoria divergente não entra');
t = fixture([{uid:'eva',displayName:'eva'},{uid:'flor',displayName:'flor'}]);
assert.equal(decision(t,true).outcome, 'substitute-unavailable', 'dois solos não viram dupla');
t = fixture([pair('eva','flor')]);
t.matches.push({id:'already',p1:'eva / flor',p2:'outra',team1Obj:pair('eva','flor')});
assert.equal(decision(t,true).outcome, 'substitute-unavailable', 'atleta em jogo ativo não é promovida');

const mixedCandidate = {p1Uid:'eva',p1Name:'eva',p2ManualId:'manual-flor',p2Name:'flor',category:'Fem Light'};
t = fixture([mixedCandidate]);
result = decision(t,true);
assert.equal(result.outcome, 'subbed', 'dupla conta/manual também entra');
assert.equal(t.matches[0].team1Obj.p2ManualId, 'manual-flor');

t = fixture([pair('eva','flor'), pair('gina','helo')]);
t.callPolicy = 'locked';
t.waitlistOrder = ['gina / helo', 'eva / flor'];
result = decision(t,true);
assert.equal(t.matches[0].p1, 'gina / helo', 'ordem travada da fila prevalece sobre posição no array');
console.log('wo-team-choice: OK');
