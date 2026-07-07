/* Desempate CONFRONTO DIRETO por UID em _computeStandings (v4.4.122) — dirige o motor REAL
 * (js/views/bracket-logic.js) via tests/headless.js. Mesma classe de bug que motivou a migração
 * do _computeMonarchStandings (v4.4.117) e da matriz visual _buildHeadToHead (v4.4.121): quando o
 * displayName de alguém é clobberado no meio do torneio (uid correto no slot do jogo), a
 * classificação por NOME racha a linha da pessoa e o desempate confronto_direto casa a linha
 * errada. A chave por UID (via team1Uids/p1Uid + _buildNameToUid) conserta.
 *
 * node tests/h2h-uid-identity.test.js — FALHA no antigo (name-keyed), PASSA no novo (uid-keyed).
 */
const { window: W } = require('./headless.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' (esperado ' + b + ', veio ' + a + ')'); }
const idx = (s, uid) => s.findIndex((r) => r.uid === uid);
const byUid = (s, uid) => s.find((r) => r.uid === uid);

// ── 1. CLOBBER + HOMÔNIMO: confronto_direto resolve por uid, não por nome ──────────────────
// Round-robin de 4 (A,B,C,D). Matriz clássica: A>B, C>A, D>A, B>C, D>B, C>D.
//   A: 1V/2D = 3pts   B: 1V/2D = 3pts   C: 2V/1D = 6pts   D: 2V/1D = 6pts
// A e B empatam em 3 → o desempate é confronto_direto, e A venceu B → A acima de B.
// PORÉM: o displayName da "Ana" (uid uA) foi clobberado nos JOGOS pra "Ghost", e existe um
// HOMÔNIMO real "Ghost" (uid uGH) no torneio. Por NOME, os pontos/vitória da Ana caem na linha
// do homônimo "Ghost", a "Ana" fica com 0 e o confronto vira lixo. Por UID (p1Uid/p2Uid nos
// jogos) a linha da Ana recebe tudo certinho.
(function () {
  const uA = 'uANA', uB = 'uBIA', uC = 'uCRIS', uD = 'uDUDA', uGH = 'uGHOST';
  // nome de cada jogador NOS JOGOS — a Ana aparece clobberada como "Ghost"
  const NM = { A: 'Ghost', B: 'Bia', C: 'Cris', D: 'Duda' };
  const UI = { A: uA, B: uB, C: uC, D: uD };
  // jogo 1v1 com winner por NOME (como o app grava) + p1Uid/p2Uid (identidade real no slot)
  function g(id, w, l) {
    return {
      id: id, round: 1,
      p1: NM[w], p2: NM[l], p1Uid: UI[w], p2Uid: UI[l],
      winner: NM[w], scoreP1: 6, scoreP2: 3
    };
  }
  const t = {
    participants: [
      { uid: uA, displayName: 'Ana', name: 'Ana' },      // elenco: nome CERTO
      { uid: uGH, displayName: 'Ghost', name: 'Ghost' }, // homônimo real (não jogou)
      { uid: uB, displayName: 'Bia', name: 'Bia' },
      { uid: uC, displayName: 'Cris', name: 'Cris' },
      { uid: uD, displayName: 'Duda', name: 'Duda' }
    ],
    rounds: [{ matches: [
      g('m-ab', 'A', 'B'), // A venceu B  → confronto direto A>B
      g('m-ca', 'C', 'A'),
      g('m-da', 'D', 'A'),
      g('m-bc', 'B', 'C'),
      g('m-db', 'D', 'B'),
      g('m-cd', 'C', 'D')
    ] }],
    tiebreakers: ['confronto_direto']
  };

  const s = W._computeStandings(t);
  const ana = byUid(s, uA), bia = byUid(s, uB);
  ok(!!ana, 'existe linha da Ana por uid (uA)');
  if (ana) {
    eq(ana.name, 'Ana', 'linha da Ana mostra o nome do elenco (não o "Ghost" clobberado)');
    eq(ana.points, 3, 'Ana pontua 3 (1V/2D) mesmo com nome clobberado nos jogos — por uid');
    eq(ana.wins, 1, 'Ana com 1 vitória (venceu Bia)');
  }
  // homônimo "Ghost" (uGH) não jogou → 0 pts, e NÃO roubou os jogos da Ana
  const ghost = byUid(s, uGH);
  if (ghost) eq(ghost.points, 0, 'homônimo Ghost (uGH) fica com 0 — não roubou os jogos da Ana');
  // núcleo do bug: confronto_direto coloca Ana ACIMA de Bia (ela venceu o confronto)
  ok(idx(s, uA) < idx(s, uB), '[confronto_direto/uid] Ana (venceu Bia) acima de Bia');
  eq(bia && bia.points, 3, 'Bia também com 3 (empate que o confronto resolve)');
  // C,D (6pts) ficam acima do par de 3
  ok(idx(s, uC) < idx(s, uA) && idx(s, uD) < idx(s, uA), 'par de 6pts (C,D) acima do par de 3');
})();

// ── 2. Liga de DUPLAS Rei/Rainha (team1Uids): mesma blindagem no bloco monarch de _computeStandings ─
// A "Ana" (uA) aparece nos jogos com nome clobberado "Ghost"; team1Uids/team2Uids carregam o uid.
// A linha individual dela deve receber os jogos por uid (não criar fantasma "Ghost").
(function () {
  const uA = 'uANA2', uB = 'uBIA2', uC = 'uCRIS2', uD = 'uDUDA2';
  const N = { A: 'Ghost', B: 'Bia', C: 'Cris', D: 'Duda' }; // A clobberada nos jogos
  const U = { A: uA, B: uB, C: uC, D: uD };
  // Rei/Rainha: AB/CD, AC/BD, AD/BC — o time da Ana sempre vence
  const pr = [['A', 'B', 'C', 'D'], ['A', 'C', 'B', 'D'], ['A', 'D', 'B', 'C']];
  const matches = pr.map((p, i) => ({
    id: 'mm' + i, round: 1, isMonarch: true,
    team1: [N[p[0]], N[p[1]]], team2: [N[p[2]], N[p[3]]],
    team1Uids: [U[p[0]], U[p[1]]], team2Uids: [U[p[2]], U[p[3]]],
    p1: N[p[0]] + ' / ' + N[p[1]], p2: N[p[2]] + ' / ' + N[p[3]],
    winner: N[p[0]] + ' / ' + N[p[1]], scoreP1: 6, scoreP2: 2
  }));
  const t = {
    participants: [
      { uid: uA, displayName: 'Ana', name: 'Ana' },
      { uid: uB, displayName: 'Bia', name: 'Bia' },
      { uid: uC, displayName: 'Cris', name: 'Cris' },
      { uid: uD, displayName: 'Duda', name: 'Duda' }
    ],
    rounds: [{ matches: matches }]
  };
  const s = W._computeStandings(t);
  const ana = byUid(s, uA);
  ok(!!ana, '[monarch] existe linha da Ana por uid');
  if (ana) {
    eq(ana.name, 'Ana', '[monarch] linha da Ana com nome do elenco (não "Ghost")');
    eq(ana.played, 3, '[monarch] Ana jogou 3 (por uid, mesmo com nome clobberado)');
    eq(ana.wins, 3, '[monarch] Ana venceu os 3');
  }
  ok(!s.find((r) => r.name === 'Ghost'), '[monarch] sem linha fantasma "Ghost"');
})();

// ── 3. NÃO-clobber (caso comum): nada muda — Ana com nome estável casa por uid == por nome ──
(function () {
  const uA = 'uA3', uB = 'uB3', uC = 'uC3', uD = 'uD3';
  function g(id, w, l, wn, ln, wu, lu) {
    return { id: id, round: 1, p1: wn, p2: ln, p1Uid: wu, p2Uid: lu, winner: wn, scoreP1: 6, scoreP2: 3 };
  }
  const t = {
    participants: [
      { uid: uA, displayName: 'Ana', name: 'Ana' }, { uid: uB, displayName: 'Bia', name: 'Bia' },
      { uid: uC, displayName: 'Cris', name: 'Cris' }, { uid: uD, displayName: 'Duda', name: 'Duda' }
    ],
    rounds: [{ matches: [
      g('m-ab', 'A', 'B', 'Ana', 'Bia', uA, uB),
      g('m-ca', 'C', 'A', 'Cris', 'Ana', uC, uA),
      g('m-da', 'D', 'A', 'Duda', 'Ana', uD, uA),
      g('m-bc', 'B', 'C', 'Bia', 'Cris', uB, uC),
      g('m-db', 'D', 'B', 'Duda', 'Bia', uD, uB),
      g('m-cd', 'C', 'D', 'Cris', 'Duda', uC, uD)
    ] }],
    tiebreakers: ['confronto_direto']
  };
  const s = W._computeStandings(t);
  eq(s.length, 4, '[normal] 4 linhas (sem duplicar)');
  ok(idx(s, uA) < idx(s, uB), '[normal] confronto_direto: Ana (venceu Bia) acima de Bia');
  eq(byUid(s, uA).points, 3, '[normal] Ana com 3 pts');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' h2h-uid-identity: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);
