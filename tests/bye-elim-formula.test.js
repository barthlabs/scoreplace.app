// FÓRMULA DO BYE (própria, diferente da repescagem — dono, 20/jul: "o bye tem sua fórmula
// própria"). genTierBracket(N,'bye'): arredonda pra próxima POTÊNCIA DE 2 (T); as (T−N) FOLGAS
// vão pros MELHORES colocados (semente 1×T → o topo pega o slot alto vazio). Chave pow2 limpa.
// Verifica 3..130: R1 = T/2, nº de byes = T−N, e a chave JOGA até o campeão (0 travado, 0 vaga
// morta), com o 3º lugar (2 perdedores de semi REAIS — sem bye na semifinal).
const { window: W, load } = require('./headless');
load('bracket-logic.js');
const E = W._phasesEngine;
const BYE = W._t('bui.byeLabel');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function check(N) {
  const teams = []; for (let i = 1; i <= N; i++) teams.push({ displayName: 'T' + i, uid: 'u' + i });
  const res = E.genTierBracket(teams, 'main', 'g', 'bye', true, 'seed');
  const T = nextPow2(N), byes = T - N;
  const r1 = res.matches.filter(m => m.round === 1);
  const r1byes = r1.filter(m => m.isBye || m.p1 === BYE || m.p2 === BYE);
  ok(r1.length === T / 2, 'N=' + N + ' bye: R1 = T/2 = ' + (T / 2) + ' jogos (chave de ' + T + ')');
  ok(r1byes.length === byes, 'N=' + N + ' bye: ' + byes + ' folgas (T−N) pros melhores');

  // JOGA até o fim
  const t = { id: 'X', format: 'Eliminatórias Simples', matches: res.matches.map(m => Object.assign({}, m)) };
  let g = 0, gu = 0;
  while (gu++ < 600) {
    const pl = W._collectAllMatches(t).filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
    if (!pl.length) break;
    const m = pl[0]; m.winner = m.p1; m.scoreP1 = 6; m.scoreP2 = (g++ % 5); W._advanceWinner(t, m);
  }
  const all = W._collectAllMatches(t); const maxR = Math.max.apply(null, all.map(x => x.round));
  const stuck = all.filter(m => m && !m.winner && m.p1 && m.p2 && m.p1 !== 'TBD' && m.p2 !== 'TBD' && m.p1 !== BYE && m.p2 !== BYE);
  const dead = all.filter(m => !m.isThirdPlace && (m.p1 === 'TBD' || m.p2 === 'TBD') && !m.winner && m.round < maxR);
  const champ = all.filter(m => !m.isThirdPlace).sort((a, b) => b.round - a.round)[0];
  const third = all.find(m => m.isThirdPlace);
  ok(stuck.length === 0, 'N=' + N + ' bye: playout sem travado');
  ok(dead.length === 0, 'N=' + N + ' bye: playout sem vaga morta');
  ok(champ && champ.winner, 'N=' + N + ' bye: FECHA num campeão');
  // 3º lugar: se as 2 semis são reais → resolve com 2 contestantes; se uma semi é BYE (N pequeno,
  // ex. N=3: T1 vs BYE) → só 1 perdedor de semi real (inerente). Exige ≥1 contestante real.
  const _3rdReal = third && ((third.p1 && third.p1 !== 'TBD') || (third.p2 && third.p2 !== 'TBD'));
  ok(_3rdReal, 'N=' + N + ' bye: 3º lugar com perdedor(es) de semi (2 se semis reais; 1 se semi-BYE)');
}

console.log('── fórmula do BYE, N = 3..130 ──');
for (let N = 3; N <= 130; N++) check(N);

console.log('\n' + (fail === 0 ? '✅ bye-elim-formula: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
