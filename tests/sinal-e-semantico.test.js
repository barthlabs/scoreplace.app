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
// "se perde tudo na C, mas tambem na D seria D" — o que essa frase garante é que o "+"
// NÃO se sustenta. Com a regra de base (dita depois), perder quase tudo na D também é
// estar na base da categoria, então o rótulo honesto é D- — e as duas coisas convivem.
{
  const r = cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 9 },
                 { categoria: 'D', tipo: 'torneio', wins: 1, losses: 8 }]);
  ok(r.sinal !== '+', 'perde tudo na C E na D → NÃO ganha "+" (era o ponto da regra)');
  ok(r.categoria === 'D' && r.rotulo === 'D-', 'e como está na base da própria, leva "-"');
}
// ⚠️ CORREÇÃO DO DONO, no mesmo dia: "se ganhar tudo na D ganha o + sim. se estiver no
// topo da tabela ganha o + da mesma forma se estiver na base ganha o -". A versão anterior
// deste teste afirmava o contrário — quem domina a própria categoria ficava SEM sinal, e é
// justamente quem está de saída dela.
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 8, losses: 2 },
        { categoria: 'D', tipo: 'torneio', wins: 5, losses: 1 }]).rotulo === 'D+',
   'ganhar quase tudo na PRÓPRIA categoria também dá "+"');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 5, losses: 4, pos: 2, total: 30 }]).rotulo === 'D+',
   'topo da tabela dá "+" mesmo com aproveitamento equilibrado');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 2, losses: 7, pos: 28, total: 30 }]).rotulo === 'D-',
   'base da tabela dá "-"');
ok(cat([{ categoria: 'D', tipo: 'torneio', wins: 1, losses: 9 }]).rotulo === 'D-',
   'perder quase tudo na própria categoria dá "-"');
ok(cat([{ categoria: 'D', tipo: 'ranking', wins: 5, losses: 5, pos: 15, total: 30 }]).rotulo === 'D',
   'meio da tabela e equilibrado fica SEM sinal (nem tudo tem sinal)');
// "+" vence "-": subida manda sobre um aproveitamento ruim pontual
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 6, losses: 7 },
        { categoria: 'D', tipo: 'torneio', wins: 1, losses: 9 }]).sinal === '+',
   'quem busca a de cima não leva "-" pelo desempenho na de baixo');
// e o PORQUÊ tem que ser legível — sinal sem motivo é caixa-preta
ok(cat([{ categoria: 'D', tipo: 'torneio', wins: 9, losses: 1 }]).porque === 'domina a própria',
   'o motivo do sinal vem junto');

// ── ⚠️ o sinal NÃO é de graça: inscrever-se acima não basta ────────────────────────
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 1, losses: 1 },
        { categoria: 'D', tipo: 'torneio', wins: 4, losses: 4 }]).rotulo === 'D',
   'disputar a de cima SEM volume não vira "+" (2 jogos não provam nada)');
ok(cat([{ categoria: 'C', tipo: 'ranking', wins: 0, losses: 6 },
        { categoria: 'D', tipo: 'torneio', wins: 4, losses: 4 }]).rotulo === 'D',
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
