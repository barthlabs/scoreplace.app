/* COLOCAÇÃO FINAL calculada da chave — node tests/lz-colocacao-final.test.js
 *
 * Pedido do dono (10/ago/2026), depois de ver "GRUPO 03 · 2º de 3" na tela:
 *   "a posicao no grupo nao revela nada. tem que considerar dentre todos os participantes
 *    que o vencedor da final foi campeao; que o perdedor da final foi segundo lugar; que os
 *    derrotados nas semifinais pegaram 3o/4o lugar; que a partir dai tem o 5o, 6o, 7o…
 *    precisa calcular isso já que o letzplay nao entrega."
 *
 * A FIXTURE É REAL: é a chave do "T&F Special Edition - torneio PAIS - Masculino - Bronze"
 * (letzplay tid 449729), lida dos prints do dono da página
 * /paineiras-bt/tournaments/449729/matches?page=2 — jogos #23 a #28, com placar e vencedor.
 * Nada inventado: os nomes, os números dos jogos e os placares são os que estão lá.
 */
const P = require('../js/views/letzplay-placement-core.js');

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✓ ' + m); }
  else { fail++; console.log('  ✗ ' + m + (extra ? '  [' + extra + ']' : '')); }
};
const dupla = (a, b) => ({ handles: [a.h, b.h].filter(Boolean), names: [a.n, b.n] });
const J = (n) => ({ n: n });

// ── os 8 atletas da chave (handles fictícios só onde o print não mostra o @) ──
const gersom = { n: 'Gersom Otsu', h: 'GersomOtsu' }, renato = { n: 'Renato Oshima', h: 'RenatoOshima' };
const kevin = { n: 'Kevin Bree', h: 'KevinBree' }, vlamir = { n: 'Vlamir Antequera', h: 'VlamirAntequera' };
const fabioR = { n: 'Fábio Ruggiero', h: 'FabioRuggiero' }, marcelo = { n: 'Marcelo Bemelmans', h: 'MarceloBemelmans' };
const arnaldo = { n: 'Arnaldo Menezes', h: 'ArnaldoMenezes' }, ragner = { n: 'Ragner Vianna', h: 'RagnerVianna' };
const gabriel = { n: 'Gabriel Campolongo', h: 'GabrielCampolongo' }, godinho = { n: 'Rodrigo Godinho', h: 'RodrigoGodinho' };
const stefan = { n: 'Stefan Krieger', h: 'StefanKrieger' }, wilson = { n: 'Wilson Jr', h: 'WilsonJr' };
const daniel = { n: 'Daniel Oliveira', h: 'DanielOliveira' }, ricardo = { n: 'Ricardo Pettená', h: 'RicardoPettena' };

const CHAVE_REAL = [
  // #23 QF — Gersom/Renato 1 x 6 Kevin/Vlamir
  { n: 23, phase: 'QF', sides: [Object.assign(dupla(gersom, renato), { score: 1 }),
                                Object.assign(dupla(kevin, vlamir), { score: 6 })] },
  // #24 QF — Fábio/Marcelo 5 x 6 Arnaldo/Ragner
  { n: 24, phase: 'QF', sides: [Object.assign(dupla(fabioR, marcelo), { score: 5 }),
                                Object.assign(dupla(arnaldo, ragner), { score: 6 })] },
  // #25 QF — Gabriel/Godinho 3 x 6 Stefan/Wilson
  { n: 25, phase: 'QF', sides: [Object.assign(dupla(gabriel, godinho), { score: 3 }),
                                Object.assign(dupla(stefan, wilson), { score: 6 })] },
  // #26 SF — Daniel/Ricardo 1 x 6 Kevin/Vlamir   (Daniel/Ricardo entraram por BYE)
  { n: 26, phase: 'SF', sides: [Object.assign(dupla(daniel, ricardo), { score: 1 }),
                                Object.assign(dupla(kevin, vlamir), { score: 6 })] },
  // #27 SF — Arnaldo/Ragner 2 x 6 Stefan/Wilson
  { n: 27, phase: 'SF', sides: [Object.assign(dupla(arnaldo, ragner), { score: 2 }),
                                Object.assign(dupla(stefan, wilson), { score: 6 })] },
  // #28 Final — Kevin/Vlamir 4 x 6 Stefan/Wilson
  { n: 28, phase: 'Final', sides: [Object.assign(dupla(kevin, vlamir), { score: 4 }),
                                   Object.assign(dupla(stefan, wilson), { score: 6 })] }
];

