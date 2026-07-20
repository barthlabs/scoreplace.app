// SWEEP EXTENSIVO (dono, 20/jul: "rode todo tipo de torneio com toda config e vários N"). Sorteia
// pelo MOTOR CANÔNICO da CF (draw-core.drawInitial — o MESMO que roda em produção), joga a chave
// inteira com o motor real (_advanceWinner do harness), e valida invariantes: sorteio OK, sem jogo
// travado, sem vaga MORTA (TBD que nunca resolve), FECHA num campeão, e (elim) classificação 1..N
// sem buraco. Cobre: Eliminatória Simples (playin/bye), Dupla Eliminatória, Fase de Grupos, Suíço,
// Liga (Pontos Corridos), Rei/Rainha — em individual E duplas — pra MUITOS N. É um caça-bug.
const { window: W } = require('./headless');
const dc = require('../functions-autodraw/draw-core.js');
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkIndiv(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ uid: 'u' + i, displayName: 'P' + i, name: 'P' + i, gender: (i % 2 ? 'masculino' : 'feminino') }); return a; }
function mkPairs(n) { const a = []; for (let i = 1; i <= n; i++) a.push({ p1Uid: 'a' + i, p1Name: 'A' + i, p2Uid: 'b' + i, p2Name: 'B' + i, displayName: 'A' + i + ' / B' + i, name: 'A' + i + ' / B' + i }); return a; }
function tour(format, extra) {
  return Object.assign({
    id: 'T', format: format, teamSize: 1, enrollmentMode: 'individual', participants: [],
    combinedCategories: [], currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [],
    waitlist: [], teamOrigins: {}, sport: 'Beach Tennis'
  }, extra || {});
}
const isBye = v => v === BYE || v == null;
const isEmpty = v => !v || v === 'TBD' || v === BYE;

// joga TODA a chave (matches + groups) até assentar. Retorna {guard, stuck, dead, champ}.
// mode: 'p1' (sempre p1), 'p2' (sempre p2), 'alt' (alterna) — pra exercitar os DOIS slots de avanço.
function playBracket(t, mode) {
  let guard = 0;
  while (guard++ < 4000) {
    const all = W._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!all.length) break;
    const m = all[0];
    const p2wins = mode === 'p2' || (mode === 'alt' && guard % 2 === 0);
    m.winner = p2wins ? m.p2 : m.p1; m.scoreP1 = p2wins ? (guard % 5) : 6; m.scoreP2 = p2wins ? 6 : (guard % 5);
    try { W._advanceWinner(t, m); } catch (e) { return { err: 'advance:' + e.message, guard }; }
  }
  const all = W._collectAllMatches(t);
  const maxR = all.length ? Math.max.apply(null, all.map(x => x.round || 0)) : 0;
  const stuck = all.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  const dead = all.filter(m => m && !m.isThirdPlace && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner && (m.round || 0) < maxR && !m.isSitOut);
  const champ = all.filter(m => m && !m.isThirdPlace && m.winner).sort((a, b) => (b.round || 0) - (a.round || 0))[0];
  return { guard, stuck: stuck.length, dead: dead.length, champ: !!champ, deadIds: dead.slice(0, 3).map(m => m.id + '(r' + m.round + ' ' + m.p1 + '/' + m.p2 + ')') };
}

