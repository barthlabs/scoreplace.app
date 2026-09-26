'use strict';
/* A POLÍTICA AUSENTE É A DE HOJE — e nenhum torneio existente muda de desenho.
 * node tests/politica-ausente-e-a-de-hoje.test.js
 *
 * ⛔⛔ POR QUE ESTE ARQUIVO EXISTE: o bloco 7 acrescentou um TERCEIRO parâmetro ao motor da chave.
 * Os 78 torneios que existem no banco não têm o campo `politicaDaChave`, e nenhum deles pode acordar
 * com outro desenho porque eu mexi no motor. O risco não é teórico: a política nova mexe na
 * TOPOLOGIA (o bye tem play-in, a sobra única não normaliza a 2ª rodada), então um vazamento do
 * caminho novo para o caminho antigo trocaria a chave de torneio em andamento.
 *
 * ⛔ O QUE SE TRAVA, e é mais forte que "o objeto é igual":
 *   ① `plano(N, formato)` e `plano(N, formato, 'repescagem')` respondem os MESMOS campos com os
 *      MESMOS valores — os três campos novos (`politica`, `jogosReais`, `esperamNoPlayin`) existem nos
 *      dois lados, porque os dois passam pelo mesmo caminho;
 *   ② `chave(N, formato)` produz EXATAMENTE os mesmos ids de jogo — que é o que re-ancora resultado
 *      já lançado. Id diferente é resultado órfão, e foi o defeito que criou `chaves.js`;
 *   ③ valor de política desconhecido cai em `repescagem` em vez de inventar desenho. Documento antigo,
 *      campo escrito errado à mão, ou versão futura que este código não conhece — em nenhum caso a
 *      chave pode virar outra coisa em silêncio.
 *
 * ⚠️ As duas suítes grandes da chave (`chaves-aceite`, `chaves-stress`, 25.804 asserções) continuam
 * sem UMA linha alterada de propósito: elas chamam o motor sem política, então passarem é a prova
 * independente deste arquivo.
 */
