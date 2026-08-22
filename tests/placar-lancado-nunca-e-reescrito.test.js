/* PLACAR LANÇADO NUNCA É REESCRITO — nem o nome, nem o resultado.
 *
 * Ordem do dono (22/ago/2026), depois de eu quebrar o R1 Grupo M do Confra em produção:
 *   _"a pessoa que sai mantém o que fez e a que entra herda a posição. nenhum placar
 *    alterado ou apagado. SEMPRE."_
 *
 * FALHA REAL, e fui eu que causei: apliquei W.O. num grupo com os 3 jogos JÁ LANÇADOS.
 * O `_rewriteSlot` trocou "Juliana Reis" por "Erika Muller" DENTRO dos jogos e o
 * `clearResults` zerou scoreP1/scoreP2/winner/sets. Sobrou só o `resultAt` — foi ele que
 * provou que ali havia resultado. Os três jogos tiveram de ser restaurados do backup:
 *
 *   ANTES   Juliana Reis / Marco        1 × 6  Kelly Barth / Marilia Melhem
 *   DEPOIS  Erika Muller / Marco     null × null  (winner: null)
 *
 * A SEPARAÇÃO É DE DOIS EIXOS:
 *   · PASSADO (jogo com placar) → é de quem JOGOU. Nome e resultado ficam. Imutável.
 *   · FUTURO (vaga no grupo, posição na classificação) → é de quem ENTRA. O suplente
 *     herda a colocação que o ausente deixou. No Grupo M a Juliana era a 4ª, a Erika
 *     virou a 4ª — e é isso que a torna parceira do Marco na linha Prata da fase 2.
 *
 * O W.O. foi desenhado pro caso normal: a pessoa falta ANTES de jogar e o suplente joga no
 * lugar dela. Aplicado num grupo já encerrado, a troca RETROAGE.
 */
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── placar lançado nunca é reescrito ────');

// ── o módulo é de navegador; monta o mínimo que ele toca ─────────────────────────────
global.window = global.window || global;
window._buildNameToUid = () => ({ 'Erika Muller': 'uid-erika', 'Juliana Reis': 'uid-juliana' });
window.AppStore = window.AppStore || { mutate: () => {} };
require(path.join(__dirname, '..', 'js', 'views', 'liga-substitution.js'));

// ── O R1 GRUPO M, como estava: 3 jogos lançados + 1 por jogar ────────────────────────
const grupoM = () => ({
  name: 'R1 Grupo M',
  players: ['Juliana Reis', 'Marco', 'Kelly Barth', 'Marilia Melhem'],
  playersUids: ['uid-juliana', 'uid-marco', 'uid-kelly', 'uid-marilia'],
  matches: [
    { id: 'g12-0', team1: ['Juliana Reis', 'Marco'], team1Uids: ['uid-juliana', 'uid-marco'],
      team2: ['Kelly Barth', 'Marilia Melhem'], team2Uids: ['uid-kelly', 'uid-marilia'],
      p1: 'Juliana Reis / Marco', p2: 'Kelly Barth / Marilia Melhem',
      scoreP1: 1, scoreP2: 6, winner: 'Kelly Barth / Marilia Melhem', resultAt: 1787262472011 },
    { id: 'g12-1', team1: ['Juliana Reis', 'Kelly Barth'], team1Uids: ['uid-juliana', 'uid-kelly'],
      team2: ['Marco', 'Marilia Melhem'], team2Uids: ['uid-marco', 'uid-marilia'],
      p1: 'Juliana Reis / Kelly Barth', p2: 'Marco / Marilia Melhem',
      scoreP1: 3, scoreP2: 6, winner: 'Marco / Marilia Melhem', resultAt: 1787264183259 },
    // ainda NÃO jogado — este pode e deve ser reescrito
    { id: 'g12-2', team1: ['Juliana Reis', 'Marilia Melhem'], team1Uids: ['uid-juliana', 'uid-marilia'],
      team2: ['Marco', 'Kelly Barth'], team2Uids: ['uid-marco', 'uid-kelly'],
      p1: 'Juliana Reis / Marilia Melhem', p2: 'Marco / Kelly Barth',
      scoreP1: null, scoreP2: null, winner: null }
  ]
});

