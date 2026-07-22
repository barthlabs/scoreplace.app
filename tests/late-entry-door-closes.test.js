// CÂNONE do dono (jul/2026) — a PORTA de entrada do tardio depende do avanço da chave:
//
//   "no ponto que estamos agora, r2 sup/inf definida, se entrar um tardio entra na sup
//    reorganizando repescagens. é o ultimo momento em que entra na r1 sup. lançado o primeiro
//    resultado na r2 sup, qualquer tardio entrará na r1 inf."
//
// Ou seja:
//   • 2ª rodada da SUPERIOR ainda SEM nenhum resultado ⇒ tardio entra na 1ª SUPERIOR (as
//     repescagens se reorganizam pelo número novo — aditivo, quem já foi definido congela);
//   • lançado o PRIMEIRO resultado na 2ª SUPERIOR ⇒ a 1ª superior FECHA e todo tardio a partir
//     dali entra na 1ª INFERIOR.
//
// Em Eliminatória Simples não há chave inferior — a porta simplesmente fecha (nada de inventar
// um jogo na superior depois que a 2ª rodada começou).
// [[project_dupla_elim_late_integration_cascade]] / [[project_late_enrollment_blocks_finish]]
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

function mkPairs(n, off) { const a = []; for (let i = 1; i <= n; i++) { const k = (off || 0) + i; a.push({ p1Uid: 'a' + k, p1Name: 'A' + k, p2Uid: 'b' + k, p2Name: 'B' + k, displayName: 'A' + k + ' / B' + k, name: 'A' + k + ' / B' + k, ligaActive: true }); } return a; }
function mkT(N, dupla) {
  const el = { ativa: true, linhas: 1, formacao: 'sorteio', terceiro: false };
  if (dupla) el.dupla = true;
  const t = { id: 'PORTA' + (dupla ? 'D' : 'S') + N, sport: 'Beach Tennis',
    fmt2: { disputa: 'dupla', grupos: 1, parceria: 'fixa', classifAtiva: false, eliminatoria: el },
    participants: mkPairs(N), teamSize: 2, enrollmentMode: 'teams', combinedCategories: [],
    currentPhaseIndex: 0, checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [],
    teamOrigins: {}, matches: [], lateEnrollment: 'expand', newMatchups: true };
  mkPairs(N).forEach(p => { t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1; });
  dc.compileFromFmt2(t);
  dc.drawInitial(t, {});
  return t;
}
const all = t => W._collectAllMatches(t) || [];
const doBracket = (t, b) => all(t).filter(m => m && (b === 'upper' ? (m.bracket === 'upper' || m.bracket === 'main' || !m.bracket) : m.bracket === b));
function rodadaBase(t, b) {
  const ms = doBracket(t, b); if (!ms.length) return null;
  return Math.min.apply(null, ms.map(m => (typeof m.round === 'number') ? m.round : 1));
}
// chega um tardio PRESENTE na lista de espera
function chegaTardio(t, off) {
  const p = mkPairs(1, off)[0];
  p._lateJoin = true;
  t.waitlist.push(p);
  t.checkedIn[p.p1Uid] = 1; t.checkedIn[p.p2Uid] = 1;
  if (!Array.isArray(t.participants)) t.participants = [];
  t.participants.push(p);
  return p;
}
// onde o tardio parou? devolve {bracket, round} ou null
function ondeEntrou(t, p) {
  const alvo = p.displayName;
  const m = all(t).filter(x => x && (x.p1 === alvo || x.p2 === alvo))[0];
  return m ? { bracket: m.bracket || 'upper', round: m.round } : null;
}

console.log('── a porta do tardio: 1ª superior até a 2ª superior começar, depois 1ª inferior ──');

// (1) 2ª sup AINDA SEM RESULTADO ⇒ entra na 1ª SUPERIOR
(function () {
  const t = mkT(12, true);
  const rSup = rodadaBase(t, 'upper');
  const n = chegaTardio(t, 100);
  const colocados = W._placeLateEntriesSurgically(t);
  ok(colocados > 0, 'com a 2ª sup sem resultado, o tardio É colocado (got ' + colocados + ')');
  const onde = ondeEntrou(t, n);
  ok(!!onde, 'o tardio aparece na chave');
  ok(onde && (onde.bracket === 'upper' || onde.bracket === 'main'), 'entra na chave SUPERIOR (got ' + (onde && onde.bracket) + ')');
  ok(onde && onde.round === rSup, 'entra na 1ª rodada da superior (got R' + (onde && onde.round) + ', esperado R' + rSup + ')');
})();

