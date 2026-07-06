/* Classificação Rei/Rainha por UID (v4.4.117) — dirige _computeMonarchStandings REAL.
 * Bug: o nome da Vivian nos jogos foi clobberado pra "Vivi Hirata" (uid dela correto).
 * Código antigo (chave por NOME): a Vivian (do elenco) fica com 0 jogos, e os jogos dela
 * somem/viram fantasma. Novo (chave por UID via team1Uids/playersUids): conta certo pra ela.
 * node tests/standings-uid-identity.test.js — FALHA no antigo, PASSA no novo.
 */
const { window: W } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', veio ' + a + ')'); }

const uA = 'uVIAN', uM = 'uMARJ', uR = 'uROD', uV = 'uVANE', uVIVI = 'uVIVIHIRATA';
// A=Vivian(uA). Pairings: AB/CD, AC/BD, AD/BC. NOME da Vivian clobberado pra "Vivi Hirata".
function games() {
  const N = { A: 'Vivi Hirata', B: 'Marjorie', C: 'Rodrigo', D: 'Vanessa' }; // A clobberada!
  const U = { A: uA, B: uM, C: uR, D: uV };
  const pr = [['A', 'B', 'C', 'D'], ['A', 'C', 'B', 'D'], ['A', 'D', 'B', 'C']];
  return pr.map((p, i) => ({
    id: 'g' + i, round: 1, isMonarch: true, monarchGroup: 0,
    team1: [N[p[0]], N[p[1]]], team2: [N[p[2]], N[p[3]]],
    team1Uids: [U[p[0]], U[p[1]]], team2Uids: [U[p[2]], U[p[3]]],
    p1: N[p[0]] + ' / ' + N[p[1]], p2: N[p[2]] + ' / ' + N[p[3]],
    winner: N[p[0]] + ' / ' + N[p[1]], scoreP1: 6, scoreP2: 2  // time da Vivian sempre ganha
  }));
}
const group = {
  name: 'Grupo A',
  players: ['Vivian', 'Marjorie', 'Rodrigo', 'Vanessa'],   // ELENCO com o nome CERTO
  playersUids: [uA, uM, uR, uV],
  matches: games()
};
const t = {
  participants: [
    { uid: uA, displayName: 'Vivian', name: 'Vivian' },
    { uid: uVIVI, displayName: 'Vivi Hirata', name: 'Vivi Hirata' }, // outra pessoa, existe no torneio
    { uid: uM, displayName: 'Marjorie', name: 'Marjorie' },
    { uid: uR, displayName: 'Rodrigo', name: 'Rodrigo' },
    { uid: uV, displayName: 'Vanessa', name: 'Vanessa' }
  ]
};

const st = W._computeMonarchStandings(group, t, null);
// linha da Vivian (uid uA): deve ter jogado os 3 e vencido os 3
const vian = st.find(s => s.uid === uA);
ok(!!vian, 'existe linha pra Vivian por uid');
if (vian) {
  eq(vian.name, 'Vivian', 'linha da Vivian mostra o nome do elenco (não o clobberado)');
  eq(vian.played, 3, 'Vivian jogou 3 (mesmo com nome clobberado nos jogos) — por uid');
  eq(vian.wins, 3, 'Vivian venceu 3');
}
// NÃO pode existir uma linha fantasma da "Vivi Hirata" (uid uVIVI) com os jogos da Vivian
const fantasma = st.find(s => s.uid === uVIVI);
ok(!fantasma, 'NÃO existe linha fantasma da Vivi Hirata roubando os jogos da Vivian');
// total de linhas = 4 (os 4 do grupo), não 5
eq(st.length, 4, 'a tabela tem 4 linhas (os 4 do grupo), sem duplicar por nome');

console.log((fail === 0 ? '✅' : '❌') + ' standings-uid-identity: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
