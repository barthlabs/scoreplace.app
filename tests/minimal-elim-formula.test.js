// FÓRMULA ÚNICA da eliminatória mínima (regra do dono, 20/jul: "tem que ser uma fórmula
// matemática única, sempre a mesma, senão uma hora quebra"). genTierBracket(N,'playin') e a
// integração tardia usam a MESMA window._buildMinimalElimTree. Fórmula: a cada rodada com E
// entrantes → ⌈E/2⌉ jogos; se E ímpar, 1 jogo é de repescagem (melhor derrotado AINDA NÃO
// repescado da rodada-fonte, rank incremental); 3º lugar = 2 perdedores de semi. Verifica pra
// MUITOS N: topologia = recorrência ⌈E/2⌉, ranks distintos por rodada-fonte (sem 2 no mesmo
// derrotado), e a chave JOGA até o campeão (0 travado, 0 vaga morta) com o motor real.
const { window: W, load } = require('./headless');
load('bracket-logic.js'); // _advanceWinner / _collectAllMatches / _resolveRepFills
const E = W._phasesEngine;
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }

// topologia esperada pela fórmula: E0=N; Gr=⌈Er/2⌉; Er+1=Gr; até 1.
function expectedRounds(N) { const r = []; let e = N; while (e > 1) { const g = Math.ceil(e / 2); r.push(g); e = g; } return r; }

function check(N) {
  const teams = []; for (let i = 1; i <= N; i++) teams.push({ displayName: 'T' + i, uid: 'u' + i });
  const res = E.genTierBracket(teams, 'main', 'g', 'playin', true, 'seed');
  const nonThird = res.matches.filter(m => !m.isThirdPlace);
  const rc = {}; nonThird.forEach(m => rc[m.round] = (rc[m.round] || 0) + 1);
  const rounds = Object.keys(rc).sort((a, b) => a - b).map(k => rc[k]);
  const exp = expectedRounds(N);
  ok(JSON.stringify(rounds) === JSON.stringify(exp), 'N=' + N + ': topologia ⌈E/2⌉ = ' + JSON.stringify(exp) + ' (got ' + JSON.stringify(rounds) + ')');

  // ranks distintos por rodada-fonte (senão 2 repescados pegam o MESMO derrotado)
  const bySrc = {}; res.matches.forEach(m => (m.repFill || []).forEach(rf => { (bySrc[rf.srcRound] = bySrc[rf.srcRound] || []).push(rf.rank); }));
  let rankOk = true; Object.keys(bySrc).forEach(s => { const rks = bySrc[s]; if (new Set(rks).size !== rks.length) rankOk = false; });
  ok(rankOk, 'N=' + N + ': ranks de repescagem DISTINTOS por rodada-fonte (sem 2 no mesmo derrotado)');

  // 3º lugar canônico único
  ok(res.matches.filter(m => m.isThirdPlace).length === 1, 'N=' + N + ': 1 só 3º lugar (isThirdPlace)');

  // JOGA até o fim com o motor real
  const t = { id: 'X', format: 'Eliminatórias Simples', matches: res.matches.map(m => Object.assign({}, m)), repechageConfig: null };
  let g = 0, gu = 0;
  while (gu++ < 400) {
    const pl = W._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!pl.length) break;
    const m = pl[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (g++ % 5); W._advanceWinner(t, m);
  }
  const all = W._collectAllMatches(t);
  const maxR = Math.max.apply(null, all.map(x => x.round));
  const stuck = all.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  const dead = all.filter(m => !m.isThirdPlace && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner && m.round < maxR);
  const champ = all.filter(m => !m.isThirdPlace).sort((a, b) => b.round - a.round)[0];
  const third = all.find(m => m.isThirdPlace);
  ok(stuck.length === 0, 'N=' + N + ': playout sem jogo travado');
  ok(dead.length === 0, 'N=' + N + ': playout sem vaga morta (TBD) antes da final');
  ok(champ && champ.winner, 'N=' + N + ': chave FECHA num campeão');
  ok(third && third.winner, 'N=' + N + ': 3º lugar disputado e resolvido');
}

console.log('── fórmula única, N = 5..25 ──');
for (let N = 5; N <= 25; N++) check(N);

console.log('\n' + (fail === 0 ? '✅ minimal-elim-formula: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