const rot = (h) => P.doHandle(CHAVE_REAL, h).rotulo;

console.log('\n1. A chave REAL do T&F Bronze — o pódio sai da final pra trás');
ok(rot('StefanKrieger') === 'Campeão', 'quem venceu a final é Campeão (Stefan/Wilson)', rot('StefanKrieger'));
ok(rot('WilsonJr') === 'Campeão', 'e vale pros DOIS da dupla');
ok(rot('KevinBree') === 'Vice', 'quem perdeu a final é Vice (Kevin/Vlamir)', rot('KevinBree'));
ok(rot('VlamirAntequera') === 'Vice', 'idem pro parceiro');

console.log('\n2. Semifinais → 3º/4º (sem disputa de 3º, não se crava qual)');
ok(rot('DanielOliveira') === '3º/4º (semifinal)', 'quem perdeu a SF fica 3º/4º', rot('DanielOliveira'));
ok(rot('ArnaldoMenezes') === '3º/4º (semifinal)', 'o outro perdedor da SF idem', rot('ArnaldoMenezes'));

console.log('\n3. Quartas → a faixa acompanha quantos REALMENTE perderam ali');
// foram 3 QFs (uma vaga da SF veio por BYE) → 3 eliminados → 5º/7º, NÃO 5º/8º
ok(rot('GersomOtsu') === '5º/7º (quartas)', 'com 3 QFs a faixa é 5º/7º (o bye encolhe a faixa)', rot('GersomOtsu'));
ok(rot('FabioRuggiero') === '5º/7º (quartas)', 'idem');
ok(rot('GabrielCampolongo') === '5º/7º (quartas)', 'idem');

console.log('\n4. Quem não chegou na chave: fase de grupos (o caso do próprio dono)');
const eu = P.doHandle(CHAVE_REAL, 'RodrigoBarth');
ok(eu.conhecido && eu.chegouNaChave === false, 'quem não aparece na chave não recebe colocação inventada');
ok(eu.rotulo === 'Fase de grupos', 'e é rotulado "Fase de grupos"', eu.rotulo);

// ── regra do dono: quem caiu nos grupos também tem faixa, terminando no total ──
// "se o ultimo colocado que passou da fase de grupos ficou em 5o/7o, entao os que nao
// chegaram ai ficaram em ultimo a 8o (e o ultimo é o numero de participantes)"
{
  const comGrupos = CHAVE_REAL.concat([
    { n: 4, phase: 'Grupos', sides: [Object.assign(dupla({n:'Rodrigo Barth',h:'RodrigoBarth'}, {n:'Stefan Krieger',h:'StefanKrieger'}), { score: 1 }),
                                     Object.assign(dupla({n:'Ari Rabello',h:'AriRabello'}, {n:'Wilson Jr',h:'WilsonJr'}), { score: 6 })] }
  ]);
  const g = P.doHandle(comGrupos, 'RodrigoBarth', { totalTimes: 12 });
  ok(g.posMin === 8, 'a faixa dos grupos começa logo depois da chave (8º, porque a chave acabou em 7º)', 'posMin=' + g.posMin);
  ok(g.posMax === 12, 'e termina no total de participantes informado (12)', 'posMax=' + g.posMax);
  ok(g.rotulo === '8º/12º (fase de grupos)', 'com a fase entre parênteses', g.rotulo);
}

