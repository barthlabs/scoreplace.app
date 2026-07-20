// SORTEIO preserva a presença de quem foi pro RESTO/LISTA DE ESPERA (dono, 20/jul): "tinham 15
// presentes e 1 virou resto. a presença desse que ficou na lista de espera deve ser mantida —
// estava presente antes do sorteio, fica presente em primeiro na lista de espera."
// _clearPresenceKeepWaitlist limpa a presença de quem ENTROU na chave, mas mantém a dos que estão
// em standbyParticipants/waitlist (por uid OU nome de guest OU membros de dupla). O sort do
// painel de espera (bracket.js, modo 'present') já põe os presentes primeiro por timestamp.
const { window: W, load } = require('./headless');
load('identity-core.js');       // _participantUids
load('tournaments-draw.js');    // _clearPresenceKeepWaitlist

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// ── 16 presentes por uid; u16 vira resto → standby ──
(function () {
  const ci = {}; for (let i = 1; i <= 16; i++) ci['u' + i] = 1000 + i;
  const t = { checkedIn: ci, absent: { u16: 0 }, participants: [], standbyParticipants: [{ uid: 'u16', displayName: 'Fulano 16' }], waitlist: [] };
  W._clearPresenceKeepWaitlist(t);
  ok(t.checkedIn['u16'] === 1016, 'presença do resto (u16) MANTIDA com o timestamp original');
  ok(Object.keys(t.checkedIn).length === 1, 'só o resto fica presente (15 que entraram na chave limpos)');
  ok(t.checkedIn['u1'] == null, 'quem entrou na chave (u1) teve presença limpa');
  ok(Object.keys(t.absent).length === 0, 'absent zerado');
})();

// ── guest por NOME (sem uid) na espera ──
(function () {
  const t = { checkedIn: { 'Ronaldo': 5, 'Raquel': 6, 'a1': 7 }, absent: {}, participants: [], standbyParticipants: ['Ronaldo', 'Raquel'], waitlist: [] };
  W._clearPresenceKeepWaitlist(t);
  ok(t.checkedIn['Ronaldo'] === 5 && t.checkedIn['Raquel'] === 6, 'guests por nome na espera: presença mantida');
  ok(t.checkedIn['a1'] == null, 'quem entrou na chave (a1) limpo');
})();

// ── dupla na espera (2 uids) → ambos preservados ──
(function () {
  const t = { checkedIn: { 'lu1': 1, 'lu2': 2, 'a1': 3, 'a2': 4 }, absent: {}, participants: [], standbyParticipants: [{ p1Uid: 'lu1', p2Uid: 'lu2', displayName: 'X / Y', _lateJoin: true }], waitlist: [] };
  W._clearPresenceKeepWaitlist(t);
  ok(t.checkedIn['lu1'] === 1 && t.checkedIn['lu2'] === 2, 'dupla na espera: ambos os membros preservados por uid');
  ok(t.checkedIn['a1'] == null && t.checkedIn['a2'] == null, 'quem entrou na chave limpo');
})();

// ── ausente que virou resto NÃO ganha presença (só preserva o que JÁ existia) ──
(function () {
  const t = { checkedIn: { 'u1': 1 }, absent: {}, participants: [], standbyParticipants: [{ uid: 'u9', displayName: 'Ausente' }], waitlist: [] };
  W._clearPresenceKeepWaitlist(t);
  ok(t.checkedIn['u9'] == null, 'quem NÃO estava presente não vira presente ao ir pro resto');
  ok(Object.keys(t.checkedIn).length === 0, 'ninguém presente sobra (u1 entrou na chave)');
})();

console.log('\n' + (fail === 0 ? '✅ draw-preserve-waitlist-presence: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
