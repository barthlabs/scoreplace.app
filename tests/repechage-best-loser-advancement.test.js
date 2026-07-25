/* REPESCAGEM — QUEM É REPESCADO E CONTRA QUEM. node tests/repechage-best-loser-advancement.test.js
 *
 * SUPERSEDE a regra anterior deste arquivo (decisão do dono, 25/jul):
 *
 *   ANTES — "o MELHOR derrotado pega a vaga que exige MENOS jogos até a final",
 *   implementado por _rankRepFillsByAdvancement, que reordenava os ranks das vagas
 *   depois da rodada fechar. Quem era repescado dependia do DESEMPENHO.
 *
 *   AGORA — a repescagem é ESTRUTURAL: chave = f(N, formato). Já no sorteio se sabe
 *   que a vaga do seed #S recebe o perdedor de um jogo NOMEADO da R1. Não há
 *   ranqueamento, não há vaga pendente, não depende de saldo.
 *
 * MAS a propriedade que de fato protege o jogador continua — e é mais forte que a
 * regra antiga: o receptor da repescagem é sempre escolhido na METADE OPOSTA da
 * chave (chaves.js: `cand = livres.filter(j => (j < meta) !== (pos < meta))`).
 * Consequência prática: quem perde e é repescado NÃO reencontra imediatamente quem
 * acabou de derrotá-lo. É isso que este arquivo trava agora.
 */
const H = require('./headless.js');
const W = H.window;
const C = W._chaves, A = W._chavesAdapter;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'T' + (i + 1), uid: 'u' + (i + 1) }));
const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));

console.log('\n== repescagem: receptor na METADE OPOSTA do jogo de origem (N = 3..64) ==');
for (let N = 3; N <= 64; N++) {
  const pl = C.plano(N);
  if (!pl.repescagens) continue;           // este N resolve por bye — nada a checar
  const d = C.chave(N, 'simples');
  const meta = pl.B / 4;                   // fronteira das metades na R1
  const reps = d.jogos.filter((j) => j.tipo === 'repescagem');
  ok(reps.length === pl.repescagens, `N=${N}: ${reps.length} repescagens, esperado ${pl.repescagens}`);
  reps.forEach((j) => {
    const src = d.porId[j.origemRepescado];
    ok(!!src, `N=${N}: ${j.id} sem jogo de origem declarado`);
    if (!src) return;
    const posRep = j.pos - 1, posSrc = src.pos - 1;
    ok((posRep < meta) !== (posSrc < meta),
      `N=${N}: ${j.id} (pos ${j.pos}) recebe repescado de ${src.id} (pos ${src.pos}) — MESMA metade, deveria ser oposta`);
  });
}

console.log('== o repescado NÃO reencontra quem acabou de derrotá-lo ==');
[5, 9, 10, 11, 19, 21, 37].forEach((N) => {
  if (!C.plano(N).repescagens) return;
  const built = A.build(N, 'simples', { participantes: parts(N) });
  const t = { id: 'r' + N, format: 'Eliminatórias Simples', matches: built.matches };

  const algozDe = {};   // derrotado -> quem o derrotou
  let guard = 0;
  for (;;) {
    if (++guard > 4000) break;
    const m = t.matches.find((x) => !x.winner && !isBye(x.p1) && !isBye(x.p2));
    if (!m) break;
    if (m.isRepechageSlot) {
      ok(algozDe[m.p1] !== m.p2 && algozDe[m.p2] !== m.p1,
        `N=${N}: ${m.id} — repescado reencontrou de imediato quem o derrotou (${m.p1} x ${m.p2})`);
    }
    const venc = m.p1, perd = m.p2;
    m.winner = venc;
    if (!algozDe[perd]) algozDe[perd] = venc;
    W._advanceWinner(t, m);
  }
});

console.log('\n' + (fail === 0 ? '✅ repechage-best-loser-advancement: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail > 0 ? 1 : 0);
