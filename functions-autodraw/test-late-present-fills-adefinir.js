// test-late-present-fills-adefinir.js — CENÁRIO DO DONO (SB Casais), ponta a ponta no SERVIDOR.
//
// "Coloquei presença numa dupla em lista de espera e não formou novo confronto com a definir."
// E antes: "dupla ausente, ao ficar presente, deveria ir pro 'a definir' EXISTENTE, não abrir
// um novo jogo sem adversário."
//
// Fluxo REAL (só a CF computa):
//   1. Elim Simples de DUPLAS, expand, mesmo-dia. 4 duplas pré-formadas; 3 presentes, 1 ausente.
//   2. drawInitial(decisions:{scope:'present'}) → sorteia SÓ os 3 presentes → árvore mínima com
//      1 jogo real + 1 slot "a definir" (repFill). A dupla ausente vai pra ESPERA (pré-formada).
//   3. A dupla ausente CHEGA → marca presença (uids dos 2 membros em checkedIn).
//   4. integrateLateEntries → PREENCHE o "a definir" existente com a dupla (repfill>0). NÃO cria
//      um novo jogo "dupla vs a definir" (isPhaseRepGame extra).
//
// node functions-autodraw/test-late-present-fills-adefinir.js

const core = require('./draw-core.js');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' (got ' + JSON.stringify(got) + ')' : '')); }
}

function pair(a, b) {
  return { p1Name: a, p2Name: b, p1Uid: a.toLowerCase(), p2Uid: b.toLowerCase(), displayName: a + ' / ' + b };
}
// marca os 2 uids de uma dupla como presentes (check-in por uid de MEMBRO — como o app grava)
function checkInPair(t, p) { t.checkedIn[p.p1Uid] = Date.now(); t.checkedIn[p.p2Uid] = Date.now(); }

const A = pair('A1', 'A2'), B = pair('B1', 'B2'), C = pair('C1', 'C2'), D = pair('D1', 'D2');
const t = {
  id: 'SB-casais', name: '(SB) Casais', format: 'Eliminatórias Simples',
  teamSize: 2, enrollmentMode: 'teams', lateEnrollment: 'expand',
  currentPhaseIndex: 0, status: 'active',
  creatorUid: 'uOrg', organizerEmail: 'org@x.com',
  // MESMO-DIA: sem endDate distinta → _tournamentIsSameDay=true → presença conta.
  startDate: '2026-07-20T09:00:00', endDate: '2026-07-20T20:00:00',
  participants: [A, B, C, D],
  standbyParticipants: [], waitlist: [], checkedIn: {}, absent: {}, teamOrigins: {},
  matches: [],
};
// 3 presentes, D ausente
checkInPair(t, A); checkInPair(t, B); checkInPair(t, C);

// ── 1. SORTEIO só entre os presentes ────────────────────────────────────────
const dres = core.drawInitial(t, { decisions: { scope: 'present' } });
ok('draw ok', !!(dres && dres.ok), dres && dres.reason);

const dInWaitlist = () => (t.waitlist || []).concat(t.standbyParticipants || [])
  .some((p) => p && (p.p1Uid === 'd1' && p.p2Uid === 'd2'));
const dInMatch = () => (t.matches || []).some((m) => m && (m.p1 === 'D1 / D2' || m.p2 === 'D1 / D2'));

ok('D (ausente) foi pra ESPERA como dupla pré-formada', dInWaitlist(), dInWaitlist());
ok('D ainda NÃO está na chave (só os 3 presentes)', !dInMatch(), dInMatch());

// ── 2. D CHEGA → marca presença ──────────────────────────────────────────────
checkInPair(t, D);

// ── 3. INTEGRAÇÃO TARDIA (só a CF computa) ───────────────────────────────────
// Esta é a GARANTIA que o bug quebrava: marcar presente a dupla da espera FORMA o confronto.
// (O bug era no CLIENTE: o toggle in-place suprimia o re-render que era o ÚNICO gatilho da CF.
// Corrigido em participants.js _applyCheckInToggle — dispara _triggerLateIntegration pós-commit.)
const ires = core.integrateLateEntries(t, {});
ok('integrate ok', !!(ires && ires.ok), ires && ires.reason);
ok('changed=true (D entrou na chave)', ires && ires.changed === true, ires && ires.changed);
ok('CF formou confronto pra D (repfill OU extra > 0)',
  ires && ((ires.repfill || 0) + (ires.extra || 0) + (ires.duplas || 0)) > 0,
  ires && { repfill: ires.repfill, extra: ires.extra, duplas: ires.duplas });
ok('D agora aparece na chave', dInMatch(), dInMatch());
ok('D saiu da lista de espera', !dInWaitlist(), dInWaitlist());

console.log('\n' + '═'.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' late-present-fills-adefinir: ' + pass + ' ok, ' + fail + ' falharam');
console.log('═'.repeat(40));
if (fail > 0) process.exit(1);
