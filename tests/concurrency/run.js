/* Runner dos testes de CONCORRÊNCIA — roda DENTRO do emulador Firestore.
 *   npm run test:concurrency   (sobe o emulador via firebase emulators:exec e chama isto)
 *
 * Filosofia (memória project_concurrency_safe_saves): corrida SÓ se prova com o
 * Firestore de verdade + 2 clientes escrevendo no mesmo doc ao mesmo tempo.
 * Cada makeClient() é um app/conexão/cache independentes = 2 usuários distintos.
 *
 * Dois tipos de teste:
 *  - DIAGNÓSTICO: prova que o padrão ANTIGO (saveTournament merge-doc-inteiro)
 *    PERDE writes numa corrida. Fica VERDE (documenta a doença que justifica a cura).
 *  - ALVO: exige que o caminho CONVERTIDO (transação/delta) NÃO perca write.
 *    Fica VERMELHO até o piloto ser implementado; VERDE depois.
 */
const H = require('./emu-harness');

let pass = 0, fail = 0, pending = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a) + ')'); }

// Torneio de eliminatória com 2 semifinais INDEPENDENTES (sf1, sf2) que alimentam
// a final — modela 2 quadras terminando ao mesmo tempo, 2 lançamentos concorrentes.
function demoTournament(id) {
  return {
    id: id,
    name: 'Corrida ' + id,
    format: 'Eliminatórias Simples',
    status: 'active',
    creatorUid: 'org1',
    organizerEmail: 'org@x.com',
    participants: [
      { uid: 'uA', displayName: 'A', email: 'a@x.com' },
      { uid: 'uB', displayName: 'B', email: 'b@x.com' },
      { uid: 'uC', displayName: 'C', email: 'c@x.com' },
      { uid: 'uD', displayName: 'D', email: 'd@x.com' },
    ],
    matches: [
      { id: 'sf1', round: 1, p1: 'A', p2: 'B', nextMatchId: 'fin', nextSlot: 'p1' },
      { id: 'sf2', round: 1, p1: 'C', p2: 'D', nextMatchId: 'fin', nextSlot: 'p2' },
      { id: 'fin', round: 2, p1: 'TBD', p2: 'TBD' },
    ],
  };
}

function findMatch(t, mid) { return (t.matches || []).find(function (m) { return m.id === mid; }); }

// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO — o padrão saveTournament(merge doc inteiro) PERDE um write numa
// corrida de dois lançamentos. `matches` é UM campo-array: o merge substitui o
// array inteiro pelo último writer → o resultado do outro some.
// ─────────────────────────────────────────────────────────────────────────────
async function test_diagnostico_lostUpdate_saveTournament() {
  const idT = 'diag-' + Date.now();
  await H.seedTournament(demoTournament(idT));

  const clientA = H.makeClient();
  const clientB = H.makeClient();

  // Ambos leem o MESMO estado inicial (cópias locais divergentes a partir daqui).
  const tA = await H.readTournament(idT);
  const tB = await H.readTournament(idT);

  findMatch(tA, 'sf1').winner = 'A';
  findMatch(tA, 'sf1').scoreP1 = 6; findMatch(tA, 'sf1').scoreP2 = 3;
  findMatch(tB, 'sf2').winner = 'C';
  findMatch(tB, 'sf2').scoreP1 = 6; findMatch(tB, 'sf2').scoreP2 = 4;

  // Escrevem CONCORRENTEMENTE — cada um grava o doc inteiro via merge.
  await Promise.all([
    clientA.FirestoreDB.saveTournament(tA),
    clientB.FirestoreDB.saveTournament(tB),
  ]);

  const after = await H.readTournament(idT);
  const sf1w = findMatch(after, 'sf1').winner || null;
  const sf2w = findMatch(after, 'sf2').winner || null;
  const bothSurvived = sf1w === 'A' && sf2w === 'C';
  // Documenta a doença: com merge-doc-inteiro, PELO MENOS um write se perde.
  ok(!bothSurvived, 'DIAGNÓSTICO: saveTournament(merge) PERDE write na corrida (sf1=' + sf1w + ', sf2=' + sf2w + ')');
}

