/* JOGADOR X OCUPA A VAGA NA TABELA — ZERADO, SEM NUNCA PONTUAR (2.0.52)
 * node tests/jogador-x-ocupa-a-vaga-zerado.test.js
 *
 * Ordem do dono (24/ago/2026, G2 do Confra, com o print da tabela na mão):
 *   _"era para colocar o jogador x no 3o lugar deixando a kallana em 4o e a adele em 5o"_
 *
 * Antes o ghost era PULADO no seed do _computeMonarchStandings e a vaga sumia da
 * tabela — quem estava abaixo subia um degrau que não ganhou em quadra. Agora a vaga
 * aparece, com zeros. O que NÃO mudou (e este arquivo também trava): ghost nunca é
 * CREDITADO — nem jogo, nem PA — mesmo quando ele joga de verdade pra viabilizar a
 * rodada ([[project_wo_substituicao]] §4: "Jogador X não pontua").
 */
const path = require('path');
const H = require(path.join(__dirname, 'render-harness'));
const W = H.sandbox;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const fn = W.window._computeMonarchStandings;
ok(typeof fn === 'function', 'falta _computeMonarchStandings');

// ── cenário G2 real (anonimizado): 3 jogos TODOS com a ausente, ghost só na vaga ──
const U = { d: 'uid_d', k: 'uid_k', m: 'uid_m', a: 'uid_a' };
function jogo(id, t1, u1, t2, u2, s1, s2) {
  return { id, team1: t1, team1Uids: u1, team2: t2, team2Uids: u2,
    p1: t1.join(' / '), p2: t2.join(' / '), scoreP1: s1, scoreP2: s2,
    winner: s1 > s2 ? t1.join(' / ') : t2.join(' / ') };
}
const T = { ligaGhosts: ['Jogador X'] };
const MATCHES = [
  jogo('m1', ['Dani', 'Kali'], [U.d, U.k], ['Moni', 'Ause'], [U.m, U.a], 3, 6),
  jogo('m2', ['Dani', 'Moni'], [U.d, U.m], ['Kali', 'Ause'], [U.k, U.a], 6, 0),
  jogo('m3', ['Dani', 'Ause'], [U.d, U.a], ['Kali', 'Moni'], [U.k, U.m], 6, 0),
];
// o render (bracket.js) passa elenco + a ausente; o ghost está no elenco (vaga)
const GROUP = {
  players: ['Dani', 'Kali', 'Moni', 'Jogador X', 'Ause'],
  playersUids: [U.d, U.k, U.m, null, U.a],
  matches: MATCHES,
};

const st = fn(GROUP, T, null) || [];
const nomes = st.map((l) => l.name);
const ghost = st.find((l) => l.isGhost);

// 1. a vaga APARECE — linha do ghost existe, zerada
ok(!!ghost && ghost.name === 'Jogador X', 'a linha do Jogador X devia existir; veio ' + JSON.stringify(nomes));
ok(!!ghost && ghost.wins === 0 && ghost.played === 0 && ghost.pointsFor === 0 && ghost.pointsAgainst === 0,
  'a linha do ghost devia estar ZERADA: ' + JSON.stringify(ghost));

// 2. a ordem do caso real: Dani (2V +9), Moni (2V +3), X (0V, saldo 0), Kali (0V, -15).
//    A ausente (2V +3) fica onde os critérios mandarem — o afundar pro fim é do render
//    (_woMark, bracket.js), não desta função.
const semAusente = nomes.filter((n) => n !== 'Ause');
ok(JSON.stringify(semAusente) === JSON.stringify(['Dani', 'Moni', 'Jogador X', 'Kali']),
  'ordem (sem a ausente) devia ser Dani, Moni, Jogador X, Kali; veio ' + JSON.stringify(semAusente));

// 3. ghost que JOGA continua sem pontuar — e os parceiros/adversários pontuam normal
const MATCHES2 = MATCHES.concat([
  jogo('m4', ['Dani', 'Jogador X'], [U.d, null], ['Kali', 'Moni'], [U.k, U.m], 6, 1),
]);
const st2 = fn({ players: GROUP.players, playersUids: GROUP.playersUids, matches: MATCHES2 }, T, null) || [];
const g2 = st2.find((l) => l.isGhost);
ok(!!g2 && g2.wins === 0 && g2.played === 0, 'ghost jogou o m4 e MESMO ASSIM não pode ser creditado: ' + JSON.stringify(g2));
const dani2 = st2.find((l) => l.uid === U.d);
ok(!!dani2 && dani2.wins === 3 && dani2.played === 4, 'o parceiro do ghost pontua normal (Dani 3V/4J): ' + JSON.stringify(dani2));

// 4. sem ghost no elenco, nada muda (torneio sem ligaGhosts)
const st3 = fn({ players: ['Dani', 'Kali'], playersUids: [U.d, U.k], matches: [] }, { ligaGhosts: [] }, null) || [];
ok(!st3.some((l) => l.isGhost), 'sem ghost declarado não pode nascer linha ghost');

console.log('\njogador-x-ocupa-a-vaga-zerado: ' + pass + ' ok, ' + fail + ' falhas');
if (fail) process.exit(1);
