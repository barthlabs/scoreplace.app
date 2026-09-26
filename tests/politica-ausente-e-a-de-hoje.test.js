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
/* ⛔ OS NÚMEROS SÃO MEDIDOS E TÊM EXPLICAÇÃO — eu havia CHUTADO 57 para os dois e os dois estavam
 * errados. Chute em asserção é pior que asserção nenhuma: vira vermelho que ninguém entende.
 *
 * · BYE coincide com repescagem em 6 casos: N = 2, 4, 8, 16, 32, 64. Em potência de 2 não há
 *   excedente, então não há play-in e o desenho é o mesmo halving. ⇒ 63 − 6 = 57.
 * · SOBRA ÚNICA coincide em 11 casos: as mesmas 6 potências de 2 MAIS N = 3, 7, 15, 31, 63. Em
 *   N = 2^k − 1 a primeira rodada produz teto(N/2) = 2^(k−1) vencedoras, que JÁ é potência de 2 — a
 *   normalização da 2ª rodada não tem o que acrescentar, e os dois desenhos descem igual. ⇒ 63 − 11 = 52. */
ok(diferemBye === 57, 'o bye difere da repescagem em 57 dos 63 N (achei ' + diferemBye + ')');
ok(diferemSobra === 52, 'a sobra única difere da repescagem em 52 dos 63 N (achei ' + diferemSobra + ')');
/* ⛔ E a coincidência é NOMEADA, não estatística: se um dia N=2^k−1 deixar de coincidir, quero saber
 * qual dos dois desenhos mudou. */
[3, 7, 15, 31, 63].forEach(function (N) {
  const chain = (p) => JSON.stringify(C.plano(N, 'simples', p).rodadas.filter((r) => r.fase === 'VC').map((r) => r.E));
  ok(chain('sobra_unica') === chain('repescagem'),
    'N=' + N + ' (2^k−1): a 1ª rodada já entrega potência de 2, os dois desenhos descem igual');
});

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);