// Mutador de teste = a MESMA operação lógica de lançar um resultado (achar o
// match, setar winner/scores), só que aplicada ao estado FRESCO que a transação
// entrega. É o que _saveResultInline delega ao mutateTournament.
function resultMutator(matchId, winner, sp1, sp2) {
  return function (freshT) {
    const m = findMatch(freshT, matchId);
    if (!m) return false;
    m.winner = winner; m.scoreP1 = sp1; m.scoreP2 = sp2;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ALVO — dois mutateTournament concorrentes (o primitivo CONVERTIDO) preservam
// AMBOS os resultados. É o coração da blindagem: a transação re-lê e re-tenta em
// conflito, então nenhum write se perde.
// ─────────────────────────────────────────────────────────────────────────────
async function test_alvo_mutateTournament_noLostUpdate() {
  const clientA = H.makeClient();
  if (typeof clientA.FirestoreDB.mutateTournament !== 'function') {
    pending++;
    console.log('  ⏳ PENDENTE: FirestoreDB.mutateTournament ainda não existe');
    return;
  }
  const idT = 'alvo-' + Date.now();
  await H.seedTournament(demoTournament(idT));
  const clientB = H.makeClient();

  await Promise.all([
    clientA.FirestoreDB.mutateTournament(idT, resultMutator('sf1', 'A', 6, 3)),
    clientB.FirestoreDB.mutateTournament(idT, resultMutator('sf2', 'C', 6, 4)),
  ]);

  const after = await H.readTournament(idT);
  eq(findMatch(after, 'sf1').winner, 'A', 'ALVO: resultado de sf1 sobrevive à corrida');
  eq(findMatch(after, 'sf2').winner, 'C', 'ALVO: resultado de sf2 sobrevive à corrida');
}

// ALVO 2 — estresse: 8 mutadores concorrentes no mesmo doc, cada um setando um
// campo distinto. Todos devem sobreviver (a transação serializa via retry).
async function test_alvo_mutateTournament_stress8() {
  const c0 = H.makeClient();
  if (typeof c0.FirestoreDB.mutateTournament !== 'function') { pending++; return; }
  const idT = 'stress-' + Date.now();
  const seed = demoTournament(idT);
  // 8 "flags" independentes num mapa — cada cliente seta a sua.
  seed.raceFlags = {};
  await H.seedTournament(seed);

  const N = 8;
  const clients = Array.from({ length: N }, () => H.makeClient());
  await Promise.all(clients.map((c, i) =>
    c.FirestoreDB.mutateTournament(idT, function (freshT) {
      if (!freshT.raceFlags) freshT.raceFlags = {};
      freshT.raceFlags['w' + i] = true;
    })
  ));

  const after = await H.readTournament(idT);
  let survived = 0;
  for (let i = 0; i < N; i++) if (after.raceFlags && after.raceFlags['w' + i] === true) survived++;
  eq(survived, N, 'ALVO estresse: todos os ' + N + ' writes concorrentes sobrevivem');
}

// ─────────────────────────────────────────────────────────────────────────────
// ALVO 3 — PILOTO REAL: dois lançamentos concorrentes usando o
// _applyResultToTournament REAL (carregado de js/views/bracket-ui.js), via
// mutateTournament. Prova que a conversão de _saveResultInline não perde write E
// que o advance (vencedor → final) fica correto sob corrida.
// ─────────────────────────────────────────────────────────────────────────────
async function test_alvo_realResultMutator_race() {
  const V = require('./emu-harness-views');
  if (typeof V.applyResult !== 'function') { pending++; console.log('  ⏳ _applyResultToTournament não carregou'); return; }
  const idT = 'real-' + Date.now();
  await V.seedTournament(demoTournament(idT));

  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, function (ft) { V.applyResult(ft, 'sf1', { s1: 6, s2: 3 }); }),
    V.FirestoreDB.mutateTournament(idT, function (ft) { V.applyResult(ft, 'sf2', { s1: 4, s2: 6 }); }),
  ]);

  const after = await V.readTournament(idT);
  eq(findMatch(after, 'sf1').winner, 'A', 'PILOTO REAL: sf1 (6×3) vencedor A sobrevive à corrida');
  eq(findMatch(after, 'sf2').winner, 'D', 'PILOTO REAL: sf2 (4×6) vencedor D sobrevive à corrida');
  const fin = findMatch(after, 'fin');
  ok(fin.p1 === 'A' && fin.p2 === 'D', 'PILOTO REAL: advance preencheu a final (p1=' + fin.p1 + ', p2=' + fin.p2 + ')');
}

