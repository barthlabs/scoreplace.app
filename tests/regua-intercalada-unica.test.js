/* UMA RÉGUA SÓ, INTERCALADA — e ela sai dos PONTOS, não do gênero.
 *
 * Decisão do dono (17/ago/2026): "a regua intercalada me parece ser mais rica e dar o vies
 * da pessoa se ela esta mais perto da categoria de cima ou da de baixo. ela nao perde em
 * nada e poderia ser adotada geral C+, C-, D+, D- etc."
 *
 * O QUE ISTO CORRIGE: a escada era escolhida por GÊNERO — masculina intercalada, feminina
 * fixa. Gênero servia de proxy pra SÉRIE do ranking (social usa D+/C-, competitivo usa
 * D/C), e o proxy não vale. Apurado nos 13 docs: 9 jogam só SOCIAL, 1 só COMPETITIVO, 3 as
 * DUAS. Todo homem era medido pela régua do social e toda mulher pela do competitivo.
 *
 * Roda com: node tests/regua-intercalada-unica.test.js
 */
const fs = require('fs'); const path = require('path');
const store = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
let falhas = 0, testes = 0;
function ok(c, m) { testes++; if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } }

const i = store.indexOf('window.SP_ESCADA');
const f = store.indexOf('\n\n', store.indexOf('window._lzBandaLetra'));
ok(i > 0 && f > i, 'a régua vive no store.js (fonte única)');
const w = {}; new Function('window', store.slice(i, f))(w);

// os casos REAIS medidos em produção
[[1450, 'D+'], [1478, 'D+'], [1493, 'D+'], [1605, 'C+'], [1613, 'C+'], [1630, 'C+'], [1672, 'B-']]
  .forEach(([p, esperado]) => ok(w._lzBanda(p) === esperado, p + ' pontos → ' + esperado + ' (veio: ' + w._lzBanda(p) + ')'));

// ⚠️ o VIÉS é o ganho: as duas metades de uma faixa têm que existir e ser distinguíveis
ok(w._lzBanda(1530) === 'C-' && w._lzBanda(1650) === 'C+',
   'quem entrou na C e quem está encostando na B recebem rótulos DIFERENTES');
ok(w._lzBanda(1400) === 'D-' && w._lzBanda(1500) === 'D+', 'idem na faixa D');
ok(w._lzBanda(1300) === 'FUN' && w._lzBanda(1900) === 'A', 'as pontas continuam sem sinal');

// a letra cheia continua disponível — é ela que compara com categoria de inscrição
ok(w._lzBandaLetra(1672) === 'B' && w._lzBandaLetra(1605) === 'C' && w._lzBandaLetra(1450) === 'D',
   'a letra sem sinal sai da mesma fonte (pra comparar com a categoria da inscrição)');

// ⚠️ e o que NÃO pode voltar: régua escolhida por gênero
ok(!/beach-fem|beach-masc/.test(store.slice(i, f)), 'a régua não conhece gênero nenhum');
ok(w._lzBanda(null) === null && w._lzBanda('x') === null && w._lzBanda(NaN) === null,
   'sem pontos não se inventa faixa');

// a escada tem que ser monotônica — um ponto a mais nunca pode dar faixa mais fraca
const nomes = w.SP_ESCADA.map(e => e.nome);
ok(new Set(nomes).size === nomes.length, 'nenhuma faixa repetida');
let ant = -Infinity, cresce = true;
w.SP_ESCADA.forEach(e => { if (e.ate <= ant) cresce = false; ant = e.ate; });
ok(cresce, 'os limites são estritamente crescentes (mais pontos nunca dá faixa pior)');

console.log('\n' + (falhas ? '❌ ' + falhas + ' de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
process.exit(falhas ? 1 : 0);
