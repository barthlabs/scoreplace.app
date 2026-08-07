/* A LISTA DE ESPERA FORMA GRUPO — E POR ORDEM DE FILA
 * node tests/espera-forma-grupo-por-ordem.test.js
 *
 * BUG REAL (dono, 06/ago/2026, Confra): 6 pessoas na espera — 3 homens e 3 mulheres, TODAS
 * com gênero no perfil — e NENHUM grupo se formava, tendo a proporção 25/75 travada
 * (1 homem + 3 mulheres) exatamente UMA divisão possível. Palavras dele: _"temos 3 mulheres
 * e 3 homens na lista de espera. porque nao formou jogo? […] deveria ter formado novo grupo
 * com paulo oriente, danielacsimao, carol capucho e nádia"_ — e, sobre o critério:
 * _"nao existe categoria nesse torneio. categoria unica sem qualquer divisao"_,
 * _"a unica trava é a proporcao"_, _"é por ordem da fila. quem entrou primeiro entra primeiro"_.
 *
 * DUAS CAUSAS SOMADAS, as duas MEDIDAS rodando o motor real contra o doc real:
 *  (1) a ponte enfileirava cada pessoa na fila da categoria gravada na INSCRIÇÃO dela
 *      ("Masc C" / "Fem D" / nenhuma) — rótulo de habilidade, não divisão do torneio. Os 28
 *      grupos e os 87 jogos da rodada estão TODOS sem categoria. A fila partia em
 *      Masc_C:3 · _default_:2 · Fem_D:1 e nenhuma chegava aos 4 exigidos.
 *  (2) mesmo com 4 numa categoria, `_tryFormMonarchWaitlistGroups` procura a coluna da
 *      rodada cuja categoria BATE — com a rodada em `null`, formar pra "Masc C" nunca
 *      acharia coluna e voltaria 0.
 *
 * E a ordem: o motor embaralhava a fila (`_plainShuffle`), então a única vaga masculina
 * caía num homem qualquer — no dado real, no SEGUNDO da fila, deixando o primeiro esperando.
 *
 * O fixture é o RECORTE do doc real (tour_1780009816637): a fila de 6 com as categorias
 * exatamente como estão gravadas, e a rodada sem categoria.
 */
const path = require('path');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function sec(fn) { try { fn(); } catch (e) { fail++; console.error('  ✗ seção estourou:', e && e.message); } }

