/* Cabeças de chave Ouro/Prata — a campanha é da DUPLA, e as duas melhores
 * precisam ficar em metades opostas da árvore. Exercita o caminho real:
 * classificação → pares fixos → buildPhaseBrackets → chaves-adapter. */
const E = require('../js/views/phases-engine.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.error('  ✗ ' + msg); } }
function eq(actual, expected, msg) {
  ok(JSON.stringify(actual) === JSON.stringify(expected), msg + '\n    esperado ' + JSON.stringify(expected) + '\n    veio     ' + JSON.stringify(actual));
}

function atleta(name, wins, saldoGames) {
  return {
    name, displayName: name, uid: 'uid-' + name,
    wins, losses: Math.max(0, 12 - wins), played: 12,
    setsWon: wins, setsLost: Math.max(0, 12 - wins),
    gamesWon: 100 + Math.max(0, saldoGames),
    gamesLost: 100 + Math.max(0, -saldoGames)
  };
}

// G1 tem a MELHOR pessoa isolada (10 vitórias), mas sua dupla soma -2 games.
// G2 soma +18 e é a verdadeira cabeça 1. A mesma diferença é montada na Prata.
const upperSaldo = [-2, 18, 16, 14, 12, 10, 8, 6];
const lowerSaldo = [2, 4, 6, 8, 10, 12, 18, 16];
const porGrupo = {};
const grupos = [];
for (let i = 1; i <= 8; i++) {
  const g = 'G' + i;
  porGrupo[g] = [
    atleta('O' + i + 'A', i === 1 ? 10 : 6, upperSaldo[i - 1] - 20),
    atleta('O' + i + 'B', 2, 20),
    atleta('P' + i + 'A', i === 1 ? 9 : 4, lowerSaldo[i - 1] - 12),
    atleta('P' + i + 'B', 2, 12)
  ];
  grupos.push({ name: g, groupIdx: i - 1 });
}

const fase = {
  name: 'Eliminatórias', fixedPairs: true, pairingStrategy: 'top', grandFinal: false,
  _promotionTiebreakers: ['saldo_games', 'vitorias'],
  source: { scope: 'per_group', rankingBasis: 'individual', mapping: [
    { dest: 'upper', label: 'Ouro', rankFrom: 1, rankTo: 2 },
    { dest: 'lower', label: 'Prata', rankFrom: 3, rankTo: 4 }
  ] }
};

const built = E.buildPhaseBrackets(grupos, fase, g => porGrupo[g.name], 'seed-dupla');
const nomes = line => built.byDest[line].map(t => t.displayName);

// O saldo é a SOMA: Ouro G2 (+18) precede G3… e G1 (-2), embora O1A seja o
// melhor indivíduo. Na Prata, G7 (+18) é a cabeça 1.
eq(nomes('upper'), [
  'O2A / O2B', 'O3A / O3B', 'O4A / O4B', 'O5A / O5B',
  'O6A / O6B', 'O7A / O7B', 'O8A / O8B', 'O1A / O1B'
], 'Ouro é ordenada pelo saldo de games combinado da dupla');
eq(nomes('lower'), [
  'P7A / P7B', 'P8A / P8B', 'P6A / P6B', 'P5A / P5B',
  'P4A / P4B', 'P3A / P3B', 'P2A / P2B', 'P1A / P1B'
], 'Prata usa a mesma régua combinada da promoção');

function r1(bracket, nome) {
  return built.matches.find(m => m.bracket === bracket && m.round === 1 && (m.p1 === nome || m.p2 === nome));
}
function provaEspelho(bracket, ranking, descricao) {
  const um = r1(bracket, ranking[0]);
  const dois = r1(bracket, ranking[1]);
  ok(!!um && !!dois, descricao + ': as duas cabeças entram na primeira rodada');
  ok((um.p1 === ranking[0] && um.p2 === ranking[ranking.length - 1]) ||
     (um.p2 === ranking[0] && um.p1 === ranking[ranking.length - 1]),
    descricao + ': cabeça 1 enfrenta a última');
  ok(um.nextMatchId !== dois.nextMatchId,
    descricao + ': cabeça 1 e cabeça 2 estão em metades opostas (só se encontram na final)');
  const semiUm = built.matches.find(m => m.id === um.nextMatchId);
  const semiDois = built.matches.find(m => m.id === dois.nextMatchId);
  ok(!!semiUm && !!semiDois && semiUm.nextMatchId === semiDois.nextMatchId,
    descricao + ': os caminhos das duas cabeças convergem apenas na final');
}

provaEspelho('gold', nomes('upper'), 'Ouro');
provaEspelho('silver', nomes('lower'), 'Prata');

console.log((fail ? '❌' : '✅') + ' cabecas-de-chave-por-dupla: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
