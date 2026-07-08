/* Matriz VISUAL "⚔️ Confrontos Diretos" por UID (v4.5.26) — teste de render ponta a ponta:
 * dirige _computeStandings REAL (produz as linhas com .key/.uid) → _buildHeadToHead REAL
 * (bracket-logic.js), a MESMA função que o render (bracket.js ~4497) consome.
 *
 * Difere de tests/h2h-uid-identity.test.js (que cobre o DESEMPATE confronto_direto DENTRO do
 * _computeStandings). Aqui é a MATRIZ visual separada, que antes remontava seu próprio mapa
 * por NOME cru (h2h[m.p1][m.p2]).
 *
 * Bug reproduzido no browser (v4.4.120): o displayName da Vivian nos jogos foi clobberado pra
 * "Vivi Hirata" (uid dela correto no slot p1Uid/p2Uid). A classificação ficou certa (por uid),
 * mas a matriz por NOME jogava os jogos da Vivian sob a linha do HOMÔNIMO "Vivi Hirata" (outra
 * pessoa) e zerava a linha da Vivian. Resolvendo por uid, casa a linha certa.
 *
 * node tests/h2h-matrix-uid.test.js — FALHA no comportamento por-nome, PASSA no por-uid.
 */
const { window: W } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', veio ' + a + ')'); }

const uVian = 'uVIAN', uMarj = 'uMARJ', uRod = 'uROD', uVivi = 'uVIVIHIRATA';

// Liga 1v1. A Vivian (uVian) venceu Marjorie e Rodrigo. Nos SLOTS dos jogos o displayName dela
// está clobberado pra "Vivi Hirata" — mas o uid do slot é o dela (uVian). Existe TAMBÉM uma
// "Vivi Hirata" real (uVivi), outra pessoa inscrita (não jogou).
const t = {
  participants: [
    { uid: uVian, displayName: 'Vivian',      name: 'Vivian' },
    { uid: uVivi, displayName: 'Vivi Hirata', name: 'Vivi Hirata' }, // homônima real, outra pessoa
    { uid: uMarj, displayName: 'Marjorie',    name: 'Marjorie' },
    { uid: uRod,  displayName: 'Rodrigo',     name: 'Rodrigo' }
  ],
  rounds: [
    { matches: [
      { id: 'm1', p1: 'Vivi Hirata', p2: 'Marjorie', p1Uid: uVian, p2Uid: uMarj,
        winner: 'Vivi Hirata', scoreP1: 6, scoreP2: 2 },   // Vivian (nome clobberado) vence Marjorie
      { id: 'm2', p1: 'Vivi Hirata', p2: 'Rodrigo', p1Uid: uVian, p2Uid: uRod,
        winner: 'Vivi Hirata', scoreP1: 6, scoreP2: 3 }    // Vivian (nome clobberado) vence Rodrigo
    ] }
  ]
};

// as linhas da classificação vêm do MOTOR real (por uid, com .key/.name canônico do elenco)
const computed = W._computeStandings(t);
const h2h = W._buildHeadToHead(t, computed, t.rounds);
ok(!!h2h && Array.isArray(h2h.keys), '_buildHeadToHead retorna { keys, keyName, matrix }');

const kVian = 'uid:' + uVian, kMarj = 'uid:' + uMarj, kRod = 'uid:' + uRod, kVivi = 'uid:' + uVivi;

// leitor seguro: no comportamento ANTIGO (por NOME) as chaves 'uid:...' não existem → célula
// zerada → FALHA de asserção limpa (o jogo "sumiu" da linha da Vivian), sem TypeError.
function cell(a, b) {
  return (h2h.matrix && h2h.matrix[a] && h2h.matrix[a][b]) ? h2h.matrix[a][b] : { w: 0, d: 0, l: 0 };
}
function rowSum(k, field) {
  return h2h.keys.reduce(function (acc, other) { return acc + cell(k, other)[field]; }, 0);
}

// a matriz tem uma linha por pessoa do elenco, resolvida por uid — Vivian e a homônima separadas
eq(h2h.keys.length, 4, 'matriz tem 4 linhas (as 4 pessoas), resolvidas por uid');
eq(h2h.keyName[kVian], 'Vivian', 'a linha da Vivian mostra o nome do elenco (não o clobberado)');
ok(h2h.keys.indexOf(kVivi) !== -1, 'a homônima "Vivi Hirata" real tem sua própria linha (uid distinto)');

// Vivian (uVian) venceu Marjorie e Rodrigo — casado por uid do slot, não pelo nome clobberado
eq(cell(kVian, kMarj).w, 1, 'Vivian × Marjorie: 1 vitória da Vivian');
eq(cell(kVian, kRod).w, 1, 'Vivian × Rodrigo: 1 vitória da Vivian');
eq(rowSum(kVian, 'w'), 2, 'Vivian soma 2 vitórias na linha dela');

// espelho da derrota
eq(cell(kMarj, kVian).l, 1, 'Marjorie × Vivian: 1 derrota da Marjorie');
eq(cell(kRod, kVian).l, 1, 'Rodrigo × Vivian: 1 derrota do Rodrigo');

// O CERNE do bug: a "Vivi Hirata" HOMÔNIMA (uVivi) NÃO pode ter herdado os jogos da Vivian.
eq(rowSum(kVivi, 'w'), 0, 'a homônima "Vivi Hirata" NÃO rouba as vitórias da Vivian');
eq(rowSum(kVivi, 'l'), 0, 'a homônima "Vivi Hirata" também não recebe derrotas fantasma');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' h2h-matrix-uid: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