require(path.join(__dirname, '..', 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

// Fila REAL do Confra: 3 homens, 3 mulheres, categorias de inscrição divergentes entre si
// e a rodada SEM categoria nenhuma.
const FILA = [
  { uid: 'u_paulo',  displayName: 'Paulo Oriente',          gender: 'masculino', category: 'Masc C' },
  { uid: 'u_renato', displayName: 'Renato Oshima',          gender: 'masculino', category: 'Masc C' },
  { uid: 'u_vini',   displayName: 'Vini',                   gender: 'masculino', category: 'Masc C' },
  { uid: 'u_dani',   displayName: 'danielacsimao',          gender: 'feminino',  category: 'Fem D' },
  { uid: 'u_carol',  displayName: 'Carol Capucho',          gender: 'feminino' },
  { uid: 'u_nadia',  displayName: 'Nádia Santiago Lazarin', gender: 'feminino' },
];

function novoT(extra) {
  const t = {
    id: 'tour_confra', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    lateEnrollment: 'expand', wlGroupBalance: 'equilibrado', genderRatio: '25/75',
    startDate: '2026-08-02T19:00', endDate: '2026-08-31T23:00',
    participants: [], checkedIn: {}, absent: {}, matches: [], groups: [],
    // um grupo já formado, SEM categoria — como no doc real
    rounds: [{ round: 1, roundIndex: 0,
      monarchGroups: [{ gi: 0, players: ['A', 'B', 'C', 'D'], playersUids: ['ua', 'ub', 'uc', 'ud'] }],
      matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', round: 1 }] }],
    standbyParticipants: JSON.parse(JSON.stringify(FILA)),
    waitlist: [], monarchWaitlist: { Masc_C: ['Renato Oshima'], _default_: [] },
  };
  Object.keys(extra || {}).forEach((k) => { t[k] = extra[k]; });
  return t;
}
const nomesDoGrupoNovo = (t) => {
  const gs = t.rounds[0].monarchGroups;
  return gs.length > 1 ? (gs[gs.length - 1].players || []) : [];
};

// ── 1. O BUG: com a rodada sem categoria, a fila NÃO pode se partir ──────────────
sec(function () {
  const t = novoT();
  const formados = win._expandMonarchFromWaitlist(t);
  ok(formados === 1, 'tem que formar exatamente 1 grupo (3M+3F com 25/75 travada), formou ' + formados);
  const g = nomesDoGrupoNovo(t);
  ok(g.length === 4, 'o grupo novo tem 4 pessoas, tem ' + g.length);
  // a fila não pode ficar espalhada por categorias que a rodada não usa
  const chaves = Object.keys(t.monarchWaitlist).filter((k) => (t.monarchWaitlist[k] || []).length);
  ok(chaves.length <= 1, 'a fila não fica partida em várias categorias, ficou em: ' + chaves.join(', '));
  ok(!(t.monarchWaitlist.Fem_D || []).length, 'ninguém sobra numa fila "Fem_D" que a rodada não usa');
});

// ── 2. ORDEM DA FILA: quem entrou primeiro entra primeiro ───────────────────────
sec(function () {
  const t = novoT();
  win._expandMonarchFromWaitlist(t);
  const g = nomesDoGrupoNovo(t);
  ok(g.indexOf('Paulo Oriente') !== -1, 'o PRIMEIRO da fila (Paulo) entra — não um homem sorteado; grupo: ' + g.join(' · '));
  ok(g.indexOf('Renato Oshima') === -1 && g.indexOf('Vini') === -1,
     'os outros dois homens continuam esperando (só 1 vaga masculina na proporção)');
  ['danielacsimao', 'Carol Capucho', 'Nádia Santiago Lazarin'].forEach(function (n) {
    ok(g.indexOf(n) !== -1, 'a mulher "' + n + '" entra (as 3 cabem)');
  });
  // ⚠️ REVISADA na v1.7.61 — o CONTRATO da fila mudou, o invariante NÃO. Antes a fila
  // guardava NOMES; agora guarda CHAVES (uid de quem tem conta, nome só de quem não tem),
  // porque a entrada da espera é strippada e o nome dela resolvia pro rótulo-fantasma
  // "Jogador sem perfil (XXXX)" — que travava TODA formação em produção. O que esta
  // asserção defende — a sobra sai na ORDEM DE CHEGADA, Renato antes de Vini — continua
  // travado; só se compara pela identidade certa.
  const sobra = (t.monarchWaitlist._default_ || []);
  ok(sobra[0] === 'u_renato' && sobra[1] === 'u_vini',
     'a sobra mantém a ordem de chegada (Renato, depois Vini), ficou: ' + sobra.join(', '));
});

// ── 3. A PROPORÇÃO É A ÚNICA TRAVA — e ela é respeitada de verdade ───────────────
sec(function () {
  const t = novoT();
  win._expandMonarchFromWaitlist(t);
  const g = nomesDoGrupoNovo(t);
  const homens = g.filter((n) => /Paulo|Renato|Vini/.test(n)).length;
  ok(homens === 1, 'o grupo fecha com exatamente 1 homem (25/75 travada), fechou com ' + homens);

  // 4 homens e nenhuma mulher: com a proporção travada NÃO pode nascer grupo
  const t2 = novoT({ standbyParticipants: [
    { uid: 'h1', displayName: 'H1', gender: 'masculino' }, { uid: 'h2', displayName: 'H2', gender: 'masculino' },
    { uid: 'h3', displayName: 'H3', gender: 'masculino' }, { uid: 'h4', displayName: 'H4', gender: 'masculino' },
  ], monarchWaitlist: {} });
  ok(win._expandMonarchFromWaitlist(t2) === 0, '4 homens NÃO formam grupo com a proporção travada');

  // destravada, o mesmo pool forma
  const t3 = novoT({ standbyParticipants: [
    { uid: 'h1', displayName: 'H1', gender: 'masculino' }, { uid: 'h2', displayName: 'H2', gender: 'masculino' },
    { uid: 'h3', displayName: 'H3', gender: 'masculino' }, { uid: 'h4', displayName: 'H4', gender: 'masculino' },
  ], monarchWaitlist: {}, wlGroupBalance: 'livre' });
  ok(win._expandMonarchFromWaitlist(t3) === 1, 'com a proporção DESTRAVADA os mesmos 4 formam');
});

// ── 4. TORNEIO SEGMENTADO DE VERDADE: aí a categoria volta a valer ───────────────
sec(function () {
  // a rodada tem DUAS categorias → a categoria da inscrição governa a fila (é divisão real)
  const t = novoT({
    rounds: [{ round: 1, roundIndex: 0,
      monarchGroups: [{ gi: 0, players: ['A', 'B', 'C', 'D'], category: 'Fem D' }],
      matches: [{ id: 'm1', p1: 'A / B', p2: 'C / D', round: 1, category: 'Fem D' },
                { id: 'm2', p1: 'E / F', p2: 'G / H', round: 1, category: 'Masc C' }] }],
    monarchWaitlist: {},
  });
  win._expandMonarchFromWaitlist(t);
  const naMasc = (t.monarchWaitlist.Masc_C || []);
  const naFem = (t.monarchWaitlist.Fem_D || []);
  ok(naMasc.length === 3, 'os 3 homens vão pra fila Masc C (a rodada separa de verdade), foram ' + naMasc.length);
  // ⚠️ REVISADA na v1.7.61 pelo mesmo motivo da seção 2: a fila guarda CHAVE, não nome.
  // O invariante — a Fem D cai na fila Fem D quando a rodada separa DE VERDADE — segue igual.
  ok(naFem.indexOf('u_dani') !== -1, 'a Fem D vai pra fila Fem D');
  ok(nomesDoGrupoNovo(t).length === 0, 'e nenhum grupo nasce misturando categorias que a rodada separa');
});

// ── 5. NÃO PODE REGREDIR: sem 4 na fila, nada acontece ──────────────────────────
sec(function () {
  const t = novoT({ standbyParticipants: FILA.slice(0, 3), monarchWaitlist: {} });
  ok(win._expandMonarchFromWaitlist(t) === 0, '3 pessoas na fila não formam grupo');
  ok(nomesDoGrupoNovo(t).length === 0, 'e a rodada continua com o grupo que já tinha');
});

// ── 6. O DADO REAL: entrada STRIPPADA (só uid) — o caso que quebrou em produção ──
// ⚠️ O fixture das seções acima dá `displayName` E `gender` a TODO MUNDO da fila. O doc
// real NÃO TEM NENHUM DOS DOIS: desde a v1.3.52 a entrada com uid é strippada, e o gênero
// vem do perfil. Era isso que fazia a suíte passar verde enquanto a produção não formava
// grupo nenhum — a segunda vez que um fixture generoso demais esconde ESTE mesmo bug (a
// primeira foi `grupo-espera-max-1-homem`, corrigida na v1.7.16).
//
// MEDIDO no Confra (07/ago/2026) rodando o motor REAL contra o doc REAL: `_pName` da
// entrada devolvia "Jogador sem perfil (jSNA)", esse rótulo ia pra fila, o gênero não
// resolvia por ele e o resultado era 0 grupos — com a fila poluída de fantasmas.
sec(function () {
  // exatamente a forma do banco: uid + addedAt + flags. Sem displayName. Sem gender.
  const CRU = [
    { uid: 'u_vini',  addedAt: '2026-08-04T14:25:17.360Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_vane',  addedAt: '2026-08-06T14:54:10.766Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_debo',  addedAt: '2026-08-06T14:57:39.201Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_fabi',  addedAt: '2026-08-06T18:19:23.087Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_cris',  addedAt: '2026-08-06T23:21:36.000Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_paul',  addedAt: '2026-08-06T23:33:53.787Z', ligaActive: true, selfEnrolled: true },
    { uid: 'u_andr',  addedAt: '2026-08-07T03:33:38.930Z', ligaActive: true, selfEnrolled: true },
  ];
  // o nome VIVO vem do perfil por uid — é o que a CF injeta em _profileNameByUid.
  const NOMES = { u_vini: 'Vini', u_vane: 'Vanessa Kaufmann', u_debo: 'Debora Castello',
                  u_fabi: 'Fabio Simao', u_cris: 'Cristina Arvate', u_paul: 'Paula Vasconcelos',
                  u_andr: 'ANDREYA NOVAZZI' };
  const GEN = { u_vini: 'masculino', u_fabi: 'masculino', u_vane: 'feminino', u_debo: 'feminino',
                u_cris: 'feminino', u_paul: 'feminino', u_andr: 'feminino' };
  const antes = win._profileNameByUid;
  win._profileNameByUid = NOMES;
  // o gênero a CF escreve na ENTRADA (_enrichParticipantsFromProfiles), por uid
  const fila = CRU.map((e) => Object.assign({}, e, { gender: GEN[e.uid] }));
  const t = novoT({ standbyParticipants: fila, monarchWaitlist: {} });

  // a fila que o motor enxerga são UIDs, na ordem de chegada — nunca rótulo-fantasma
  const vista = win._getMonarchWaitlist(t, null);
  ok(vista.length === 0, 'fila monarch começa vazia (a ponte é quem a preenche), veio ' + vista.length);

  const formados = win._expandMonarchFromWaitlist(t);
  ok(formados === 1, 'forma 1 grupo mesmo com a entrada STRIPPADA (era 0 antes), formou ' + formados);

  const g = nomesDoGrupoNovo(t);
  const gu = (t.rounds[0].monarchGroups[t.rounds[0].monarchGroups.length - 1] || {}).playersUids || [];
  ok(gu.join(',') === 'u_vini,u_vane,u_debo,u_cris',
     'o grupo é 1 homem + as 3 primeiras mulheres da fila, POR UID; veio: ' + gu.join(','));
  ok(gu.every(Boolean) && gu.length === 4, 'nenhum uid nulo no grupo (o defeito do R1 Grupo B2)');
  ok(g.join(',') === 'Vini,Vanessa Kaufmann,Debora Castello,Cristina Arvate',
     'os NOMES saem do perfil vivo, nunca do rótulo-fantasma; veio: ' + g.join(','));
  ok(g.every((n) => String(n).indexOf('Jogador sem perfil') === -1),
     'nenhum "Jogador sem perfil" no grupo');

  // a sobra segue a ordem de chegada, por uid
  const sobra = win._getMonarchWaitlist(t, null);
  ok(sobra.join(',') === 'u_fabi,u_paul,u_andr',
     'a sobra fica na ordem de chegada (Fabio, Paula, Andreya), veio: ' + sobra.join(','));
  ok(Object.keys(t.monarchWaitlist).every((k) =>
       (t.monarchWaitlist[k] || []).every((x) => String(x).indexOf('Jogador sem perfil') === -1)),
     'a fila persistida não guarda rótulo-fantasma');

  // quem entrou no grupo vira INSCRITO e SAI da espera — nunca nos dois
  const inscritos = (t.participants || []).map((p) => p && p.uid).filter(Boolean);
  ok(['u_vini', 'u_vane', 'u_debo', 'u_cris'].every((u) => inscritos.indexOf(u) !== -1),
     'os 4 que entraram viraram inscritos');
  ok((t.standbyParticipants || []).map((p) => p.uid).join(',') === 'u_fabi,u_paul,u_andr',
     'e saíram da espera (está na chave XOR na espera)');

  // FANTASMA GRAVADO pela versão anterior tem que ser descartado na leitura
  const t2 = novoT({ standbyParticipants: fila.slice(0, 4),
                     monarchWaitlist: { _default_: ['Jogador sem perfil (u_vi)', 'u_vini', 'Vanessa Kaufmann'] } });
  const lida = win._getMonarchWaitlist(t2, null);
  ok(lida.indexOf('Jogador sem perfil (u_vi)') === -1, 'o rótulo-fantasma gravado é descartado na leitura');
  ok(lida.indexOf('u_vini') !== -1, 'o uid gravado é mantido');
  ok(lida.indexOf('u_vane') !== -1, 'o NOME legado de quem tem conta é migrado pro uid dela');
  ok(lida.length === new Set(lida).size, 'e ninguém aparece duas vezes');

  win._profileNameByUid = antes;
});

// ── 7. A RESSALVA DO DONO: sem uid, o nome É a identidade ───────────────────────
// _"é sempre por uid tudo, mas se o usuário digitar participantes sem uid aí tem que
// considerar por nome apenas esses"_ — o informal que o organizador digitou à mão não tem
// conta, então o nome dele é a única identidade que existe e tem que continuar valendo.
sec(function () {
  const antes = win._profileNameByUid;
  win._profileNameByUid = { u_a: 'Com Conta A', u_b: 'Com Conta B', u_c: 'Com Conta C' };
  const fila = [
    { uid: 'u_a', gender: 'masculino' },
    { uid: 'u_b', gender: 'feminino' },
    { uid: 'u_c', gender: 'feminino' },
    { displayName: 'Convidada Sem Conta', gender: 'feminino' },   // digitada à mão
  ];
  const t = novoT({ standbyParticipants: fila, monarchWaitlist: {} });
  ok(win._wlKey(fila[0]) === 'u_a', 'quem tem uid é identificado pelo uid');
  ok(win._wlKey(fila[3]) === 'Convidada Sem Conta', 'quem NÃO tem uid é identificado pelo nome');
  const formados = win._expandMonarchFromWaitlist(t);
  ok(formados === 1, 'o grupo fecha misturando quem tem conta e quem não tem, formou ' + formados);
  const g = nomesDoGrupoNovo(t);
  ok(g.indexOf('Convidada Sem Conta') !== -1, 'a convidada sem conta entra no grupo pelo nome dela');
  ok((t.standbyParticipants || []).length === 0, 'e sai da espera junto com os outros');
  win._profileNameByUid = antes;
});

console.log((fail === 0 ? '✅' : '❌') + ' espera-forma-grupo-por-ordem: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