console.log('\n5. Ninguém empata com quem passou: as faixas não se sobrepõem');
const r = P.compute(CHAVE_REAL);
const faixas = r.times.map(t => [t.posMin, t.posMax]).sort((a, b) => a[0] - b[0]);
let sobrepoe = false;
for (let i = 1; i < faixas.length; i++) if (faixas[i][0] <= faixas[i - 1][1] && faixas[i][0] !== faixas[i - 1][0]) sobrepoe = true;
ok(!sobrepoe, 'faixas encadeadas sem sobreposição: 1, 2, 3–4, 5–7');
// 7 DUPLAS (14 atletas): 3 eliminadas nas quartas + 2 nas semis + vice + campeã.
// A 4ª vaga da semi veio por BYE, então não existe uma 8ª dupla — conferido nos jogos
// #23–#28 do print, que é a chave inteira.
ok(r.times.length === 7, 'as 7 duplas da chave foram posicionadas', 'achei ' + r.times.length);

console.log('\n6. Disputa de 3º, quando existe, DECIDE 3º e 4º');
const comTerceiro = CHAVE_REAL.concat([{ n: 29, phase: '3º lugar',
  sides: [Object.assign(dupla(daniel, ricardo), { score: 6 }), Object.assign(dupla(arnaldo, ragner), { score: 2 })] }]);
// a fase entre parênteses vale pra TODO mundo que não chegou à final (pedido do dono)
ok(P.doHandle(comTerceiro, 'DanielOliveira').rotulo === '3º (semifinal)', 'quem vence a disputa de 3º é 3º, com a fase',
   P.doHandle(comTerceiro, 'DanielOliveira').rotulo);
ok(P.doHandle(comTerceiro, 'ArnaldoMenezes').rotulo === '4º (semifinal)', 'e quem perde é 4º',
   P.doHandle(comTerceiro, 'ArnaldoMenezes').rotulo);

console.log('\n7. Não inventa: sem chave, sem resultado, fase desconhecida');
ok(P.doHandle([{ n: 1, phase: 'Grupos', sides: [dupla(gersom, renato), dupla(kevin, vlamir)] }],
   'GersomOtsu').conhecido === false, 'só fase de grupos → "sem-chave", não posiciona ninguém');
const semPlacar = [{ n: 28, phase: 'Final', sides: [dupla(kevin, vlamir), dupla(stefan, wilson)] }];
ok(P.compute(semPlacar).times.every(t => t.posMin == null), 'final sem placar não coroa ninguém');
ok(P.classificaFase('Repescagem X') === null, 'fase que não conhecemos não vira palpite');
ok(P.vencedor({ sides: [{ score: 6 }, { score: 6 }] }) === null, 'placar empatado não elege vencedor');

console.log('\n8. Identidade do time é por HANDLE (uid), nome só sem handle');
ok(P.timeKey({ handles: ['B', 'a'], names: ['x'] }) === P.timeKey({ handles: ['A', 'b'], names: ['y'] }),
   'ordem e caixa do handle não mudam o time');
ok(P.timeKey({ handles: [], names: ['Zé', 'Ana'] }) === P.timeKey({ handles: [], names: ['ana', 'zé'] }),
   'sem handle, casa por nome normalizado');
ok(P.timeKey({ handles: ['a'], names: ['x'] }) !== P.timeKey({ handles: [], names: ['x'] }),
   'quem tem handle nunca colide com quem não tem');

