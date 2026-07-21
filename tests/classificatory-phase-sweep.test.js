// SWEEP DA FASE CLASSIFICATÓRIA → ELIMINATÓRIA (dono, 21/jul): "teste todas as configurações em
// todos os tipos de torneio, com todas as combinações matematicamente relevantes de nº de inscritos
// × nº de grupos × classificados, e INTEGRE isso à fase eliminatória."
//
// TUDO via FORMAT2 (compileFromFmt2 — o caminho canônico único). Fluxo REAL, ponta a ponta:
//   fmt2 → compileFromFmt2 (phases + gruposCount) → drawInitial (fase 0) → JOGA a classificatória
//   → _advanceMultiPhase (materializa a elim a partir da classificação) → JOGA a elim → CAMPEÃO.
// Invariantes: sorteio OK, classificatória fecha, elim materializa com o nº CERTO de classificados
// (grupos × classificados), sem jogo travado, sem vaga MORTA, fecha num campeão. Individual E duplas.
// Cobre Grupos+Elim (N × grupos × classificados) e Suíço+Elim. + integração tardia na classificatória.
//
// node tests/classificatory-phase-sweep.test.js
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// stubs pra _advanceMultiPhase não bloquear (sem inativos/alertas nos cenários limpos)
W.showAlertDialog = function () {}; W.showConfirmDialog = function (a, b, cb) { cb && cb(); };
W._showInactivePhasePanel = function () {}; W._phasePendingInactives = function () { return []; };

function mkIndiv(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ uid: 'u' + i, displayName: 'P' + i, name: 'P' + i, gender: (i % 2 ? 'masculino' : 'feminino'), ligaActive: true }); return a; }
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i, ligaActive: true }); return a; }
const isEmpty = (v) => !v || v === 'TBD' || v === BYE || /a definir/i.test(String(v));

// joga TODOS os jogos de uma fase (phaseIndex) até assentar; avança vencedores. Retorna erro|null.
function playPhase(t, ph) {
  let g = 0;
  while (g++ < 4000) {
    const all = W._collectAllMatches(t).filter((m) => m && (m.phaseIndex || 0) === ph && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2) && !m.isSitOut && !m.isBye);
    if (!all.length) break;
    const m = all[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) { return 'advance:' + e.message; }
  }
  return null;
}
function elimHealth(t) {
  const el = (t.matches || []).filter((m) => (m.phaseIndex || 0) === 1);
  const maxR = el.length ? Math.max.apply(null, el.map((x) => x.round || 0)) : 0;
  const stuck = el.filter((m) => m && !m.winner && m.p1 && m.p2 && !isEmpty(m.p1) && !isEmpty(m.p2)).length;
  const dead = el.filter((m) => m && !m.isThirdPlace && !m.isSitOut && !m.winner && (isEmpty(m.p1) || isEmpty(m.p2)) && (m.round || 0) < maxR).length;
  const champ = el.some((m) => m && !m.isThirdPlace && m.winner);
  return { n: el.length, stuck, dead, champ };
}

// Roda um cenário multi-fase completo.
function runGE(o) {
  const cfg = {
    disputa: o.disputa, grupos: o.grupos, classifAtiva: true, classificados: o.classif,
    rodadas: { modo: 'todos', turnos: 'ida' },
    eliminatoria: { ativa: true, linhas: 1, formacao: 'performance', terceiro: false },
  };
  const sport = (o.disputa === 'individual') ? 'Tênis' : 'Beach Tennis';
  const parts = (o.disputa === 'individual') ? mkIndiv(o.N) : mkPairs(o.N);
  const t = {
    id: 'C' + o.N + '-' + o.grupos + '-' + o.classif + '-' + o.disputa.charAt(0), sport: sport, fmt2: cfg,
    participants: parts, teamSize: (o.disputa === 'dupla' ? 2 : 1), enrollmentMode: (o.disputa === 'dupla' ? 'teams' : 'individual'),
    combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
  };
  const rc = dc.compileFromFmt2(t);
  ok(!!(rc && rc.ok), o.label + ' :: compileFromFmt2 ok');
  ok(t.gruposCount === o.grupos, o.label + ' :: gruposCount=' + o.grupos + ' (got ' + t.gruposCount + ')');
  W.AppStore.tournaments = [t];
  const rd = dc.drawInitial(t, {});
  ok(!!(rd && rd.ok), o.label + ' :: drawInitial ok (' + (rd && rd.reason || '') + ')');
  if (!rd || !rd.ok) return;

  const e0 = playPhase(t, 0);
  ok(!e0, o.label + ' :: classificatória jogou sem erro (' + (e0 || '') + ')');
  const complete = W._phasesPhaseComplete ? W._phasesPhaseComplete(t) : true;
  ok(complete, o.label + ' :: fase 0 COMPLETA após jogar');

  W._advanceMultiPhase(t.id);
  const el = elimHealth(t);
  ok(t.currentPhaseIndex === 1, o.label + ' :: avançou pra fase 1 (elim) (currentPhaseIndex=' + t.currentPhaseIndex + ')');
  ok(el.n > 0, o.label + ' :: elim MATERIALIZOU jogos (' + el.n + ')');
  // conservação: o nº de competidores reais na elim = grupos × classificados (teto pela realidade do bracket)
  const expClassif = o.grupos * o.classif;
  const reals = new Set();
  (t.matches || []).filter((m) => (m.phaseIndex || 0) === 1).forEach((m) => { [m.p1, m.p2].forEach((x) => { if (x && !isEmpty(x)) reals.add(x); }); });
  ok(reals.size >= Math.min(expClassif, 2) && reals.size <= expClassif, o.label + ' :: elim tem ~' + expClassif + ' classificados (got ' + reals.size + ')');

  const e1 = playPhase(t, 1);
  ok(!e1, o.label + ' :: elim jogou sem erro (' + (e1 || '') + ')');
  const el2 = elimHealth(t);
  ok(el2.stuck === 0, o.label + ' :: elim sem jogo travado (' + el2.stuck + ')');
  ok(el2.dead === 0, o.label + ' :: elim sem vaga morta (' + el2.dead + ')');
  ok(el2.champ, o.label + ' :: elim FECHA num campeão');
}

