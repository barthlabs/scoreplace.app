'use strict';
// L7: presença é uma intenção server-owned. O card não altera os mapas locais.
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('✗ ' + m); } }
function tournament(absent) {
  return { id: 'PRES', participants: [{ uid: 'u1', displayName: 'Fulano', name: 'Fulano' }],
    checkedIn: {}, absent: absent ? { u9: 1 } : {}, checkedInConfirmed: {}, matches: [] };
}
function prepare(t) {
  const calls = []; let mutates = 0;
  W.AppStore.tournaments = [t];
  W.AppStore.mutate = () => { mutates++; return Promise.resolve(); };
  W.FirestoreDB = {
    setTournamentPresence(...args) { calls.push(['field', args]); return Promise.resolve({ ok: true }); },
    _callFn(...args) { calls.push(['wo', args]); return Promise.resolve({ ok: true }); }
  };
  W._presenceBusyUntil = () => {};
  W._reRenderParticipantsStable = () => {};
  return { calls, get mutates() { return mutates; } };
}
console.log('── presença só despacha a Function ──');
{
  const t = tournament(false), r = prepare(t);
  W._applyCheckInToggle('PRES', 'Fulano', 'u1');
  ok(r.calls.length === 1 && r.calls[0][0] === 'field', 'sem W.O. usa a intenção estreita de presença');
  ok(r.calls[0][1][1] === 'u1' && r.calls[0][1][2] === 'present', 'payload leva UID e ação absoluta');
  ok(r.mutates === 0, 'não há fallback AppStore.mutate');
  ok(Object.keys(t.checkedIn).length === 0, 'não existe marcação otimista no mapa local');
}
{
  const t = tournament(true), r = prepare(t);
  W._applyCheckInToggle('PRES', 'Fulano', 'u1');
  ok(r.calls.length === 1 && r.calls[0][0] === 'wo', 'com W.O. despacha a Function transacional');
  ok(r.calls[0][1][0] === 'setTournamentPresenceWithWOSubstitution', 'a intenção usa o motor server-side');
  ok(r.mutates === 0, 'W.O. também não muta a fotografia local');
}
console.log((fail ? '❌ ' : '✅ ') + 'presence-field-write: ' + pass + ' asserts');
process.exit(fail ? 1 : 0);