// ALVO 4 — caminho de PROPOSTA PENDENTE (aprovação por participante): duas
// propostas concorrentes em jogos diferentes → ambos os pendingResult sobrevivem.
async function test_alvo_pendingProposal_race() {
  const V = require('./emu-harness-views');
  const idT = 'pend-' + Date.now();
  await V.seedTournament(demoTournament(idT));
  const mut = (mid, name) => (ft) => {
    const fm = ft.matches.find((x) => x.id === mid);
    if (fm) fm.pendingResult = { proposedByName: name, winner: 'A', scoreP1: 6, scoreP2: 3 };
  };
  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, mut('sf1', 'Ana')),
    V.FirestoreDB.mutateTournament(idT, mut('sf2', 'Beto')),
  ]);
  const after = await V.readTournament(idT);
  ok(findMatch(after, 'sf1').pendingResult && findMatch(after, 'sf1').pendingResult.proposedByName === 'Ana', 'PENDENTE: proposta de sf1 sobrevive');
  ok(findMatch(after, 'sf2').pendingResult && findMatch(after, 'sf2').pendingResult.proposedByName === 'Beto', 'PENDENTE: proposta de sf2 sobrevive');
}

// ALVO 5 — SAVE #2: fecho de rodada atômico. O auto-close DEFERE o resultado do
// último jogo (não persistido); a transação de fecho re-aplica esse resultado +
// fecha a rodada. Um write concorrente (echo tardio) NÃO pode reverter o fecho.
// Modela: Suíço puro no maxRounds (fecho → status='finished'), sem depender do
// _generateNextRound. Prova que resultado-deferido + fecho + write concorrente
// coexistem sem perda.
async function test_alvo_roundClose_atomic_race() {
  const V = require('./emu-harness-views');
  if (typeof V.FirestoreDB.mutateTournament !== 'function') { pending++; return; }
  const idT = 'close-' + Date.now();
  const seed = {
    id: idT, name: 'Fecho ' + idT, format: 'Suíço Clássico',
    swissRounds: 1, currentStage: 'swiss', p2Resolution: 'bye', status: 'active',
    creatorUid: 'org1', organizerEmail: 'org@x.com',
    participants: [{ uid: 'uA', displayName: 'A' }, { uid: 'uB', displayName: 'B' }],
    // rodada 0 (última): m1 SEM vencedor — vem no resultCtx (deferido).
    rounds: [{ status: 'active', matches: [{ id: 'm1', p1: 'A', p2: 'B' }] }],
  };
  await V.seedTournament(seed);

  // Op A = fecho (aplica resultado deferido de m1 + fecha rodada). Op B = write
  // concorrente independente (simula echo tardio de outro caminho).
  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, function (ft) {
      window._applyResultToTournament(ft, 'm1', { s1: 6, s2: 3 }); // resultCtx re-aplicado
      window._applyRoundCloseToTournament(ft, 0);
    }),
    V.FirestoreDB.mutateTournament(idT, function (ft) { ft.raceFlag = 'B'; }),
  ]);

  const after = await V.readTournament(idT);
  const m1 = after.rounds[0].matches.find((x) => x.id === 'm1');
  eq(m1 && m1.winner, 'A', 'SAVE#2: resultado deferido (m1 6×3 → A) persistiu no fecho');
  eq(after.rounds[0].status, 'complete', 'SAVE#2: rodada fechada (status complete)');
  eq(after.status, 'finished', 'SAVE#2: Suíço puro encerrou');
  eq(after.raceFlag, 'B', 'SAVE#2: write concorrente NÃO foi perdido');
}