// LIGA/SUÍÇO round-based: joga a 1ª rodada, gera a próxima, repete; standings não pode crashar.
function playRounds(t, maxRounds) {
  let r = 0;
  while (r++ < (maxRounds || 12)) {
    const rounds = Array.isArray(t.rounds) ? t.rounds : [];
    const cur = rounds[rounds.length - 1];
    if (!cur || !Array.isArray(cur.matches)) break;
    let played = 0;
    cur.matches.forEach(m => { if (m && !m.winner && !m.isSitOut && !m.isBye && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD') { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3; played++; } });
    try { W._computeStandings(t); } catch (e) { return { err: 'standings:' + e.message, round: r }; }
    const before = rounds.length;
    try { if (typeof W._generateNextRound === 'function') W._generateNextRound(t); } catch (e) { return { err: 'nextRound:' + e.message, round: r }; }
    if ((t.rounds || []).length === before) break; // não gerou nova → fim (ou Liga sem mais rodadas)
  }
  return { rounds: (t.rounds || []).length };
}

function classif1toN(t, N) {
  let cls = {};
  try { W._updateProgressiveClassification && W._updateProgressiveClassification(t); cls = t.classification || {}; } catch (e) { return { err: e.message }; }
  const pos = Object.keys(cls).map(k => cls[k]).sort((a, b) => a - b);
  if (!pos.length) return { empty: true };
  return { count: pos.length, min: pos[0], max: pos[pos.length - 1], dup: new Set(pos).size !== pos.length };
}

// ── roda um cenário e valida ──
function run(label, t, N, opts) {
  opts = opts || {};
  let r;
  try { r = dc.drawInitial(t, opts.drawOpts || {}); } catch (e) { ok(false, label + ' → drawInitial CRASHOU: ' + e.message); return; }
  if (!r || !r.ok) { ok(false, label + ' → sorteio FALHOU: ' + (r && r.reason)); return; }
  const roundBased = (Array.isArray(t.rounds) && t.rounds.length > 0) && (!Array.isArray(t.matches) || t.matches.length === 0);
  if (roundBased) {
    const pr = playRounds(t);
    ok(!pr.err, label + ' → rounds sem crash' + (pr.err ? ' [' + pr.err + ']' : ''));
    return;
  }
  const pb = playBracket(t, opts.win || 'p1');
  if (pb.err) { ok(false, label + ' → playout CRASHOU: ' + pb.err); return; }
  ok(pb.guard < 4000, label + ' → sem loop infinito (guard ' + pb.guard + ')');
  ok(pb.stuck === 0, label + ' → sem jogo travado (' + pb.stuck + ')');
  ok(pb.dead === 0, label + ' → sem vaga MORTA (' + pb.dead + (pb.deadIds && pb.deadIds.length ? ' ' + pb.deadIds.join(',') : '') + ')');
  ok(pb.champ, label + ' → FECHA num campeão');
  if (opts.checkClassif) {
    const c = classif1toN(t, N);
    if (c.err) ok(false, label + ' → classif crashou: ' + c.err);
    else if (!c.empty) {
      ok(!c.dup, label + ' → classificação SEM duplicata');
      ok(c.min === 1 && c.max === c.count, label + ' → classificação contígua 1..' + c.count + ' (got ' + c.min + '..' + c.max + ')');
    }
  }
}

const NS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 24, 31, 32, 33, 40, 48, 64];
const PAIR_NS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 16, 17, 24, 32]; // nº de DUPLAS

console.log('── SWEEP: todo formato × config × N ──');

// 1) ELIMINATÓRIA SIMPLES — individual, playin e bye
NS.forEach(N => { if (N < 2) return;
  run('ElimSimples indiv playin N=' + N, tour('Eliminatórias Simples', { participants: mkIndiv(N) }), N, { checkClassif: true });
  run('ElimSimples indiv BYE N=' + N, tour('Eliminatórias Simples', { participants: mkIndiv(N), p2Resolution: 'bye' }), N, { checkClassif: true });
});
// 2) ELIMINATÓRIA SIMPLES — duplas pré-formadas (teams)
PAIR_NS.forEach(N => { if (N < 2) return;
  run('ElimSimples DUPLAS N=' + N, tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(N) }), N, {});
});
// 3) ELIMINATÓRIA SIMPLES — individual→duplas formadas no sorteio (teamSize 2 + individual pares)
[4, 6, 8, 10, 12, 16, 20, 24].forEach(N => {
  run('ElimSimples formaDupla N=' + N + 'p', tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'individual', participants: mkIndiv(N) }), N / 2, {});
});
// 4) DUPLA ELIMINATÓRIA — individual e duplas
NS.forEach(N => { if (N < 3) return;
  run('DuplaElim indiv N=' + N, tour('Dupla Eliminatória', { participants: mkIndiv(N) }), N, {});
});
PAIR_NS.forEach(N => { if (N < 3) return;
  run('DuplaElim DUPLAS N=' + N, tour('Dupla Eliminatória', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(N) }), N, {});
});
// 5) FASE DE GRUPOS + ELIMINATÓRIAS — individual e duplas
NS.forEach(N => { if (N < 4) return;
  run('Grupos indiv N=' + N, tour('Fase de Grupos + Eliminatórias', { participants: mkIndiv(N) }), N, {});
});
PAIR_NS.forEach(N => { if (N < 4) return;
  run('Grupos DUPLAS N=' + N, tour('Fase de Grupos + Eliminatórias', { teamSize: 2, enrollmentMode: 'teams', participants: mkPairs(N) }), N, {});
});
// 6) SUÍÇO — individual e duplas
NS.forEach(N => { if (N < 4) return;
  run('Suíço indiv N=' + N, tour('Suíço', { participants: mkIndiv(N) }), N, {});
});
// 7) LIGA (Pontos Corridos) — individual (duplas formadas é bloqueado no motor)
NS.forEach(N => { if (N < 3) return;
  run('Liga indiv N=' + N, tour('Liga', { participants: mkIndiv(N) }), N, {});
});
// 8) REI/RAINHA (drawMode) — individual
NS.forEach(N => { if (N < 4) return;
  run('ReiRainha indiv N=' + N, tour('Liga', { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', participants: mkIndiv(N) }), N, {});
});

// ── 2ª ONDA: bordas ──
// 9) formaDupla com ÍMPAR de gente (1 sobra sem par → vai pro resto/espera)
[5, 7, 9, 11, 13, 15].forEach(N => {
  run('ElimSimples formaDupla ÍMPAR N=' + N + 'p', tour('Eliminatórias Simples', { teamSize: 2, enrollmentMode: 'individual', participants: mkIndiv(N) }), null, {});
});
// 10) CATEGORIAS (Masc/Fem) — cada categoria vira chave própria
[8, 12, 16, 20].forEach(N => {
  var ps = mkIndiv(N).map((p, i) => Object.assign(p, { category: (i % 2 ? 'Fem' : 'Masc'), gender: (i % 2 ? 'feminino' : 'masculino') }));
  run('ElimSimples CATEGORIAS N=' + N, tour('Eliminatórias Simples', { participants: ps, combinedCategories: ['Masc', 'Fem'] }), null, {});
});
// 11) GRUPOS ida-e-volta (turnos duplos)
[6, 8, 10, 12, 16].forEach(N => {
  run('Grupos ida_volta N=' + N, tour('Fase de Grupos + Eliminatórias', { participants: mkIndiv(N), turnos: 'ida_volta' }), N, {});
});
// 12) LIGA ida-e-volta
[4, 6, 8, 10].forEach(N => {
  run('Liga ida_volta N=' + N, tour('Liga', { participants: mkIndiv(N), turnos: 'ida_volta' }), N, {});
});
// 13) N GRANDES (stress) — elim + grupos + dupla
[80, 96, 128].forEach(N => {
  run('ElimSimples GRANDE N=' + N, tour('Eliminatórias Simples', { participants: mkIndiv(N) }), N, { checkClassif: true });
  run('Grupos GRANDE N=' + N, tour('Fase de Grupos + Eliminatórias', { participants: mkIndiv(N) }), N, {});
  run('DuplaElim GRANDE N=' + N, tour('Dupla Eliminatória', { participants: mkIndiv(N) }), N, {});
});
// 14) ELIM com VIP semeado (1º cabeça de chave)
[8, 16, 13].forEach(N => {
  var t = tour('Eliminatórias Simples', { participants: mkIndiv(N), vips: {} });
  t.vips['u1'] = 1; // 1 VIP
  run('ElimSimples VIP N=' + N, t, N, { checkClassif: true });
});

// 15) VARIAÇÃO DE VENCEDOR — p2 sempre e alternado (exercita os 2 slots de avanço + repescagem)
NS.forEach(N => { if (N < 2) return;
  run('ElimSimples p2wins N=' + N, tour('Eliminatórias Simples', { participants: mkIndiv(N) }), N, { checkClassif: true, win: 'p2' });
  run('ElimSimples altWins N=' + N, tour('Eliminatórias Simples', { participants: mkIndiv(N) }), N, { checkClassif: true, win: 'alt' });
});
NS.forEach(N => { if (N < 3) return;
  run('DuplaElim altWins N=' + N, tour('Dupla Eliminatória', { participants: mkIndiv(N) }), N, { win: 'alt' });
});
NS.forEach(N => { if (N < 4) return;
  run('Grupos altWins N=' + N, tour('Fase de Grupos + Eliminatórias', { participants: mkIndiv(N) }), N, { win: 'alt' });
});

console.log('\n' + (fail === 0 ? '✅ draw-sweep-all-formats: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS (' + fails.length + '):'); fails.slice(0, 60).forEach(f => console.error('  ✗ ' + f)); }
if (fail > 0) process.exit(1);