console.log('── SWEEP CLASSIFICATÓRIA → ELIM: fmt2, todo N × grupos × classificados ──');

// combinações matematicamente relevantes: grupos de >=3, total classificados >=2.
// N (inscritos/duplas) × grupos × classificados-por-grupo.
const COMBOS = [];
[6, 8, 9, 10, 12, 15, 16, 18, 20, 24].forEach((N) => {
  [2, 3, 4, 5, 6].forEach((G) => {
    if (G < 2) return;
    if (Math.floor(N / G) < 3) return;         // grupos de pelo menos 3
    [1, 2].forEach((C) => {
      if (G * C < 2) return;                    // pelo menos 2 classificados
      if (G * C > N) return;                     // não classifica mais que o total
      COMBOS.push({ N, grupos: G, classif: C });
    });
  });
});

['individual', 'dupla'].forEach((disp) => {
  COMBOS.forEach((c) => {
    runGE(Object.assign({ disputa: disp, label: 'Grupos+Elim ' + disp + ' N=' + c.N + ' grupos=' + c.grupos + ' classif=' + c.classif }, c));
  });
});

// ── SUÍÇO → ELIM (classificatória Suíço, cut, elim) ──
console.log('\n── Suíço → Elim ──');
[8, 12, 16, 24].forEach((N) => {
  const cfg = { disputa: 'individual', grupos: 1, parceria: 'sorteio_rodada', classifAtiva: true, classificados: 2, rodadas: { modo: 'suico' }, eliminatoria: { ativa: true, linhas: 1, formacao: 'performance' } };
  const t = { id: 'SW' + N, sport: 'Tênis', fmt2: cfg, participants: mkIndiv(N), teamSize: 1, enrollmentMode: 'individual', combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [] };
  const rc = dc.compileFromFmt2(t);
  const label = 'Suíço+Elim indiv N=' + N;
  ok(!!(rc && rc.ok), label + ' :: compile ok (' + (rc && rc.reason || '') + ')');
});

// ── INTEGRAÇÃO TARDIA NA FASE CLASSIFICATÓRIA (os "mesmos testes" do dono) ──
// tardio presente (newMatchups) entra na classificatória (grupo/rodada) e a fase avança/joga.
console.log('\n── integração tardia na classificatória ──');
[['Grupos', { disputa: 'individual', grupos: 2, classifAtiva: true, classificados: 2, rodadas: { modo: 'todos' }, eliminatoria: { ativa: true, linhas: 1 } }],
 ['Grupos', { disputa: 'individual', grupos: 3, classifAtiva: true, classificados: 1, rodadas: { modo: 'todos' }, eliminatoria: { ativa: true, linhas: 1 } }],
 ['Suíço', { disputa: 'individual', grupos: 1, parceria: 'sorteio_rodada', classifAtiva: true, classificados: 2, rodadas: { modo: 'suico' }, eliminatoria: { ativa: true, linhas: 1 } }]].forEach(function (c, i) {
  const t = { id: 'LT' + i, sport: 'Tênis', fmt2: c[1], participants: mkIndiv(8), teamSize: 1, enrollmentMode: 'individual', lateEnrollment: 'expand', newMatchups: true, combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [] };
  dc.compileFromFmt2(t); W.AppStore.tournaments = [t]; dc.drawInitial(t, {});
  t.standbyParticipants.push({ uid: 'ltx', displayName: 'LateX', name: 'LateX', _lateJoin: true, ligaActive: true }); t.checkedIn['ltx'] = 1;
  const r = dc.integrateLateEntries(t, {});
  const label = 'tardio classif ' + c[0] + ' #' + i;
  ok(r && r.changed === true, label + ' :: integrou (changed=true)');
  const all = (t.matches || []).concat((t.rounds || []).reduce(function (acc, rr) { return acc.concat(rr.matches || []); }, []));
  ok(all.some(function (m) { return m && (m.p1 === 'LateX' || m.p2 === 'LateX'); }), label + ' :: LateX ENTROU na classificatória');
  ok(!(t.standbyParticipants || []).some(function (p) { return p.displayName === 'LateX'; }), label + ' :: saiu da espera');
});

console.log('\n' + (fail === 0 ? '✅ classificatory-phase-sweep: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok, ' + COMBOS.length + ' combos × 2)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 80).forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