// ALVO 6 — SORTEIO INICIAL: a chave é gerada UMA vez local (shuffle) e persistida via
// DELTA (_applyDrawDeltaToTournament) sobre o fresco. Dois sub-cenários:
//  (a) sorteio + edição concorrente de OUTRO campo → ambos sobrevivem (o delta NÃO
//      clobbera o campo editado, ao contrário do merge-doc-inteiro).
//  (b) DOIS sorteios concorrentes do mesmo torneio sem-chave → guarda de idempotência:
//      o 1º cria a chave, o 2º ABORTA (não sobrescreve) — sem chave "rasgada"/duplicada.
async function test_alvo_initialDraw_deltaPreservesConcurrentEdit() {
  const V = require('./emu-harness-views');
  if (typeof V.applyDrawDelta !== 'function') { pending++; console.log('  ⏳ _applyDrawDeltaToTournament não carregou'); return; }
  const idT = 'draw-a-' + Date.now();
  // Torneio SEM chave (pré-sorteio): status 'open', sem matches/rounds.
  await V.seedTournament({
    id: idT, name: 'Sorteio ' + idT, format: 'Eliminatórias Simples', status: 'open',
    creatorUid: 'org1', organizerEmail: 'org@x.com', venue: 'Quadra Velha',
    participants: [{ uid: 'uA', displayName: 'A' }, { uid: 'uB', displayName: 'B' }],
  });
  // Delta do sorteio (o que _commitInitialDraw teria computado: status→active + matches).
  const changed = { status: 'active', _canonicalDraw: true,
    matches: [{ id: 'm1', p1: 'A', p2: 'B', phaseIndex: 0 }], currentPhaseIndex: 0 };
  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, function (ft) {
      return V.applyDrawDelta(ft, changed, [], { preHadBracket: false, newHistory: [{ date: 'x', message: 'Sorteio' }] });
    }),
    // Edição concorrente de OUTRO campo (organizador mexeu no local ao mesmo tempo).
    V.FirestoreDB.mutateTournament(idT, function (ft) { ft.venue = 'Quadra Nova'; }),
  ]);
  const after = await V.readTournament(idT);
  eq(after.status, 'active', 'SORTEIO: status virou active (chave persistiu)');
  eq((after.matches || []).length, 1, 'SORTEIO: 1 jogo persistiu');
  eq(after.venue, 'Quadra Nova', 'SORTEIO: edição concorrente do venue NÃO foi clobbada pelo delta');
}

async function test_alvo_initialDraw_idempotencyGuard() {
  const V = require('./emu-harness-views');
  if (typeof V.applyDrawDelta !== 'function') { pending++; return; }
  const idT = 'draw-b-' + Date.now();
  await V.seedTournament({
    id: idT, name: 'Duplo sorteio ' + idT, format: 'Eliminatórias Simples', status: 'open',
    creatorUid: 'org1', organizerEmail: 'org@x.com',
    participants: [{ uid: 'uA', displayName: 'A' }, { uid: 'uB', displayName: 'B' }],
  });
  // Dois organizadores clicam Sortear "juntos": deltas DIFERENTES (shuffle distinto).
  const drawX = { status: 'active', _canonicalDraw: true, _drawTag: 'X',
    matches: [{ id: 'mX', p1: 'A', p2: 'B', phaseIndex: 0 }] };
  const drawY = { status: 'active', _canonicalDraw: true, _drawTag: 'Y',
    matches: [{ id: 'mY', p1: 'B', p2: 'A', phaseIndex: 0 }] };
  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, function (ft) { return V.applyDrawDelta(ft, drawX, [], { preHadBracket: false }); }),
    V.FirestoreDB.mutateTournament(idT, function (ft) { return V.applyDrawDelta(ft, drawY, [], { preHadBracket: false }); }),
  ]);
  const after = await V.readTournament(idT);
  // EXATAMENTE um sorteio venceu: 1 jogo só (X OU Y), nunca os dois juntos (chave rasgada).
  eq((after.matches || []).length, 1, 'SORTEIO GUARDA: exatamente 1 jogo (sem chave rasgada de 2 sorteios)');
  ok(after._drawTag === 'X' || after._drawTag === 'Y', 'SORTEIO GUARDA: a chave é de UM sorteio só (tag=' + after._drawTag + ')');
}