// (2) PRIMEIRO resultado lançado na 2ª sup ⇒ a porta da superior FECHA; entra na 1ª INFERIOR
(function () {
  const t = mkT(12, true);
  const rSup = rodadaBase(t, 'upper');
  const rInf = rodadaBase(t, 'lower');
  // joga a 1ª superior inteira e lança UM resultado na 2ª superior
  doBracket(t, 'upper').filter(m => m.round === rSup).forEach(m => {
    if (m.winner || !m.p1 || !m.p2) return;
    m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = 3;
    try { W._advanceWinner(t, m); } catch (e) {}
  });
  const segunda = doBracket(t, 'upper').filter(m => m.round === rSup + 1 && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD')[0];
  ok(!!segunda, 'existe jogo jogável na 2ª superior pra lançar o 1º resultado');
  if (segunda) {
    segunda.winner = segunda.p1; segunda.scoreP1 = 6; segunda.scoreP2 = 4;
    try { W._advanceWinner(t, segunda); } catch (e) {}
  }

  const n = chegaTardio(t, 200);
  W._placeLateEntriesSurgically(t);
  const onde = ondeEntrou(t, n);
  ok(!!onde, 'o tardio continua entrando (a porta não é o fim da linha, muda de lugar)');
  ok(onde && onde.bracket === 'lower', 'com resultado na 2ª sup, entra na chave INFERIOR (got ' + (onde && onde.bracket) + ')');
  ok(onde && onde.round === rInf, 'entra na 1ª rodada da inferior (got R' + (onde && onde.round) + ', esperado R' + rInf + ')');
  // e NÃO pode ter sido enfiado na superior
  const naSup = doBracket(t, 'upper').some(m => m && (m.p1 === n.displayName || m.p2 === n.displayName));
  ok(!naSup, 'o tardio NÃO aparece na superior depois que a 2ª sup começou');
})();

// (3) jogo já decidido nunca é tocado — nem antes nem depois da porta fechar
(function () {
  const t = mkT(12, true);
  const rSup = rodadaBase(t, 'upper');
  const antes = doBracket(t, 'upper').filter(m => m.round === rSup).map(m => m.id + '|' + m.p1 + '|' + m.p2).sort();
  chegaTardio(t, 300);
  W._placeLateEntriesSurgically(t);
  const depois = doBracket(t, 'upper').filter(m => m.round === rSup).map(m => m.id + '|' + m.p1 + '|' + m.p2).sort();
  const sumiu = antes.filter(x => depois.indexOf(x) < 0);
  ok(sumiu.length === 0, 'nenhum confronto da 1ª sup foi alterado pelo tardio (sumiram ' + sumiu.length + ')');
})();

// (4) Eliminatória Simples: sem chave inferior, a porta fecha e ninguém é enfiado na superior
(function () {
  const t = mkT(12, false);
  const rSup = rodadaBase(t, 'upper');
  doBracket(t, 'upper').filter(m => m.round === rSup).forEach(m => {
    if (m.winner || !m.p1 || !m.p2) return;
    m.winner = m.p1; try { W._advanceWinner(t, m); } catch (e) {}
  });
  const segunda = doBracket(t, 'upper').filter(m => m.round === rSup + 1 && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD')[0];
  if (segunda) { segunda.winner = segunda.p1; try { W._advanceWinner(t, segunda); } catch (e) {} }
  const n = chegaTardio(t, 400);
  W._placeLateEntriesSurgically(t);
  const onde = ondeEntrou(t, n);
  ok(!onde || onde.round !== rSup, 'Simples: depois da 2ª rodada começar, o tardio NÃO entra na 1ª rodada (got ' + JSON.stringify(onde) + ')');
})();

console.log('\n' + (fail === 0 ? '✅ late-entry-door-closes: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