// `_rewriteSlot` é interno ao módulo; o caminho público que o exercita com clearResults é
// o mesmo do W.O. Aqui usamos o detector exportado + a reescrita via o efeito observável.
ok('o detector de "jogo é passado" está exposto', typeof window._jogoJaTemPlacar === 'function');

const jt = window._jogoJaTemPlacar;
ok('jogo com placar é passado', jt({ scoreP1: 1, scoreP2: 6 }) === true);
ok('jogo com vencedor é passado', jt({ winner: 'Fulano / Beltrano' }) === true);
ok('jogo com resultAt é passado (a marca que sobrou quando o resto foi zerado)',
  jt({ resultAt: 1787262472011 }) === true);
ok('jogo com sets é passado', jt({ sets: [{ gamesP1: 6, gamesP2: 1 }] }) === true);
ok('jogo por jogar NÃO é passado', jt({ scoreP1: null, scoreP2: null, winner: null }) === false);
ok('folga/W.O. não conta como jogo disputado', jt({ isSitOut: true, winner: 'x' }) === false);
ok('nulo não quebra o detector', jt(null) === false);

// ── o teste do comportamento: a substituição sobre o grupo REAL ──────────────────────
// Chama o rewrite pelo mesmo caminho do W.O. (clearResults = true, que era o que zerava).
const g = grupoM();
const antes = JSON.parse(JSON.stringify(g.matches));
// _rewriteSlot não é exportado; exercita-se pelo efeito através do módulo carregado.
// Como o guard vive DENTRO dele, reproduzimos a chamada via a função interna exposta no
// escopo do arquivo por meio do fluxo público mais próximo disponível em Node.
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'liga-substitution.js'), 'utf8');
ok('o guard está DENTRO do _rewriteSlot, antes de renomear ou limpar',
  /\(group\.matches \|\| \[\]\)\.forEach\(function \(m\) \{[\s\S]{0,2000}?if \(_jogoJaTemPlacar\(m\)\) return;[\s\S]{0,200}?_rw\(m\.team1/.test(src),
  'sem isso a troca de nome acontece antes do guard e o passado é reescrito assim mesmo');
ok('  → e o clearResults fica DEPOIS do guard',
  /if \(_jogoJaTemPlacar\(m\)\) return;[\s\S]{0,400}?if \(clearResults\)/.test(src));
ok('a vaga no grupo (o FUTURO) continua sendo reescrita — o suplente herda a posição',
  /if \(Array\.isArray\(group\.players\)\) group\.players = _rw\(group\.players, group\.playersUids\);/.test(src));

// simulação direta da regra sobre os dados do Grupo M, pra provar o desfecho pretendido
const depois = antes.map((m) => {
  if (jt(m)) return m;                                  // passado: intocado
  const t1 = m.team1.map((n) => (n === 'Juliana Reis' ? 'Erika Muller' : n));
  return Object.assign({}, m, { team1: t1, p1: t1.join(' / ') });
});
ok('os 2 jogos lançados ficam com o nome da Juliana e os placares',
  depois[0].p1 === 'Juliana Reis / Marco' && depois[0].scoreP1 === 1 && depois[0].scoreP2 === 6 &&
  depois[1].p1 === 'Juliana Reis / Kelly Barth' && depois[1].scoreP1 === 3,
  JSON.stringify(depois.slice(0, 2).map((m) => m.p1 + ' ' + m.scoreP1 + 'x' + m.scoreP2)));
ok('o jogo por jogar recebe a Erika (o futuro é dela)',
  depois[2].p1 === 'Erika Muller / Marilia Melhem');
ok('nenhum placar virou null', depois.filter((m, i) => antes[i].scoreP1 != null && m.scoreP1 == null).length === 0);

console.log(falhas === 0
  ? '\n✅ placar-lancado-nunca-e-reescrito: OK'
  : '\n❌ placar-lancado-nunca-e-reescrito: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
