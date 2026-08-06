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
  const sobra = (t.monarchWaitlist._default_ || []);
  ok(sobra[0] === 'Renato Oshima' && sobra[1] === 'Vini',
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
  ok(naFem.indexOf('danielacsimao') !== -1, 'a Fem D vai pra fila Fem D');
  ok(nomesDoGrupoNovo(t).length === 0, 'e nenhum grupo nasce misturando categorias que a rodada separa');
});

// ── 5. NÃO PODE REGREDIR: sem 4 na fila, nada acontece ──────────────────────────
sec(function () {
  const t = novoT({ standbyParticipants: FILA.slice(0, 3), monarchWaitlist: {} });
  ok(win._expandMonarchFromWaitlist(t) === 0, '3 pessoas na fila não formam grupo');
  ok(nomesDoGrupoNovo(t).length === 0, 'e a rodada continua com o grupo que já tinha');
});

console.log((fail === 0 ? '✅' : '❌') + ' espera-forma-grupo-por-ordem: ' + pass + ' asserções, ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);
