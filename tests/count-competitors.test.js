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

  const legacyProjection = [];
  for (let i = 97; i <= 128; i += 2) {
    legacyProjection.push({ p1Name: 'Jogador ' + i, p2Name: 'Jogador ' + (i + 1), isPlaceholder: true });
    legacyProjection.push({ uid: 'legacy-' + i, displayName: 'Jogador ' + i });
    legacyProjection.push({ uid: 'legacy-' + (i + 1), displayName: 'Jogador ' + (i + 1) });
  }
  const r3 = W._countCompetitors({ participants: legacyProjection, waitlist: [], standbyParticipants: [] });
  ok(r3.people === 32 && r3.teams === 16,
    'dupla + projeção legada das reservas não duplica (got ' + r3.people + '/' + r3.teams + ')');
  const structuralProjection = [
    { p1Name: 'Jogador 97', p2Name: 'Jogador 98', isPlaceholder: true },
    { uid: 'uid-97', displayName: 'Jogador 97' }, { uid: 'uid-98', displayName: 'Jogador 98' }
  ];
  const r4 = W._countCompetitors({ participants: structuralProjection, waitlist: [], standbyParticipants: [] });
  ok(r4.people === 2, 'rótulo numérico com UID estrutural também deduplica (got ' + r4.people + ')');

  // Reservas canônicas vivem fora de participants até serem materializadas,
  // mas continuam sendo inscritos iguais para o contador do card.
  const reservas = Array.from({ length: 16 }, (_, i) => ({
    manualParticipantId: 'res-' + i,
    displayName: 'Jogador ' + (97 + i),
    isPlaceholder: true,
  }));
const r5 = W._countCompetitors({
    participants: Array.from({ length: 48 }, (_, i) => ({ uid: 'p-' + i })),
    placeholderReservations: reservas,
    waitlist: [],
    standbyParticipants: [],
  });
  ok(r5.people === 64, 'reservas canônicas entram no total (got ' + r5.people + ')');

  // O resumo do Neon lê a subcoleção de inscrições, não a fotografia antiga
  // de 48 duplas. Fontes divergentes nunca podem voltar a afirmar 96/48.
  const { canonicalCounts } = require('../functions-autodraw/tournament-summary-core');
  const registrations = Array.from({ length: 128 }, (_, i) => ({
    registrationId: 'reg-' + i,
    participantKey: 'manual-' + i,
    status: 'confirmed',
    fixedPairId: 'pair-' + Math.floor(i / 2),
  }));
  const canonical = canonicalCounts(registrations, 128);
  ok(canonical.people === 128 && canonical.teams === 64,
    'resumo canônico: 128 inscrições / 64 duplas, sem depender da fotografia 96/48');
  ok(canonicalCounts(registrations.concat([{ registrationId: 'old', participantKey: 'old', status: 'withdrawn' }]), 129).people === 128,
    'inscrição retirada é histórico, não novo participante');
  let incompletePairRejected = false;
  try { canonicalCounts(registrations.slice(1), 127); } catch (_) { incompletePairRejected = true; }
  ok(incompletePairRejected, 'dupla incompleta não produz contador de resumo aparentemente válido');

  load('../firebase-db.js');
  const merged = W.FirestoreDB._mergePlaceholderReservationsIntoRoster({
    participants: [
      { p1Name: 'Jogador 01', p2Name: 'Jogador 02', p1ManualId: 'legacy-01', p2ManualId: 'legacy-02' },
      { p1Name: 'Jogador 97', p2Name: 'Jogador 98', p1ManualId: 'manual-97', p2ManualId: 'manual-98' },
    ],
    placeholderReservations: [1, 2, 97, 98].map((n) => ({
      manualParticipantId: 'reservation-' + n,
      displayName: 'Jogador ' + String(n).padStart(2, '0'),
      isPlaceholder: true,
      genericPlaceholderReservation: true,
    })),
  });
  ok(merged.participants.length === 2,
    'leitor não duplica integrantes das duplas canônicas quando reserva antiga tem outro ID');
})();

// ── OS DOIS CASOS REAIS DA CONFRA (dono, 27/jul) ──────────────────────────────
//   • SANDBOX: 103 uid + 1 fictício + 4 vagas = 108. A tela mostrava 104 —
//     exatamente as pessoas COM identidade; as 4 vagas sumiam.
//   • ORIGINAL (produção): só os 103 uid = 103. Aqui a conta NÃO pode inflar: o fix
//     das vagas não vale nada se, para consertar um lado, passar a contar a mais no
//     outro. É a contraprova do fix.
// O bloco do sandbox roda nos 5 formatos em que o app pode ter gravado os
// placeholders (o desenho mudou algumas vezes: com/sem nome, nome repetido,
// emparelhados, e o legado com uid 'jog_NN').
(function () {
  const base = [];
  let u = 0;
  for (let d = 0; d < 51; d++) base.push(uidPair('u' + (++u), 'u' + (++u)));  // 102 uids
  base.push({ p1Uid: 'u' + (++u), p2Name: 'Ana Fictícia' });                  // 103º uid + fictício
  const formatos = {
    'solos com isPlaceholder + nome': [1, 2, 3, 4].map((i) => ({ name: 'Jogador ' + i, displayName: 'Jogador ' + i, isPlaceholder: true })),
    'solos SEM nome (strip do cânone só-uid)': [1, 2, 3, 4].map(() => ({ isPlaceholder: true })),
    'nomes REPETIDOS (numeração não curada)': [1, 2, 3, 4].map(() => ({ name: 'Jogador 1', isPlaceholder: true })),
    'emparelhados em 2 duplas': [{ p1Name: 'Jogador 1', p2Name: 'Jogador 2', displayName: 'Jogador 1 / Jogador 2' }, { p1Name: 'Jogador 3', p2Name: 'Jogador 4', displayName: 'Jogador 3 / Jogador 4' }],
    'legado com uid jog_NN': [1, 2, 3, 4].map((i) => ({ uid: 'jog_0' + i, name: 'Jogador ' + i })),
  };
  Object.keys(formatos).forEach(function (k) {
    const r = W._countCompetitors({ participants: base.concat(formatos[k]), waitlist: [], standbyParticipants: [] });
    ok(r.people === 108, 'Confra SB :: ' + k + ' — 103 uid + 1 fictício + 4 vagas = 108 (got ' + r.people + ')');
  });

  // CONFRA ORIGINAL: só os 103 uid. Sem fictício e sem vaga → 103, nem um a mais.
  const so103 = [];
  let v = 0;
  for (let d = 0; d < 51; d++) so103.push(uidPair('w' + (++v), 'w' + (++v)));   // 102 em duplas
  so103.push({ uid: 'w' + (++v) });                                             // o 103º, solo e só-uid
  const rOrig = W._countCompetitors({ participants: so103, waitlist: [], standbyParticipants: [] });
  ok(rOrig.people === 103, 'Confra original :: 103 uid puros contam 103, sem inflar (got ' + rOrig.people + ')');
  ok(rOrig.teams === 51, 'Confra original :: 51 duplas (o 103º é solo) (got ' + rOrig.teams + ')');
})();

console.log('\n' + (fail === 0 ? '✅ TODOS PASSARAM' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
