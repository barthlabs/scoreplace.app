// SWEEP de W.O. + INTEGRAÇÃO TARDIA (dono: "roda o sweep com W.O. e integração tardia também").
// Sorteia pelo motor canônico da CF (draw-core.drawInitial), aplica W.O. pelo motor ÚNICO real
// (window._applyWO) e integra tardios pela CF real (draw-core.integrateLateEntries), depois JOGA a
// chave inteira e exige que FECHE num campeão (sem travado, sem vaga morta). Vários formatos × N.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {}, location: { hash: '' } };
sandbox.AppStore = { tournaments: [], logAction: () => {}, sync: () => {}, isOrganizer: () => true, isCreator: () => true, currentUser: { uid: 'org' }, mutate: async (id, fn) => { const t = W._findTournamentById ? W._findTournamentById(id) : null; if (t) fn(t); return true; } };
sandbox._displayNameForUid = (u, fb) => u ? ('P_' + u) : (fb || '');
sandbox._pName = (p, fb) => { if (!p) return fb || ''; if (typeof p === 'string') return p; if (p.p1Name || p.p2Name) { const a = p.p1Name || '', b = p.p2Name || ''; if (a && b) return a + ' / ' + b; } return p.displayName || p.name || fb || ''; };
load('identity-core.js');
load('participants.js');    // _applyWO / _applyWoSubsToTournament / _declareAbsent
load('tournaments-draw.js');
const dc = require('../functions-autodraw/draw-core.js');
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
function mkIndiv(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ uid: 'u' + i, displayName: 'P' + i, name: 'P' + i, gender: (i % 2 ? 'masculino' : 'feminino') }); return a; }
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i }); return a; }
function tour(format, extra) { return Object.assign({ id: 'T', format: format, teamSize: 1, enrollmentMode: 'individual', participants: [], combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, sport: 'Beach Tennis' }, extra || {}); }

function playBracket(t) {
  let guard = 0;
  while (guard++ < 4000) {
    const all = W._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!all.length) break;
    const m = all[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (guard % 5);
    try { W._advanceWinner(t, m); } catch (e) { return { err: 'advance:' + e.message, guard }; }
  }
  const all = W._collectAllMatches(t);
  const maxR = all.length ? Math.max.apply(null, all.map(x => x.round || 0)) : 0;
  const stuck = all.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  const dead = all.filter(m => m && !m.isThirdPlace && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner && (m.round || 0) < maxR && !m.isSitOut);
  const champ = all.filter(m => m && !m.isThirdPlace && m.winner).sort((a, b) => (b.round || 0) - (a.round || 0))[0];
  return { guard, stuck: stuck.length, dead: dead.length, champ: !!champ };
}
function firstRealPlayer(t) {
  const m = (t.matches || []).find(x => x && x.p1 && x.p1 !== 'TBD' && x.p1 !== BYE && x.p2 && x.p2 !== 'TBD' && x.p2 !== BYE && !x.isThirdPlace);
  return m ? m.p1 : null;
}
function checkPlayout(label, t) {
  const pb = playBracket(t);
  if (pb.err) { ok(false, label + ' → playout CRASHOU: ' + pb.err); return; }
  ok(pb.guard < 4000, label + ' → sem loop');
  ok(pb.stuck === 0, label + ' → sem travado (' + pb.stuck + ')');
  ok(pb.dead === 0, label + ' → sem vaga morta (' + pb.dead + ')');
  ok(pb.champ, label + ' → FECHA num campeão');
}

console.log('── SWEEP W.O. + INTEGRAÇÃO TARDIA ──');
const NS = [4, 5, 6, 7, 8, 9, 11, 12, 13, 16, 17, 24, 32];

// ── A) W.O. em Eliminatória Simples — COM substituto (da espera) e SEM (adversário avança) ──
NS.forEach(N => {
  // COM substituto
  let t = tour('Eliminatórias Simples', { participants: mkIndiv(N), standbyParticipants: [{ uid: 'sub1', displayName: 'SUB1', name: 'SUB1' }] });
  let r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'W.O.+sub Elim N=' + N + ' sorteio: ' + r.reason); }
  else { const ab = firstRealPlayer(t); if (ab) { try { W._applyWO(t, { absentName: ab, scope: 'match', noSubBehavior: 'wait' }); } catch (e) { ok(false, 'W.O.+sub Elim N=' + N + ' applyWO: ' + e.message); } } checkPlayout('W.O.+sub Elim N=' + N, t); }
  // SEM substituto → escalate (adversário vence por W.O.)
  t = tour('Eliminatórias Simples', { participants: mkIndiv(N) });
  r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'W.O.-esc Elim N=' + N + ' sorteio: ' + r.reason); }
  else { const ab = firstRealPlayer(t); if (ab) { try { W._applyWO(t, { absentName: ab, scope: 'match', noSubBehavior: 'escalate' }); } catch (e) { ok(false, 'W.O.-esc Elim N=' + N + ' applyWO: ' + e.message); } } checkPlayout('W.O.-esc Elim N=' + N, t); }
});

