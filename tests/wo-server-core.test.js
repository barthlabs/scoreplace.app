'use strict';

const assert = require('assert');
const { applyTournamentWO, setPresenceWithWOSubstitution, resolveWOSubstitutionChoice } = require('../functions-autodraw/draw-core.js');

function tournament(extra) {
  return Object.assign({
    id: 'wo-cf-test', format: 'Eliminatória Simples', woScope: 'individual',
    participants: [
      { uid: 'ana', displayName: 'Ana', name: 'Ana' },
      { uid: 'bia', displayName: 'Bia', name: 'Bia' }
    ],
    checkedIn: {}, absent: {},
    matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia', p1Uid: 'ana', p2Uid: 'bia' }]
  }, extra || {});
}

// A ponte que a callable usa deve preservar o W.O. do motor compartilhado e
// propagar a chave no mesmo objeto fresco que o write-plan receberá.
{
  const t = tournament();
  const r = applyTournamentWO(t, { absentName: 'Ana', absentUids: ['ana'], scope: 'match', noSubBehavior: 'wait', woScope: 'individual' });
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'woApplied');
  assert.equal(t.absent.ana > 0, true);
  assert.equal(t.matches[0].winner, 'Bia');
}

// Se há suplente presente, o mesmo motor troca a identidade do slot e não dá
// W.O. ao adversário. Isso prova que a CF não contém uma regra simplificada.
{
  const t = tournament({
    standbyParticipants: [{ uid: 'clara', displayName: 'Clara', name: 'Clara' }],
    checkedIn: { clara: Date.now() }
  });
  const r = applyTournamentWO(t, { absentName: 'Ana', absentUids: ['ana'], scope: 'match', noSubBehavior: 'wait', woScope: 'individual' });
  assert.equal(r.ok, true);
  assert.equal(r.outcome, 'subbed');
  assert.equal(t.matches[0].p1Uid, 'clara');
  assert.equal(t.matches[0].winner, undefined);
}

console.log('wo-server-core: OK');


// Presença posterior a um W.O. percorre o mesmo motor e substitui sem que o
// navegador tenha de editar partida, fila ou mapa de ausência.
{
  const t = tournament({
    standbyParticipants: [{ uid: 'clara', displayName: 'Clara', name: 'Clara' }],
    absent: { ana: Date.now() },
    checkedIn: {}
  });
  const at = Date.now();
  const r = setPresenceWithWOSubstitution(t, { uid: 'clara', name: 'Clara', action: 'present', at });
  assert.equal(r.ok, true);
  assert.equal(t.checkedIn.clara >= at, true);
  assert.equal(r.substitutions.ok, true);
  assert.equal(r.substitutions.subCount, 1);
  assert.equal(t.matches[0].p1Uid, 'clara');
  assert.equal(t.matches[0].winner, undefined);
}

// Retirar presença é uma intenção absoluta: em retry, não reinverte o estado e
// jamais desfaz uma substituição já decidida.
{
  const t = tournament({ checkedIn: { ana: 99 } });
  const r = setPresenceWithWOSubstitution(t, { uid: 'ana', name: 'Ana', action: 'clear' });
  assert.equal(r.ok, true);
  assert.equal(t.checkedIn.ana, undefined);
  assert.equal(r.substitutions.subCount, 0);
}


// A escolha explícita só aceita uma opção registrada na pendência e aplica a
// substituição pelo mesmo motor que a declaração inicial usa.
{
  const t = tournament({
    standbyParticipants: [{ uid: 'clara', displayName: 'Clara', name: 'Clara' }],
    absent: { ana: Date.now() },
    checkedIn: {},
    woSubChoices: [{ absentUid: 'ana', absentName: 'Ana', options: [{ uid: 'clara', name: 'Clara' }] }]
  });
  const r = resolveWOSubstitutionChoice(t, 'ana', 'clara');
  assert.equal(r.ok, true);
  assert.equal(r.subCount, 1);
  assert.equal(t.matches[0].p1Uid, 'clara');
  assert.equal(t.woSubChoices[0].resolved, true);
}

// Um UID fora das opções nunca vira uma substituição, mesmo se a tela tentar
// chamá-lo diretamente.
{
  const t = tournament({
    standbyParticipants: [{ uid: 'clara', displayName: 'Clara', name: 'Clara' }],
    absent: { ana: Date.now() },
    woSubChoices: [{ absentUid: 'ana', absentName: 'Ana', options: [{ uid: 'clara', name: 'Clara' }] }]
  });
  const r = resolveWOSubstitutionChoice(t, 'ana', 'intruso');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'sub-not-offered');
  assert.equal(t.woSubChoices[0].resolved, undefined);
}

// Declarar e reverter ausência no servidor é idempotente e preserva a chave UID.
{
  const { setTournamentWOAbsence } = require('../functions-autodraw/draw-core.js');
  const t = tournament({ checkedIn: { ana: Date.now() }, absent: {} });
  const declared = setTournamentWOAbsence(t, [{ uid: 'ana', displayName: 'Ana' }], true);
  assert.equal(declared.ok, true);
  assert.equal(t.absent.ana > 0, true);
  assert.equal(t.checkedIn.ana, undefined);
  const reverted = setTournamentWOAbsence(t, [{ uid: 'ana', displayName: 'Ana' }], false);
  assert.equal(reverted.ok, true);
  assert.equal(t.absent.ana, undefined);
}