console.log('\n9. Torneio SEM a fase escrita: infere pela ORDEM (o último jogo é a final)');
// Dono: "pode ser que outros torneios nao tenham a fase escrita … de qualquer forma, os
// torneios devem ao menos ser organizados de forma que o ultimo jogo seja a final e a
// partir dai, voltando para tras temos as semis, quartas".
{
  const semFase = CHAVE_REAL.map(m => ({ n: m.n, sides: m.sides }));   // tira o phase
  const r2 = P.computeAuto(semFase);
  ok(r2.fasesInferidas === true, 'detecta que precisou inferir');
  const q = (h) => (r2.porHandle[h.toLowerCase()] || {}).rotulo;
  ok(q('StefanKrieger') === 'Campeão', 'infere o campeão pelo último jogo', q('StefanKrieger'));
  ok(q('KevinBree') === 'Vice', 'e o vice', q('KevinBree'));
  ok(q('ArnaldoMenezes') === '3º/4º (semifinal)', 'os 2 jogos anteriores viram semifinais', q('ArnaldoMenezes'));
  ok(q('GersomOtsu') === '5º/7º (quartas)', 'e os anteriores, quartas', q('GersomOtsu'));
}
{
  // ⚠️ o freio: pontos corridos NÃO tem final. Sem estrutura de chave, não rotula ninguém —
  // senão quem jogou por último viraria "campeão" só por ter jogado por último.
  const A={handles:['a'],names:['A']}, B={handles:['b'],names:['B']},
        C={handles:['c'],names:['C']}, D={handles:['d'],names:['D']};
  const corridos = [
    { n:1, sides:[Object.assign({},A,{score:6}), Object.assign({},B,{score:1})] },
    { n:2, sides:[Object.assign({},C,{score:6}), Object.assign({},D,{score:2})] },
    { n:3, sides:[Object.assign({},A,{score:6}), Object.assign({},C,{score:3})] },
    { n:4, sides:[Object.assign({},B,{score:6}), Object.assign({},D,{score:4})] }
  ];
  ok(P.inferirFases(corridos) === null, 'pontos corridos não vira chave inventada');
  ok(P.computeAuto(corridos).times.every(t => t.posMin == null), 'e ninguém recebe colocação');
}

console.log('\n10. A faixa é CALCULADA da chave — largura varia com o torneio');
// Dono: "os numeros nao sao esses, mas um exemplo de faixa. 3/4 5/16, sei la".
// Chave CHEIA de 16 duplas: 8 perdem nas oitavas, 4 nas quartas, 2 nas semis.
{
  const T = i => ({ handles: ['t' + i], names: ['T' + i] });
  const jogo = (n, phase, a, b, ga, gb) =>
    ({ n, phase, sides: [Object.assign({}, T(a), { score: ga }), Object.assign({}, T(b), { score: gb })] });
  const cheia = [];
  // oitavas: 1..16 → ímpares vencem
  for (let k = 0; k < 8; k++) cheia.push(jogo(k + 1, 'R16', 2 * k + 1, 2 * k + 2, 6, 1));
  // quartas: 1,3,5,7,9,11,13,15 → 1,5,9,13 vencem
  cheia.push(jogo(9, 'QF', 1, 3, 6, 1));  cheia.push(jogo(10, 'QF', 5, 7, 6, 1));
  cheia.push(jogo(11, 'QF', 9, 11, 6, 1)); cheia.push(jogo(12, 'QF', 13, 15, 6, 1));
  cheia.push(jogo(13, 'SF', 1, 5, 6, 1));  cheia.push(jogo(14, 'SF', 9, 13, 6, 1));
  cheia.push(jogo(15, 'Final', 1, 9, 6, 1));
  const q = h => (P.compute(cheia).porHandle[h] || {}).rotulo;
  ok(q('t1') === 'Campeão', 'campeão', q('t1'));
  ok(q('t9') === 'Vice', 'vice', q('t9'));
  ok(q('t5') === '3º/4º (semifinal)', '2 perdedores de semi → 3º/4º', q('t5'));
  ok(q('t3') === '5º/8º (quartas)', '4 perdedores de quartas → 5º/8º', q('t3'));
  ok(q('t2') === '9º/16º (oitavas)', '8 perdedores de oitavas → 9º/16º', q('t2'));
}

console.log('\n' + (fail ? '✗' : '✅') + ' lz-colocacao-final: ' + pass + ' passaram, ' + fail + ' falharam');
if (fail) process.exit(1);
