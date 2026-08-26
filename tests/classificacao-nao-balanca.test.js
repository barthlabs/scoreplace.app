/* A CLASSIFICAÇÃO NÃO PODE BALANÇAR (2.0.119)
 * node tests/classificacao-nao-balanca.test.js
 *
 * Relato do dono (26/ago): _"no meu grupo, quando jogamos eu estava em 3º e a Livia em 4º.
 * depois de arrumarmos algumas coisas essas posições se inverteram. agora voltou a ser como
 * foi logo quando jogamos."_ Consequência, na palavra dele: _"muda duplas e quem segue na
 * competição por qual caminho"_.
 *
 * ⛔ A CAUSA NÃO ERA O COMPARADOR — foi a primeira coisa que eu quis mexer, e teria sido
 * errado. `Math.random` já saiu dali um dia, e o arquivo carrega desde então a invariante
 * _"sem o mapa de ordem o critério é neutro — nunca volta a sortear na hora"_. Critério que
 * inventa desempate é justamente o que já deu problema.
 *
 * ⭐ A CAUSA ERA A ENTRADA: `Object.values(stats)` devolve na ordem em que as chaves
 * entraram no objeto, e `stats` é remontado de fontes diferentes conforme a tela (o
 * `standings` gravado, o recálculo dos jogos, o elenco). `Array.prototype.sort` é ESTÁVEL —
 * então, num empate que atravessa todos os critérios, quem decide é a ordem de chegada.
 * Ela muda, a posição vira. E volta.
 *
 * MEDIDO no grupo dele (R1 Grupo Q): Erika venceu os 3 jogos; ele, Livia e Loraine venceram
 * 1 cada; no saldo Loraine +1, e ELE e a LIVIA empatam em −3 com 1 vitória cada. Os dois só
 * se separam no ÚLTIMO critério — são exatamente o par que balançava.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const bl = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-logic.js'), 'utf8');

// ── ① a entrada do sort é canônica ──────────────────────────────────────────
const i = bl.indexOf('var _linhas = Object.values(stats)');
ok(i > 0, 'a tabela do grupo monta as linhas de `stats`');
const bloco = bl.slice(i, i + 400);
ok(/\.sort\(function \(x, y\)/.test(bloco),
  '⭐ e ORDENA por chave estável ANTES de comparar — sem isso a estabilidade do sort não ' +
  'significa nada e o empate total cai pro lado que o objeto entregou');
ok(/x\.uid \|\| x\.name/.test(bloco),
  '   pela identidade (uid, ou nome pra quem não tem conta)');

// ── ② e o comparador continua NEUTRO onde não tem dado ──────────────────────
/* ⛔ Esta metade é tão importante quanto a outra: a tentação era fazer o comparador
 * desempatar por identidade. Isso quebraria a invariante que existe desde que o
 * `Math.random` saiu dali — e o teste `desempate-do-organizador-vale` pega. */
const core = fs.readFileSync(path.join(ROOT, 'js', 'views', 'standings-core.js'), 'utf8');
const iCfg = core.indexOf('function standingsCompareConfig');
const cfg = core.slice(iCfg, core.indexOf('\n  }', iCfg));
ok(/return 0;/.test(cfg),
  '⛔ o comparador SEGUE devolvendo 0 quando os critérios se esgotam — quem resolve o ' +
  'empate é a entrada canônica, não um critério inventado');
ok(!/uid.*<.*uid|String\(ka\) < String\(kb\)/.test(cfg),
  '⛔ e NÃO desempata por identidade dentro do critério ("nunca volta a sortear na hora")');

// ── ③ a prova do comportamento, com o caso REAL do grupo dele ──────────────
const vm = require('vm');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(core, ctx, { filename: 'standings-core.js' });
const cmp = ctx.window._standingsCompareConfig;

// Erika 3 vitórias; Loraine +1 de saldo; Rodrigo e Livia empatados em −3 e 1 vitória
const linhas = [
  { uid: 'uErika',   name: 'Erika de Paula', points: 3, wins: 3, pointsDiff: 5,  played: 3 },
  { uid: 'uLoraine', name: 'Loraine Soares', points: 1, wins: 1, pointsDiff: 1,  played: 3 },
  { uid: 'uLivia',   name: 'Livia Morais',   points: 1, wins: 1, pointsDiff: -3, played: 3 },
  { uid: 'uRodrigo', name: 'Rodrigo Barth',  points: 1, wins: 1, pointsDiff: -3, played: 3 }
];
// a config REAL do Confra, e a ordem REAL da chave do grupo Q
const opts = { tiebreakers: ['pontos_avancados', 'confronto_direto', 'saldo_pontos', 'vitorias',
                             'buchholz', 'sonneborn_berger', 'antiguidade', 'sorteio'],
               ordem: { uErika: 0, uLivia: 1, uLoraine: 2, uRodrigo: 3 } };
const canon = (a) => a.slice().sort((x, y) => {
  const kx = String(x.uid || x.name), ky = String(y.uid || y.name);
  return kx < ky ? -1 : kx > ky ? 1 : 0;
});
const ordena = (a) => canon(a).sort((x, y) => cmp(x, y, opts)).map((r) => r.name).join(' > ');

// todas as 24 permutações da ENTRADA
const perm = (a) => a.length <= 1 ? [a] : a.flatMap((x, k) =>
  perm(a.slice(0, k).concat(a.slice(k + 1))).map((r) => [x].concat(r)));
const saidas = new Set(perm(linhas).map(ordena));
ok(saidas.size === 1,
  '⛔⛔ as 24 permutações da entrada dão UMA saída só (deu ' + saidas.size + ') — ' +
  'é isto que impede a posição de ir e voltar sem ninguém mexer em nada');
ok([...saidas][0] === 'Erika de Paula > Loraine Soares > Livia Morais > Rodrigo Barth',
  '⭐ e a ordem é a que o RETRATO CONGELADO do grupo já registrava: ' + [...saidas][0]);

console.log((fail ? '✗' : '✓') + ' classificacao-nao-balanca: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);