// ALVO 7 — SAVE W.O. (Fase-B-do-W.O.): dois W.O. concorrentes em jogos diferentes,
// aplicados pelo motor PURO _applyWO REAL via mutateTournament. Prova que nenhum
// se perde E que o advance (adversário → final) fica correto sob corrida. É o
// mesmo caminho blindado do _declareAbsent (AppStore.mutate → commitTournamentTx).
async function test_alvo_wo_atomic_race() {
  const V = require('./emu-harness-views');
  if (typeof V.applyWO !== 'function') { pending++; console.log('  ⏳ _applyWO não carregou'); return; }
  const idT = 'wo-' + Date.now();
  await V.seedTournament(demoTournament(idT));
  // Op A = W.O. de A em sf1 (B vence). Op B = W.O. de C em sf2 (D vence). Concorrentes.
  await Promise.all([
    V.FirestoreDB.mutateTournament(idT, function (ft) { V.applyWO(ft, { absentName: 'A', scope: 'match', noSubBehavior: 'escalate' }); }),
    V.FirestoreDB.mutateTournament(idT, function (ft) { V.applyWO(ft, { absentName: 'C', scope: 'match', noSubBehavior: 'escalate' }); }),
  ]);
  const after = await V.readTournament(idT);
  eq(findMatch(after, 'sf1').winner, 'B', 'W.O. RACE: sf1 (A ausente) → B vence sobrevive à corrida');
  eq(findMatch(after, 'sf2').winner, 'D', 'W.O. RACE: sf2 (C ausente) → D vence sobrevive à corrida');
  eq(findMatch(after, 'sf1').wo, true, 'W.O. RACE: sf1 marcado wo=true');
  const fin = findMatch(after, 'fin');
  ok(fin.p1 === 'B' && fin.p2 === 'D', 'W.O. RACE: advance preencheu a final (p1=' + fin.p1 + ', p2=' + fin.p2 + ')');
}