// ── B) W.O. em DUPLAS (Eliminatória) — escalate ──
[4, 5, 6, 8, 11, 16].forEach(N => {
  const t = tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(N) });
  const r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'W.O. DUPLAS N=' + N + ' sorteio: ' + r.reason); return; }
  const ab = firstRealPlayer(t);
  if (ab) { try { W._applyWO(t, { absentName: ab, scope: 'match', noSubBehavior: 'escalate' }); } catch (e) { ok(false, 'W.O. DUPLAS N=' + N + ' applyWO: ' + e.message); } }
  checkPlayout('W.O. DUPLAS N=' + N, t);
});

// ── C) W.O. em Dupla Eliminatória — escalate ──
[4, 6, 8, 12, 16].forEach(N => {
  const t = tour('Dupla Eliminatória', { participants: mkIndiv(N) });
  const r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'W.O. DuplaElim N=' + N + ' sorteio: ' + r.reason); return; }
  const ab = firstRealPlayer(t);
  if (ab) { try { W._applyWO(t, { absentName: ab, scope: 'match', noSubBehavior: 'escalate' }); } catch (e) { ok(false, 'W.O. DuplaElim N=' + N + ' applyWO: ' + e.message); } }
  checkPlayout('W.O. DuplaElim N=' + N, t);
});

// ── D) INTEGRAÇÃO TARDIA (CF integrateLateEntries) — Elim Simples, presentes + waitlist ──
[4, 6, 8, 10, 12, 16].forEach(N => {
  // sorteia com N presentes; adiciona M tardios na espera (marcados presentes) e integra pela CF
  const t = tour('Eliminatórias Simples', { participants: mkIndiv(N), lateEnrollment: 'expand' });
  const r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'Tardia Elim N=' + N + ' sorteio: ' + r.reason); return; }
  // 3 solos tardios PRESENTES na espera
  for (let k = 1; k <= 3; k++) { const uid = 'late' + k; t.standbyParticipants.push({ uid: uid, displayName: 'L' + k, name: 'L' + k }); t.checkedIn[uid] = Date.now(); }
  let res; try { res = dc.integrateLateEntries(t, {}); } catch (e) { ok(false, 'Tardia Elim N=' + N + ' integrateLate CRASHOU: ' + e.message); return; }
  ok(res && res.ok, 'Tardia Elim N=' + N + ' integrateLate ok (' + (res && (res.extra + '+' + res.repfill)) + ')');
  checkPlayout('Tardia Elim N=' + N, t);
});

// ── E) INTEGRAÇÃO TARDIA em DUPLAS — dupla pré-formada ausente→presente entra e fecha ──
[4, 6, 8, 12].forEach(N => {
  const t = tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(N), lateEnrollment: 'expand' });
  const r = dc.drawInitial(t, {}); if (!r.ok) { ok(false, 'Tardia DUPLAS N=' + N + ' sorteio: ' + r.reason); return; }
  // 2 duplas tardias PRESENTES na espera (uma de cada vez, como no dia real)
  const D1 = { p1Uid: 'x1', p1Name: 'X1', p2Uid: 'y1', p2Name: 'Y1', displayName: 'X1 / Y1', name: 'X1 / Y1' };
  const D2 = { p1Uid: 'x2', p1Name: 'X2', p2Uid: 'y2', p2Name: 'Y2', displayName: 'X2 / Y2', name: 'X2 / Y2' };
  t.standbyParticipants.push(D1); ['x1', 'y1'].forEach(u => t.checkedIn[u] = Date.now());
  try { dc.integrateLateEntries(t, {}); } catch (e) { ok(false, 'Tardia DUPLAS N=' + N + ' int1: ' + e.message); return; }
  t.standbyParticipants.push(D2); ['x2', 'y2'].forEach(u => t.checkedIn[u] = Date.now());
  try { dc.integrateLateEntries(t, {}); } catch (e) { ok(false, 'Tardia DUPLAS N=' + N + ' int2: ' + e.message); return; }
  // as 2 duplas viraram inscritas
  const names = (t.participants || []).map(p => p.displayName || p.name);
  ok(names.indexOf('X1 / Y1') !== -1 && names.indexOf('X2 / Y2') !== -1, 'Tardia DUPLAS N=' + N + ' → as 2 duplas entraram na chave');
  checkPlayout('Tardia DUPLAS N=' + N, t);
});

console.log('\n' + (fail === 0 ? '✅ draw-sweep-wo-late: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 60).forEach(f => console.error('  ✗ ' + f)); }
if (fail > 0) process.exit(1);
