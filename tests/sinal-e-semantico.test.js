/* O "+" DIZ "É D, MAS ESTÁ BUSCANDO A C" — e só vale com desempenho sustentando.
 *
 * Definição do dono (17/ago/2026), sobre a Kelly: "na verdade a Kelly seria D+ já que no
 * social disputa C e torneios em D". Ranking na C + torneio na D NÃO são duas categorias:
 * são UMA. E o sinal não é de graça — "se perde tudo na C, mas tambem na D seria D. Se
 * ganha muito na D e na C oscila ganhando umas e perdendo outras reforça o D+".
 *
 * ⚠️ Distinto de `_lzBanda`, que fatia a faixa por PONTOS. Este sinal sai da relação entre
 * onde a pessoa DISPUTA e onde ela SE SUSTENTA.
 *
 * Roda com: node tests/sinal-e-semantico.test.js
 */
const fs = require('fs'); const path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'js/store.js'), 'utf8');
let falhas = 0, testes = 0;
function ok(c, m) { testes++; if (c) console.log('  ✓ ' + m); else { falhas++; console.log('  ✗ ' + m); } }

const i = s.indexOf('window.SP_SINAL_MIN');
const f = s.indexOf('\n\n// ── LEITURA FEITA POR MOTOR VELHO');
ok(i > 0 && f > i, 'a regra vive no store.js (fonte única)');
const w = {}; new Function('window', s.slice(i, f))(w);
const cat = (d) => w._lzCategoriaComSinal(d);

// ── os três casos que o dono descreveu, nas palavras dele ──────────────────────────
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
        { categoria: 'D', tipo: 'torneio', wins: 9, losses: 2 }]).rotulo === 'D+',
   'Kelly: ranking na C oscilando + torneio na D ganhando → D+');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 9 },
        { categoria: 'D', tipo: 'torneio', wins: 1, losses: 8 }]).rotulo === 'D',
   'perde tudo na C E também na D → D (o "+" não se sustenta)');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 8, losses: 2 },
        { categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 }]).rotulo === 'D',
   'quem só joga a D não ganha sinal por ganhar lá');

// ── ⚠️ o sinal NÃO é de graça: inscrever-se acima não basta ────────────────────────
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 1, losses: 1 },
        { categoria: 'D', tipo: 'torneio', wins: 7, losses: 1 }]).rotulo === 'D',
   'disputar a de cima SEM volume não vira "+" (2 jogos não provam nada)');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 6 },
        { categoria: 'D', tipo: 'torneio', wins: 9, losses: 0 }]).rotulo === 'D',
   'volume na de cima mas sem ganhar nada → sem sinal');

// ── a BASE é o torneio (é lá que a elegibilidade morde) ────────────────────────────
const k = cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
               { categoria: 'D', tipo: 'torneio', wins: 9, losses: 2 }]);
ok(k.categoria === 'D', 'a base é a categoria de TORNEIO, não a de ranking');
ok(k.acimaJogos === 13 && k.acimaPct === 46,
   'e o porquê fica legível (13 jogos acima, 46%) — não é caixa-preta');

// ── casos de borda ────────────────────────────────────────────────────────────────
ok(cat([]) === null && cat(null) === null, 'sem disputa nenhuma não se inventa categoria');
ok(cat([{ categoria: 'lixo', tipo: 'torneio', wins: 3, losses: 1 }]) === null,
   'rótulo que não é categoria é ignorado');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 5, losses: 5 }]).categoria === 'C',
   'sem torneio nenhum, a base vem do que houver');
ok(cat([{ categoria: 'B', tipo: 'ranking', wins: 5, losses: 4 },
        { categoria: 'D', tipo: 'torneio', wins: 8, losses: 1 }]).rotulo === 'D+',
   'disputar DUAS acima também dá "+" (não existe "++")');

console.log('\n' + (falhas ? '❌ ' + falhas + ' de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
process.exit(falhas ? 1 : 0);