// ALVO 8 — PLACAR POR JOGO EM DOC PRÓPRIO (linha 4.1, project_match_result_docs):
// cada resultado vive em tournaments/{tId}/results/{matchId}. (a) 2 resultados em
// jogos DIFERENTES concorrentes → docs distintos → ZERO contenção, ambos persistem.
// (b) 2 escritas concorrentes no MESMO jogo → transação serializa, nenhuma perdida.
// Prova que dá pra DIVIDIR (isolamento entre jogos) E MANTER a segurança (txn por jogo).
async function test_alvo_matchResult_perGameDocs() {
  const V = require('./emu-harness-views');
  if (typeof V.FirestoreDB.mutateMatchResult !== 'function') { pending++; console.log('  ⏳ mutateMatchResult não carregou'); return; }
  const idT = 'mr-' + Date.now();
  await V.seedTournament(demoTournament(idT));
  // (a) jogos DIFERENTES, concorrentes → sem contenção
  await Promise.all([
    V.FirestoreDB.mutateMatchResult(idT, 'sf1', function (r) { r.winner = 'A'; r.scoreP1 = 6; r.scoreP2 = 3; }),
    V.FirestoreDB.mutateMatchResult(idT, 'sf2', function (r) { r.winner = 'D'; r.scoreP1 = 4; r.scoreP2 = 6; }),
  ]);
  const results = await V.FirestoreDB.loadMatchResults(idT);
  eq(results.sf1 && results.sf1.winner, 'A', 'PER-GAME: resultado de sf1 persistiu (doc próprio)');
  eq(results.sf2 && results.sf2.winner, 'D', 'PER-GAME: resultado de sf2 persistiu (doc próprio, sem contenção)');
  // (b) MESMO jogo, 2 escritas concorrentes (campos diferentes) → nenhuma perdida
  await Promise.all([
    V.FirestoreDB.mutateMatchResult(idT, 'sf1', function (r) { r.confirmedByA = true; }),
    V.FirestoreDB.mutateMatchResult(idT, 'sf1', function (r) { r.confirmedByB = true; }),
  ]);
  const r2 = await V.FirestoreDB.loadMatchResults(idT);
  ok(r2.sf1 && r2.sf1.confirmedByA === true && r2.sf1.confirmedByB === true, 'PER-GAME: 2 escritas concorrentes no MESMO jogo → nenhuma perdida (txn serializa)');
  eq(r2.sf1 && r2.sf1.winner, 'A', 'PER-GAME: campo anterior (winner=A) preservado sob a corrida');
  // (c) ESPELHO COMPLETO / REFAZER (inc 3a full-mirror): seed roster + resultado,
  // depois um mutador que APAGA os campos de resultado (= _organizerResetMatch) →
  // o doc perde winner/score MAS mantém playerUids (roster intacto). Prova que o
  // dual-write remove placar velho no reset (sem stale) e não apaga o roster.
  await V.FirestoreDB.mutateMatchResult(idT, 'reset1', function (r) {
    r.playerUids = ['ua', 'ub']; r.winner = 'A'; r.scoreP1 = 6; r.scoreP2 = 2;
  });
  await V.FirestoreDB.mutateMatchResult(idT, 'reset1', function (r) {
    delete r.winner; delete r.scoreP1; delete r.scoreP2; // refazer zera o resultado
  });
  const r3 = await V.FirestoreDB.loadMatchResults(idT);
  ok(r3.reset1 && r3.reset1.winner === undefined && r3.reset1.scoreP1 === undefined, 'PER-GAME: refazer (delete) REMOVE placar velho do subdoc — sem stale');
  ok(r3.reset1 && Array.isArray(r3.reset1.playerUids) && r3.reset1.playerUids.length === 2, 'PER-GAME: roster (playerUids) sobrevive ao refazer');
  // (d) RE-SEED NO AVANÇO (inc 3a): o jogo downstream nasce com roster VAZIO no
  // sorteio (slots TBD); quando um vencedor avança, o reseed FORÇA o playerUids novo
  // preservando os demais campos. Prova: seed vazio → force playerUids → doc ganha o
  // roster sem tocar em nada mais (o reseed só mexe em playerUids).
  await V.FirestoreDB.mutateMatchResult(idT, 'final1', function (r) { r.playerUids = []; r.startedAt = 999; });
  await V.FirestoreDB.mutateMatchResult(idT, 'final1', function (r) { r.playerUids = ['uw']; }); // avanço do vencedor
  const r4 = await V.FirestoreDB.loadMatchResults(idT);
  ok(r4.final1 && Array.isArray(r4.final1.playerUids) && r4.final1.playerUids.length === 1 && r4.final1.playerUids[0] === 'uw', 'PER-GAME: reseed no avanço FORÇA playerUids do próximo jogo (TBD→vencedor)');
  eq(r4.final1 && r4.final1.startedAt, 999, 'PER-GAME: reseed do roster PRESERVA os demais campos do subdoc');
}

