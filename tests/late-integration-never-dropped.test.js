/* REPRODUZ o bug do dono no torneio AO VIVO (25/jul/2026, "Torneio de Férias só Casais",
 * tour_1781996342871): o organizador marcou PRESENÇA de uma dupla depois do sorteio e o sistema
 * NÃO gerou jogo pra ela. Ela ficou presente, fora da chave, sem jogo — e nada nunca tentou de novo.
 *
 * MEDIDO no doc REAL de produção:
 *   • o MOTOR estava certo: `integrateLateEntries` rodado contra o doc coloca a dupla (placed:1).
 *   • o que faltou foi a CHAMADA: nenhum invoke de integrateLateEntries depois das presenças
 *     (checkedIn 13:12:09/13:12:10; último invoke da CF 13:11:23 — 46s ANTES).
 *
 * DUAS CAUSAS, as duas travadas aqui:
 *  (A) DISPARO ENGOLIDO — com uma chamada em voo, `_triggerLateIntegration` só fazia `return`.
 *      Nenhuma fila, nenhum retry: o pedido evaporava. `fetch` sem timeout deixava a trava
 *      "em voo" presa pra sempre (celular na quadra) e TODO toggle seguinte virava no-op.
 *  (B) COLETOR CEGO — quem foi marcado AUSENTE antes do sorteio e ficou em `t.participants`
 *      (fora da chave, sem ir pra espera) não era visto por NENHUM coletor: só a espera e a
 *      dupla FORMADA à mão entravam. Marcar presença nele nunca gerava jogo.
 */
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } console.log((c ? '  ✓ ' : '  ✗ ') + m); }

function mkPairs(n) {
  const a = [];
  for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true });
  return a;
}
function mkT(N, dupla) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false };
  if (dupla) el.duplaElim = true;
  const t = {
    id: 'LIVE', sport: 'Beach Tennis', startDate: '2026-07-25T10:00', endDate: '',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true
  };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  return t;
}
const gamesOf = (t, nm) => (W._collectAllMatches(t) || []).filter(m => m && (m.p1 === nm || m.p2 === nm));

// ── (B) COLETOR: ausente-no-sorteio que fica em participants, ao virar PRESENTE, ganha jogo ──
console.log('── ausente no sorteio + presente depois ⇒ ganha jogo (mesmo FORA da espera) ──');
[['Elim Simples', false], ['Dupla Elim', true]].forEach(([label, dupla]) => {
  // N=5/9 e não 4/8 DE PROPÓSITO: 4 e 8 são potência de 2 EXATA, onde a chave está cheia
  // e um tardio SOZINHO não entra — espera par (regra do dono, 25/jul). O que está sob
  // teste AQUI é o COLETOR enxergar o órfão de roster; o comportamento de chave cheia
  // mora em tests/late-entry-never-redraws. Fixture com folga isola a pergunta.
  [5, 9].forEach(N => {
    const t = mkT(N, dupla);
    W.AppStore.tournaments = [t];
    if (!dc.drawInitial(t, {}).ok) return;
    // dupla que ficou FORA da chave e permaneceu em `t.participants` — sem passar pela espera e
    // SEM `teamOrigins==='formada'` (foi marcada ausente antes do sorteio). Era o ponto cego:
    // nenhum coletor a enxergava.
    const NM = 'Max / Cátia';
    const d = { p1Uid: 'max', p1Name: 'Max', p2Uid: 'cat', p2Name: 'Cátia', displayName: NM, name: NM };
    t.participants.push(d);
    t.absent['max'] = 1; t.absent['cat'] = 1;
    ok(gamesOf(t, NM).length === 0, `${label} N=${N}: ausente ficou FORA da chave`);
    // organizador marca presença dos dois DEPOIS do sorteio
    delete t.absent['max']; delete t.absent['cat'];
    t.checkedIn['max'] = Date.now(); t.checkedIn['cat'] = Date.now();
    const r = dc.integrateLateEntries(t, {});
    const g = gamesOf(t, NM);
    ok(g.length === 1, `${label} N=${N}: presença pós-sorteio ⇒ 1 jogo criado (got ${g.length}, placed=${r.placed})`);
    // idempotente: chamar de novo não cria um 2º jogo
    dc.integrateLateEntries(t, {});
    ok(gamesOf(t, NM).length === 1, `${label} N=${N}: 2ª chamada NÃO duplica o jogo`);
  });
});

// ── (A) DISPARO: pedido durante uma chamada em voo é ENFILEIRADO, nunca engolido ──
console.log('\n── disparo com chamada EM VOO é enfileirado (nunca perdido) ──');
(function () {
  const t = mkT(4, true);
  W.AppStore.tournaments = [t];
  dc.drawInitial(t, {});
  t.waitlist.push({ p1Uid: 'max', p1Name: 'Max', p2Uid: 'cat', p2Name: 'Cátia', displayName: 'Max / Cátia', name: 'Max / Cátia' });

  // timers REAIS (o render-harness zera setTimeout) e CF fake controlável
  const real = { st: W.setTimeout, ct: W.clearTimeout, call: W._callIntegrateLate };
  W.setTimeout = setTimeout; W.clearTimeout = clearTimeout;
  W._findTournamentById = function () { return t; };
  W._applyCFTournament = function () {};
  let calls = 0, resolvers = [];
  W._callIntegrateLate = function () { calls++; return new Promise(res => resolvers.push(res)); };
  W._lateIntegrateInflight = {}; W._lateIntegratePending = {}; W._lateIntegrateLastSig = {}; W._lateIntegrateDebounce = {};

  W._triggerLateIntegration(t, { force: true });                 // 1ª: entra em voo
  W._triggerLateIntegration(t, { force: true });                 // 2ª: chega com a 1ª em voo
  const afterSecond = calls;
  resolvers.shift()({ data: { changed: false } });               // 1ª responde
  return new Promise(r => setTimeout(r, 30)).then(() => {
    ok(afterSecond === 1, `com uma em voo, a 2ª não dispara na hora (calls=${afterSecond})`);
    ok(calls === 2, `ao terminar a 1ª, o pedido enfileirado RODA (calls=${calls}; antes do fix ficava em 1)`);
    W.setTimeout = real.st; W.clearTimeout = real.ct; W._callIntegrateLate = real.call;
    console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passaram, ${fail} falharam`);
    fails.forEach(f => console.log('   ✗ ' + f));
    process.exit(fail === 0 ? 0 : 1);
  });
})();
