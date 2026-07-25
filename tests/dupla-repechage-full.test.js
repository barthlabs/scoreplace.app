/* DUPLA ELIMINATÓRIA fora de potência de 2 — INVARIANTES. node tests/dupla-repechage-full.test.js
 *
 * Os INVARIANTES desta suíte não mudaram e são os que importam de verdade:
 *   todos entram · ninguém trava · sem vaga morta · sem double-book · campeão único.
 * O que mudou foi o MECANISMO que os garante (decisão do dono, 25/jul):
 *
 *   ANTES — o organizador escolhia a resolução. 'playin' criava uma RODADA 0 de
 *   jogos preliminares entre os piores até chegar na potência de 2 abaixo; 'bye'
 *   preenchia até a potência acima com folgas nos melhores.
 *
 *   AGORA — quem manda é a LÓGICA: chave = f(N, formato) (js/views/chaves.js), com
 *   a regra do MENOR esforço (o menor entre vagas B−N e perdedores N−B/2; empate vai
 *   pra bye). Não existe mais rodada 0, nem `bracketResolution` — e o mesmo N sempre
 *   produz o mesmo desenho.
 *
 * Por isso este arquivo deixou de afirmar contagens de play-in e passou a exercitar
 * os invariantes sobre o motor novo, nos MESMOS N de antes, jogando cada chave até
 * o campeão com o `_advanceWinner` real.
 */
const H = require('./headless.js');
const W = H.window;
const C = W._chaves, A = W._chavesAdapter;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));
const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));

function build(n) {
  const b = A.build(n, 'dupla', { participantes: parts(n) });
  return { id: 'de' + n, format: 'Dupla Eliminatória', matches: b.matches, _meta: b.meta };
}

function invariantes(t, n, tag) {
  const ms = t.matches;

  // (1) TODOS ENTRAM: cada participante aparece como semente exatamente 1 vez
  const vistos = {};
  ms.forEach((m) => {
    [[m.p1, m.p1Seed], [m.p2, m.p2Seed]].forEach(([nome, seed]) => {
      if (seed != null && !isBye(nome)) vistos[nome] = (vistos[nome] || 0) + 1;
    });
  });
  ok(Object.keys(vistos).length === n, `${tag}: ${Object.keys(vistos).length} participantes na chave, esperado ${n}`);
  ok(Object.keys(vistos).every((k) => vistos[k] === 1), `${tag}: alguém entra mais de uma vez (double-book na semeadura)`);

  // (2) SEM AUTO-CONFRONTO e (3) NINGUÉM TRAVA: joga tudo até não sobrar jogo
  let guard = 0;
  for (;;) {
    if (++guard > 6000) { ok(false, `${tag}: playout não converge (loop)`); break; }
    const m = ms.find((x) => !x.winner && !isBye(x.p1) && !isBye(x.p2));
    if (!m) break;
    ok(m.p1 !== m.p2, `${tag}: ${m.id} — ${m.p1} enfrentaria a si mesmo`);
    m.winner = m.p1;
    W._advanceWinner(t, m);
  }

  // (4) SEM VAGA MORTA: nenhum jogo real fica sem vencedor
  // (GF-EXTRA é condicional — só se joga quando o vice vence a grande final)
  const orfaos = ms.filter((m) => !m.winner && !m.isExtra && !isBye(m.p1) && !isBye(m.p2));
  ok(orfaos.length === 0, `${tag}: ${orfaos.length} jogo(s) órfão(s) → ${orfaos.map((m) => m.id).join(', ')}`);

  // (5) CAMPEÃO ÚNICO: a grande final saiu com vencedor
  const gf = ms.filter((m) => m.id === t._meta.finalId)[0];
  ok(gf && !!gf.winner, `${tag}: grande final (${t._meta.finalId}) sem campeão`);
}

console.log('\n== N que resolvem por REPESCAGEM (regra do menor esforço) ==');
[5, 6, 9, 10, 11, 17, 18, 21, 22, 23, 33, 40, 47].forEach((n) => {
  const modo = C.plano(n).modo;
  invariantes(build(n), n, `n=${n} (${modo})`);
});

console.log('== N que resolvem por BYE ==');
[7, 12, 13, 14, 15, 24, 30, 31].forEach((n) => {
  const modo = C.plano(n).modo;
  invariantes(build(n), n, `n=${n} (${modo})`);
});

console.log('== VARREDURA n=5..40 (a regra decide sozinha em cada N) ==');
for (let n = 5; n <= 40; n++) {
  if ((n & (n - 1)) === 0) continue;   // pow2 = dupla eliminatória limpa, sem ajuste
  invariantes(build(n), n, `sweep n=${n} (${C.plano(n).modo})`);
}

console.log('\n' + (fail === 0 ? '✅ dupla-repechage-full: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
process.exit(fail === 0 ? 0 : 1);