// ALVO 9 — FASE B: leitura ISOLADA (linha 4.1). loadMatchResult (um jogo, sem o
// torneio) + loadMyMatchResults (collectionGroup: TODOS os jogos de um uid ACROSS
// torneios numa query, SEM carregar nenhum torneio). Prova o benefício de leitura.
async function test_alvo_faseB_isolatedReads() {
  const V = require('./emu-harness-views');
  if (typeof V.FirestoreDB.loadMyMatchResults !== 'function') { pending++; console.log('  ⏳ loadMyMatchResults não carregou'); return; }
  const tA = 'fb-a-' + Date.now(), tB = 'fb-b-' + Date.now();
  // 2 torneios, subdocs com playerUids. uX joga em A/m1 e B/m1; uZ só em A/m2.
  await V.FirestoreDB.mutateMatchResult(tA, 'm1', function (r) { r.tournamentId = tA; r.playerUids = ['uX', 'uY']; r.winner = 'X'; r.updatedAt = '2026-01-03'; });
  await V.FirestoreDB.mutateMatchResult(tA, 'm2', function (r) { r.tournamentId = tA; r.playerUids = ['uZ', 'uW']; r.updatedAt = '2026-01-01'; });
  await V.FirestoreDB.mutateMatchResult(tB, 'm1', function (r) { r.tournamentId = tB; r.playerUids = ['uX', 'uK']; r.updatedAt = '2026-01-02'; });
  // (a) leitura de UM jogo isolado
  const one = await V.FirestoreDB.loadMatchResult(tA, 'm1');
  ok(one && one.winner === 'X' && one.tournamentId === tA, 'FASE B: loadMatchResult lê um jogo isolado (sem torneio)');
  const none = await V.FirestoreDB.loadMatchResult(tA, 'inexistente');
  ok(none === null, 'FASE B: loadMatchResult de jogo inexistente → null');
  // (b) collectionGroup: todos os jogos de uX ACROSS torneios, ordenado por updatedAt desc
  const mine = await V.FirestoreDB.loadMyMatchResults('uX');
  ok(mine.length === 2, 'FASE B: loadMyMatchResults(uX) → 2 jogos (A/m1 + B/m1) across torneios (got ' + mine.length + ')');
  const tids = mine.map(function (x) { return x.tournamentId; }).sort();
  ok(tids[0] === tA && tids[1] === tB, 'FASE B: jogos vêm dos DOIS torneios (A e B), sem carregar torneio');
  ok(mine[0].updatedAt >= mine[1].updatedAt, 'FASE B: ordenado por updatedAt desc (mais recente primeiro)');
  const zed = await V.FirestoreDB.loadMyMatchResults('uZ');
  ok(zed.length === 1 && zed[0].tournamentId === tA, 'FASE B: uZ só tem 1 jogo (A/m2) — filtro por uid correto');
}

(async function main() {
  // window global usado pelos mutators do teste de views (emu-harness-views seta global.window=global)
  const suites = [
    ['diagnóstico lost-update (saveTournament merge)', test_diagnostico_lostUpdate_saveTournament],
    ['alvo mutateTournament sem lost-update', test_alvo_mutateTournament_noLostUpdate],
    ['alvo mutateTournament estresse 8 clientes', test_alvo_mutateTournament_stress8],
    ['alvo PILOTO REAL _applyResultToTournament sob corrida', test_alvo_realResultMutator_race],
    ['alvo proposta pendente sob corrida', test_alvo_pendingProposal_race],
    ['alvo SAVE#2 fecho de rodada atômico sob corrida', test_alvo_roundClose_atomic_race],
    ['alvo SORTEIO INICIAL delta preserva edição concorrente', test_alvo_initialDraw_deltaPreservesConcurrentEdit],
    ['alvo SORTEIO INICIAL guarda de idempotência (duplo sorteio)', test_alvo_initialDraw_idempotencyGuard],
    ['alvo SAVE W.O. atômico sob corrida (_applyWO REAL)', test_alvo_wo_atomic_race],
    ['alvo PLACAR POR JOGO em doc próprio (isolamento + txn)', test_alvo_matchResult_perGameDocs],
    ['alvo FASE B leitura isolada (loadMatchResult + collectionGroup)', test_alvo_faseB_isolatedReads],
  ];
  for (const [name, fn] of suites) {
    console.log('──────────── ' + name + ' ────────────');
    try { await fn(); }
    catch (e) { fail++; console.error('  ✗ EXCEÇÃO em "' + name + '": ' + (e && e.stack || e)); }
  }
  console.log('════════════════════════════════════════');
  console.log((fail === 0 ? '✅' : '❌') + ' concorrência: ' + pass + ' ok, ' + fail + ' falharam, ' + pending + ' pendentes');
  console.log('════════════════════════════════════════');
  process.exit(fail ? 1 : 0);
})();
