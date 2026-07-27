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

// ── VAGA (placeholder) É SEMPRE ÚNICA — nunca deduplica (bug do dono, 27/jul, Confra) ──
// Os placeholders não apareciam nos INSCRITOS. A dedup é por uid/email OU, na falta deles,
// pelo NOME — e vaga não tem identidade: sem nome a chave virava 'n:' (descartada, a vaga
// SUMIA) e com nome repetido ("Jogador 1" duas vezes, que é o que
// `_normalizePlaceholderNumbers` existe pra curar) as duas viravam a MESMA chave.
// Duas vagas são duas vagas: cada uma ocupa um lugar na chave e é uma pessoa a convidar.
(function () {
  const casos = [
    ['placeholder SEM nome não some',
      [uidPair('a', 'b'), { isPlaceholder: true }, { isPlaceholder: true }], 4, 1],
    ['placeholders com nome REPETIDO contam separado',
      [uidPair('a', 'b'), { name: 'Jogador 1', isPlaceholder: true }, { name: 'Jogador 1', isPlaceholder: true }, { name: 'Jogador 1', isPlaceholder: true }], 5, 1],
    ['placeholders nomeados normalmente',
      [uidPair('a', 'b'), { name: 'Jogador 1', displayName: 'Jogador 1', isPlaceholder: true }, { name: 'Jogador 2', displayName: 'Jogador 2', isPlaceholder: true }], 4, 1],
    ['dupla com UM lado vaga',
      [{ p1Uid: 'a1', p2Name: 'Jogador 1' }, { p1Uid: 'a2', p2Name: 'Jogador 2' }], 4, 2],
    ['dupla com os DOIS lados vaga e nomes repetidos entre elas',
      [{ p1Name: 'Jogador 1', p2Name: 'Jogador 2', displayName: 'V1' }, { p1Name: 'Jogador 1', p2Name: 'Jogador 2', displayName: 'V2' }], 4, 2],
  ];
  casos.forEach(function (c) {
    const r = W._countCompetitors({ participants: c[1], waitlist: [], standbyParticipants: [] });
    ok(r.people === c[2] && r.teams === c[3],
      'vaga :: ' + c[0] + ' — got ' + r.people + ' pessoa(s)/' + r.teams + ' time(s), esperado ' + c[2] + '/' + c[3]);
  });

  // CONTRAPROVA: pessoa REAL sem conta (fictício) continua deduplicando pelo nome — o
  // cânone é que o nome fictício É a identidade. Se isso inflar, a conta passa a mentir
  // pro outro lado ([[feedback_uid_controls_everything_name_only_ficticio]]).
  const r2 = W._countCompetitors({ participants: [{ displayName: 'Ana' }, { displayName: 'Bia' }, { displayName: 'Ana' }], waitlist: [], standbyParticipants: [] });
  ok(r2.people === 2, 'fictício :: nome real repetido continua contando 1 (got ' + r2.people + ')');
})();

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