const path = require('path');
const C = require(path.join(__dirname, '..', 'js', 'views', 'chaves.js'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── a política ausente é a de hoje ────\n');

const FORMATOS = ['simples', 'dupla'];

FORMATOS.forEach(function (f) {
  for (let N = 2; N <= 64; N++) {
    /* ① o plano inteiro, campo por campo */
    const semArg = C.plano(N, f);
    const comRep = C.plano(N, f, 'repescagem');
    ok(JSON.stringify(semArg) === JSON.stringify(comRep),
      'N=' + N + ' ' + f + ': plano sem política != plano com "repescagem"');
    ok(semArg.politica === 'repescagem',
      'N=' + N + ' ' + f + ': o plano sem argumento se declara "repescagem" (e não vazio)');

    /* ② os IDS da chave, que são o que re-ancora resultado lançado */
    const a = C.chave(N, f);
    const b = C.chave(N, f, 'repescagem');
    ok(JSON.stringify(a.ordem) === JSON.stringify(b.ordem),
      'N=' + N + ' ' + f + ': a ordem dos jogos mudou');
    ok(JSON.stringify(Object.keys(a.porId).sort()) === JSON.stringify(Object.keys(b.porId).sort()),
      'N=' + N + ' ' + f + ': o conjunto de ids mudou');
    ok(a.totalJogos === b.totalJogos, 'N=' + N + ' ' + f + ': total de jogos mudou');

    /* ③ política desconhecida NÃO inventa desenho */
    ['', null, undefined, 'BYE', 'sobra', 'repescagem ', 'qualquer-coisa', 0, {}].forEach(function (lixo) {
      const p = C.plano(N, f, lixo);
      ok(p.politica === 'repescagem',
        'N=' + N + ' ' + f + ': política ' + JSON.stringify(lixo) + ' devia cair em repescagem');
      ok(JSON.stringify(p) === JSON.stringify(semArg),
        'N=' + N + ' ' + f + ': política ' + JSON.stringify(lixo) + ' mudou o plano');
    });
  }
});

/* ── E AS DUAS NOVAS SÃO DE FATO DIFERENTES ────────────────────────────────────
 * ⛔ Sem esta parte o arquivo teria um falso verde perfeito: se as três políticas caíssem todas em
 * repescagem, TUDO acima passaria e o bloco 7 não existiria. A diferença tem de ser medida. */
let diferemBye = 0, diferemSobra = 0;
for (let N = 2; N <= 64; N++) {
  const base = JSON.stringify(C.plano(N, 'simples').rodadas.filter((r) => r.fase === 'VC').map((r) => r.E));
  if (JSON.stringify(C.plano(N, 'simples', 'bye').rodadas.filter((r) => r.fase === 'VC').map((r) => r.E)) !== base) diferemBye++;
  if (JSON.stringify(C.plano(N, 'simples', 'sobra_unica').rodadas.filter((r) => r.fase === 'VC').map((r) => r.E)) !== base) diferemSobra++;
}
/* ⛔ OS NÚMEROS SÃO MEDIDOS, E JÁ MUDARAM DUAS VEZES NUM DIA — porque o DESENHO mudou duas vezes, não
 * porque eu chutei (chutei uma vez, no começo, e o teste pegou). Remedir a cada mudança de desenho é a
 * regra; deixar número velho num teste verde é o que faz o teste mentir.
 *
 * · BYE coincide com repescagem em 6 casos: N = 2, 4, 8, 16, 32, 64 — em potência de 2 não há
 *   excedente, não há preliminar, e o desenho é o mesmo halving. ⇒ 63 − 6 = 57.
 * · SOBRA ÚNICA coincide em 11 casos: as 6 potências de 2 MAIS N = 3, 7, 15, 31, 63. Em N = 2^k − 1 a
 *   1ª rodada produz teto(N/2) = 2^(k−1) vencedoras, que JÁ é potência de 2 — a normalização da 2ª
 *   rodada da repescagem não tem o que acrescentar, e os dois desenhos descem igual. ⇒ 63 − 11 = 52. */
ok(diferemBye === 57, 'o bye difere da repescagem em 57 dos 63 N (achei ' + diferemBye + ')');
ok(diferemSobra === 52, 'a sobra única difere da repescagem em 52 dos 63 N (achei ' + diferemSobra + ')');
[3, 7, 15, 31, 63].forEach(function (N) {
  const chain = (p) => JSON.stringify(C.plano(N, 'simples', p).rodadas.filter((r) => r.fase === 'VC').map((r) => r.E));
  ok(chain('sobra_unica') === chain('repescagem'),
    'N=' + N + ' (2^k−1): a 1ª rodada já entrega potência de 2, os dois desenhos descem igual');
});

/* ── A SOBRA ÚNICA NÃO TEM RODADA DE ENTRADA ──────────────────────────────────
 * ⛔⛔ Ordem do dono, depois de eu ter inventado uma: _"sobra unica é sobra unica porra"_, _"nao tem
 * rodada de entrada"_. TODAS jogam a estreia, em todo N. É o que separa este desenho do bye, onde a
 * estreia é um play-in de poucos. */
for (let N = 4; N <= 64; N++) {
  const vc = C.plano(N, 'simples', 'sobra_unica').rodadas.filter(function (r) { return r.fase === 'VC'; });
  ok(vc[0].E === N, 'N=' + N + ': ⛔ na sobra única TODAS jogam a estreia (achei ' + vc[0].E + ' de ' + N + ')');
  ok(!vc.some(function (r) { return r.entrada === true; }),
    'N=' + N + ': ⛔ e não existe rodada de entrada neste desenho');
}
/* ⚠️ E A CONSEQUÊNCIA MEDIDA, que fica MARCADA e não escondida: em 30 dos 61 N a penúltima rodada tem
 * TRÊS entrantes. Ali não existe 4º colocado, então não existe jogo de "3º contra 4º" — o 3º colocado é
 * quem perde o último jogo decidido. O 3º EXISTE; falta a tela derivá-lo da chave. Leva 7.3. */
let semiDeTres = 0;
for (let N = 4; N <= 64; N++) {
  const vc = C.plano(N, 'simples', 'sobra_unica').rodadas.filter(function (r) { return r.fase === 'VC'; });
  if (vc[vc.length - 2].E === 3) semiDeTres++;
}
ok(semiDeTres === 30,
  '⚠️ em 30 dos 61 N a penúltima rodada tem TRÊS — sem 4º para disputar (achei ' + semiDeTres + ')');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
