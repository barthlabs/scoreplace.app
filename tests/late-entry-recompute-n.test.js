// CÂNONE do dono (jul/2026) — a chave é sempre a chave de N, e entrar tarde só muda o N:
//
//   "a conta deve ser refeita conforme entra um tardio (ou 2 ou 3...) como se o tardio sempre
//    estivesse la. a nova chave deve refletir isso sempre. por essa razao, aquele que cairia (e
//    eventualmente já esta la embaixo) sobe porque se o tardio estivesse la antes, ele nao teria
//    caido. o repescado é sempre da rodada superior."
//
// INVARIANTE (o que este teste tranca): depois de QUALQUER número de entradas tardias, a 1ª rodada
// da chave superior tem EXATAMENTE ⌈N/2⌉ jogos, N = nº de competidores inscritos. Como cada jogo
// tem 2 vagas, sobra no máximo UMA vaga — preenchida por UM repescado. Logo:
//   • nº de jogos da 1ª superior  = ⌈N/2⌉
//   • nº de pessoas repetidas nela = 2·⌈N/2⌉ − N   (ou seja, 0 quando N é par, 1 quando é ímpar)
//
// MEDIDO no doc real tour_1784727218055_sb (15 inscritos, 3 tardios): a 1ª superior tinha 9 jogos
// (18 vagas) em vez de 8 (16). O jogo a mais era o CONFRONTO DUPLICADO (mesmo par de uids sob dois
// rótulos, um deles sem uid) — removê-lo devolve a conta a 8.
//
// ⚠️ ESCOPO HONESTO DESTE TESTE: ele é um GUARDA do invariante, NÃO a reprodução daquele defeito.
// Verifiquei: ele passa mesmo com _stampMissingMatchUids/_dedupMatchesByUid desligados, porque no
// mock toda entrada já nasce com uid — a condição real (jogo com team1Uids=null) não acontece aqui.
// Quem reproduz aquele defeito e o match-identity-dedup, que monta os dois jogos como estavam no
// banco. Este aqui trava o outro lado: que N tardios NÃO virem N jogos acrescentados.
// [[project_minimal_elim_formula_canon]] / [[feedback_tests_must_reproduce_real_failure]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false, dupla: true };
  const t = { id: 'RECN' + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t); dc.drawInitial(t, {});
  return t;
}
const all = t => W._collectAllMatches(t) || [];
const supMs = t => all(t).filter(m => m && m.bracket !== 'lower' && m.bracket !== 'grand' && !m.isThirdPlace);
function primeiraSup(t) {
  const ms = supMs(t); if (!ms.length) return [];
  const r = Math.min.apply(null, ms.map(m => (typeof m.round === 'number') ? m.round : 1));
  return ms.filter(m => ((typeof m.round === 'number') ? m.round : 1) === r);
}
// identidade por uid — nunca por rótulo [[project_uid_identity_canon_locked]]
function chaveLado(m, lado) {
  const u = (lado === 'p1') ? m.team1Uids : m.team2Uids;
  if (Array.isArray(u) && u.length) return u.slice().sort().join('+');
  const rot = String((lado === 'p1' ? m.p1 : m.p2) || '').trim();
  return (!rot || rot === 'TBD') ? '' : 'n:' + rot.toLowerCase();
}
function chegaTardio(t, off) {
  const p = mkPairs(1, off)[0]; p._lateJoin = true;
  t.waitlist.push(p); t.participants.push(p);
  t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1;
  return p;
}

console.log('── a 1ª superior é sempre a chave de N (⌈N/2⌉ jogos), com 1 tardio ou com 3 ──');

[1, 2, 3].forEach(function (qtd) {
  const t = mkT(12);
  // termina a 1ª rodada inteira (é o cenário do dono: "terminados os 6 jogos anteriores")
  primeiraSup(t).forEach(m => { if (!m.winner && m.p1 && m.p2) { m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3; try { W._advanceWinner(t, m); } catch (e) {} } });
  const jogados = primeiraSup(t).filter(m => m.winner).map(m => m.p1 + ' vs ' + m.p2).sort();

  for (let i = 0; i < qtd; i++) { chegaTardio(t, 100 + i * 10); dc.integrateLateEntries(t, {}); }

  const N = (t.participants || []).length;
  const esperado = Math.ceil(N / 2);
  const sup1 = primeiraSup(t);
  ok(sup1.length === esperado,
    qtd + ' tardio(s) ⇒ 1ª superior com ⌈' + N + '/2⌉ = ' + esperado + ' jogos (got ' + sup1.length + ')');

  // ninguém aparece mais de uma vez, exceto o único repescado quando N é ímpar
  const cont = {};
  sup1.forEach(m => ['p1', 'p2'].forEach(l => { const k = chaveLado(m, l); if (k) cont[k] = (cont[k] || 0) + 1; }));
  const repetidos = Object.keys(cont).filter(k => cont[k] > 1);
  const maxRepetidos = 2 * esperado - N;
  ok(repetidos.length <= Math.max(0, maxRepetidos),
    qtd + ' tardio(s) ⇒ no máximo ' + Math.max(0, maxRepetidos) + ' competidor(es) repetido(s) na 1ª superior (got ' +
    repetidos.length + ': ' + JSON.stringify(repetidos.slice(0, 3).map(x => x.slice(0, 14))) + ')');

  // os jogos JÁ DISPUTADOS continuam intocados
  const aindaLa = primeiraSup(t).filter(m => m.winner).map(m => m.p1 + ' vs ' + m.p2).sort();
  const sumiram = jogados.filter(x => aindaLa.indexOf(x) < 0);
  ok(sumiram.length === 0, qtd + ' tardio(s) ⇒ nenhum jogo já disputado mudou (sumiram ' + sumiram.length + ')');
});

console.log('\n' + (fail === 0 ? '✅ late-entry-recompute-n: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
