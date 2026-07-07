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

// ═══════════════════════════════════════════════════════════════════════════════
// _computeStandings (Liga/Suíço INDIVIDUAL) por UID (v4.4.120) — dirige o motor REAL.
// FALHA no código velho (chave por NOME): entries sem `.uid`; jogo com nome clobberado
// credita a PESSOA errada (homônima); dois homônimos colapsam numa linha só.
// PASSA no novo (chave por UID via p1Uid/p2Uid + seed por p.uid).
// ═══════════════════════════════════════════════════════════════════════════════
const row = (s, p) => s.find(p);

// ── (a) DERIVA DE NOME: os jogos da Vivian tiveram o nome clobberado pra "Vivi Hirata"
//        (uid dela CORRETO nos slots). A tabela deve creditar a Vivian (uid), não a outra
//        pessoa chamada "Vivi Hirata" que também está no torneio. ──
(function () {
  const uVIAN = 'uVIAN', uVIVI = 'uVIVIH', uM = 'uMARJ', uR = 'uROD';
  const t = {
    participants: [
      { uid: uVIAN, displayName: 'Vivian', name: 'Vivian' },
      { uid: uVIVI, displayName: 'Vivi Hirata', name: 'Vivi Hirata' }, // outra pessoa, homônima-prefixo
      { uid: uM, displayName: 'Marjorie', name: 'Marjorie' },
      { uid: uR, displayName: 'Rodrigo', name: 'Rodrigo' }
    ],
    rounds: [{ matches: [
      // Vivian (uVIAN) vence 2 — mas o NOME nos slots está clobberado pra "Vivi Hirata".
      { p1: 'Vivi Hirata', p1Uid: uVIAN, p2: 'Marjorie', p2Uid: uM, winner: 'Vivi Hirata', scoreP1: 6, scoreP2: 2 },
      { p1: 'Vivi Hirata', p1Uid: uVIAN, p2: 'Rodrigo', p2Uid: uR, winner: 'Vivi Hirata', scoreP1: 6, scoreP2: 1 },
      // A OUTRA Vivi Hirata (uVIVI) joga o SEU jogo e perde — nome igual, uid diferente.
      { p1: 'Vivi Hirata', p1Uid: uVIVI, p2: 'Marjorie', p2Uid: uM, winner: 'Marjorie', scoreP1: 3, scoreP2: 6 }
    ] }]
  };
  const s = W._computeStandings(t);
  const vian = row(s, r => r.uid === uVIAN);
  const vivi = row(s, r => r.uid === uVIVI);
  ok(!!vian, '[deriva] existe linha da Vivian por uid');
  ok(!!vivi, '[deriva] existe linha da Vivi Hirata (uVIVI) por uid');
  if (vian) {
    eq(vian.name, 'Vivian', '[deriva] linha mostra o nome do elenco (Vivian), não o clobberado');
    eq(vian.wins, 2, '[deriva] Vivian leva as 2 vitórias (por uid, mesmo com nome clobberado)');
  }
  if (vivi) {
    eq(vivi.wins, 0, '[deriva] a OUTRA Vivi Hirata NÃO herda as vitórias da Vivian');
    eq(vivi.losses, 1, '[deriva] a Vivi Hirata (uVIVI) fica só com a própria derrota');
  }
  eq(s.length, 4, '[deriva] 4 linhas (os 4 do elenco), sem fantasma');
})();

// ── (b) HOMÔNIMOS não se juntam: duas pessoas com o MESMO nome "João" (uids distintos),
//        cada uma vence um jogo (uid no slot). Devem virar DUAS linhas, não uma somada. ──
(function () {
  const uJ1 = 'uJOAO1', uJ2 = 'uJOAO2', uP = 'uPEDRO', uL = 'uLUCAS';
  const t = {
    participants: [
      { uid: uJ1, displayName: 'João', name: 'João' },
      { uid: uJ2, displayName: 'João', name: 'João' }, // homônimo verdadeiro
      { uid: uP, displayName: 'Pedro', name: 'Pedro' },
      { uid: uL, displayName: 'Lucas', name: 'Lucas' }
    ],
    rounds: [{ matches: [
      { p1: 'João', p1Uid: uJ1, p2: 'Pedro', p2Uid: uP, winner: 'João', scoreP1: 6, scoreP2: 3 },
      { p1: 'João', p1Uid: uJ2, p2: 'Lucas', p2Uid: uL, winner: 'João', scoreP1: 6, scoreP2: 4 }
    ] }]
  };
  const s = W._computeStandings(t);
  const joaos = s.filter(r => r.name === 'João');
  eq(joaos.length, 2, '[homônimo] duas linhas "João" (uma por uid), não uma só somada');
  const j1 = row(s, r => r.uid === uJ1), j2 = row(s, r => r.uid === uJ2);
  ok(!!j1 && !!j2, '[homônimo] cada João tem linha própria por uid');
  if (j1) eq(j1.wins, 1, '[homônimo] João(uJ1) com 1 vitória');
  if (j2) eq(j2.wins, 1, '[homônimo] João(uJ2) com 1 vitória (não 2 num só)');
})();

console.log((fail === 0 ? '✅' : '❌') + ' standings-uid-identity: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
