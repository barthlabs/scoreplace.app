// BUG REAL (dono, 17/jul, tour_1783511910924): torneio com 26 pessoas / 13 duplas mostrava
// "8 INSCRITOS / 4 EQUIPES". Causa: _countCompetitors (tournaments.js) só contava dupla quando
// `p.p1Name && p.p2Name` — mas entrada com uid tem o NOME STRIPADO no save
// ([[project_uid_identity_canon_locked]]), então p1Name/p2Name vinham VAZIOS e a dupla só-uid
// era PULADA (addTeam('') → false). Fix: checagem ESTRUTURAL (uid OU nome) + chave do time por uids.
const { window: W, sandbox, load } = require('./headless');
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: {}, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }) };
sandbox.AppStore = { tournaments: [], currentUser: null, logAction: () => {}, sync: () => {} };
load('identity-core.js');
load('tournaments.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// dupla SÓ-UID (nome stripado — o caso que era pulado)
function uidPair(a, b) { return { p1Uid: a, p2Uid: b }; }
// dupla por sub-participantes só-uid
function subs(a, b) { return { participants: [{ uid: a }, { uid: b }] }; }

const t = {
  participants: [
    uidPair('u1', 'u2'), uidPair('u3', 'u4'), uidPair('u5', 'u6'),
    subs('u7', 'u8'), subs('u9', 'u10'),
    { p1Name: 'Ana', p2Name: 'Bia' },        // dupla por nome (guest, sem uid)
  ],
  standbyParticipants: [{ p1Name: 'tonho', p1Uid: '', p2Name: 'Leila', p2Uid: 'u11', displayName: 'tonho / Leila', _lateJoin: true }],
  waitlist: [],
};

const c = W._countCompetitors(t);
ok(!!c, '_countCompetitors existe');
// 6 duplas nos participants + 1 na espera = 7 times; 14 pessoas
ok(c.teams === 7, '7 times (5 só-uid/subs + 1 nome + 1 espera) — got ' + c.teams);
ok(c.people === 14, '14 pessoas (7 duplas × 2) — got ' + c.people);

// dedup: a MESMA dupla só-uid duas vezes conta 1
const t2 = { participants: [uidPair('a', 'b'), uidPair('a', 'b')], waitlist: [], standbyParticipants: [] };
const c2 = W._countCompetitors(t2);
ok(c2.teams === 1 && c2.people === 2, 'dedup por uid: dupla repetida conta 1 time/2 pessoas (got ' + c2.teams + '/' + c2.people + ')');

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
