/* REPESCAGEM da Fase 0 — MECANISMO ESTRUTURAL. node tests/repechage.test.js
 *
 * SUPERSEDE a versão anterior deste arquivo (decisão do dono, 25/jul, depois do
 * torneio de casais). O que mudou e por quê:
 *
 *  ANTES — repescagem por MELHOR DERROTADO: a vaga nascia como `repFill` e só era
 *  preenchida depois da R1 fechar, por `_resolveRepFills`, escolhendo o derrotado
 *  com melhor saldo. Quem seria repescado só se sabia no fim da rodada.
 *
 *  AGORA — repescagem ESTRUTURAL: o desenho é função pura de (N, formato)
 *  (js/views/chaves.js). No sorteio já se sabe que o seed #4 enfrenta o perdedor
 *  de um jogo NOMEADO da R1, escolhido na METADE OPOSTA da chave. Não há vaga
 *  pendente, não há ranqueamento posterior, não há `repFill` na eliminatória.
 *
 *  E QUANDO há repescagem: quem manda é a LÓGICA, não o organizador — aplica-se o
 *  que exige MENOS intervenção (o menor entre vagas B−N e perdedores N−B/2;
 *  empate vai pra bye). Por isso N=12 e N=13 NÃO têm repescagem nenhuma.
 *
 * O que este arquivo trava: (1) a escolha bye × repescagem segue a regra do menor;
 * (2) o perdedor do jogo-fonte chega mesmo na vaga, jogando com o motor REAL; e
 * (3) ele NÃO é duplicado — não ocupa dois slots ao mesmo tempo (esse double-book
 * foi a raiz do auto-confronto Time X vs X que quebrou ao vivo na 1.5.5).
 */
const { window: W } = require('./headless.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const C = W._chaves, A = W._chavesAdapter;
const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'P' + (i + 1), uid: 'u' + (i + 1) }));
const isBye = (x) => !x || x === 'TBD' || /BYE/.test(String(x));

console.log('\n== 1) a escolha bye × repescagem segue a regra do MENOR esforço ==');
[[5, 'repescagem'], [9, 'repescagem'], [10, 'repescagem'], [11, 'repescagem'],
 [12, 'bye'], [13, 'bye'], [14, 'bye'], [8, 'bye'], [16, 'bye']].forEach(function (par) {
  var n = par[0], esperado = par[1];
  var p = C.plano(n);
  ok(p.modo === esperado, `N=${n}: modo=${p.modo}, esperado ${esperado} (vagas=${p.vagas}, perdedores=${p.pool})`);
  // o total de intervenções é sempre `vagas` — o que a regra escolhe é a MISTURA
  ok(p.byes + p.repescagens === p.vagas, `N=${n}: byes(${p.byes}) + reps(${p.repescagens}) = vagas(${p.vagas})`);
});
// empate vai pra bye, explicitamente (N=12: vagas=4, perdedores=4)
ok(C.plano(12).repescagens === 0, 'N=12 (empate vagas × perdedores) resolve por BYE, não por repescagem');

console.log('== 2) o perdedor do jogo-fonte CHEGA na vaga de repescagem (motor real) ==');
[5, 9, 10, 11].forEach(function (n) {
  var built = A.build(n, 'simples', { participantes: parts(n) });
  var t = { id: 'r', format: 'Eliminatórias Simples', matches: built.matches };

  var vagas = t.matches.filter(function (m) { return m.isRepechageSlot; });
  ok(vagas.length === C.plano(n).repescagens,
    `N=${n}: ${vagas.length} vaga(s) de repescagem, esperado ${C.plano(n).repescagens}`);

  // a vaga é alimentada por um jogo NOMEADO já no sorteio (loserNextMatchId)
  var fontes = t.matches.filter(function (m) { return m.loserNextMatchId; });
  ok(fontes.length === vagas.length, `N=${n}: cada vaga tem um jogo-fonte declarado no sorteio`);

  // joga o jogo-fonte e confere que o PERDEDOR aterrissou na vaga
  fontes.forEach(function (src) {
    var alvo = t.matches.filter(function (m) { return m.id === src.loserNextMatchId; })[0];
    ok(!!alvo, `N=${n}: jogo-fonte ${src.id} aponta pra vaga inexistente ${src.loserNextMatchId}`);
    if (!alvo) return;
    var perdedor = src.p2;
    src.winner = src.p1;
    W._advanceWinner(t, src);
    ok(alvo.p1 === perdedor || alvo.p2 === perdedor,
      `N=${n}: perdedor de ${src.id} (${perdedor}) não chegou na vaga ${alvo.id} (${alvo.p1} x ${alvo.p2})`);
  });
});

console.log('== 3) o repescado NÃO é duplicado (raiz do auto-confronto) ==');
[5, 9, 10, 11].forEach(function (n) {
  var built = A.build(n, 'simples', { participantes: parts(n) });
  var t = { id: 'r', format: 'Eliminatórias Simples', matches: built.matches };
  var guard = 0;
  for (;;) {
    if (++guard > 3000) break;
    var m = t.matches.find(function (x) { return !x.winner && !isBye(x.p1) && !isBye(x.p2); });
    if (!m) break;
    ok(m.p1 !== m.p2, `N=${n}: ${m.id} — ${m.p1} enfrentaria a si mesmo`);
    m.winner = m.p1;
    W._advanceWinner(t, m);
  }
  // Ninguém ocupa dois slots SIMULTÂNEOS na mesma rodada.
  //
  // A vaga de repescagem é EXCLUÍDA desta conta de propósito: quem é repescado
  // aparece mesmo duas vezes na rodada 1 — no jogo normal que perdeu e, depois,
  // na repescagem. Não é double-book, é sequência: a repescagem consome o
  // perdedor de um jogo normal, então só pode ser jogada DEPOIS dele (é por isso
  // que chaves.js ordena os normais antes das repescagens). O double-book de
  // verdade — a mesma pessoa em dois jogos que rolam ao mesmo tempo — é o que
  // gerava o auto-confronto, e é o que esta conta pega.
  var porRodada = {};
  t.matches.forEach(function (m) {
    if (m.isRepechageSlot) return;
    if (isBye(m.p1) && isBye(m.p2)) return;
    (porRodada[m.round] = porRodada[m.round] || []).push(m.p1, m.p2);
  });
  Object.keys(porRodada).forEach(function (r) {
    var reais = porRodada[r].filter(function (x) { return !isBye(x); });
    ok(new Set(reais).size === reais.length,
      `N=${n} rodada ${r}: alguém ocupa DOIS slots simultâneos (double-book) → [${reais.join(', ')}]`);
  });
  // E o repescado entra na vaga UMA vez só (não em duas vagas diferentes).
  var ocupantesDeVaga = [];
  t.matches.forEach(function (m) {
    if (!m.isRepechageSlot) return;
    [m.p1, m.p2].forEach(function (x) { if (!isBye(x) && x) ocupantesDeVaga.push(x); });
  });
  ok(new Set(ocupantesDeVaga).size === ocupantesDeVaga.length,
    `N=${n}: alguém foi repescado para DUAS vagas → [${ocupantesDeVaga.join(', ')}]`);
});

console.log('\n' + (fail === 0 ? '✅ repechage: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
