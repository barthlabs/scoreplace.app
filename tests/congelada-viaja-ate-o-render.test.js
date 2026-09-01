/* O RETRATO CONGELADO TEM QUE CHEGAR NA FUNÇÃO QUE ORDENA  (2.1.2)
 * node tests/congelada-viaja-ate-o-render.test.js
 *
 * ⛔ A FALHA QUE ESTE TESTE REPRODUZ — Confra, Grupo D, 26/ago/2026, torneio AO VIVO:
 * `classifCongelada` era GRAVADO no grupo e NUNCA LIDO pela tela. A lógica do retrato mora
 * DENTRO de `_computeMonarchStandings` e lê `group.classifCongelada` — mas TODOS os
 * chamadores montavam um objeto novo:
 *     _computeMonarchStandings({ players, playersUids, matches }, t, cat)
 * e o campo ficava pra trás. O congelamento não fazia nada.
 *
 * POR QUE NINGUÉM VIU ANTES: enquanto a ordem calculada COINCIDE com a congelada, o bug é
 * invisível — e ela quase sempre coincide. Só aparece quando divergem. No Grupo D
 * divergiram do pior jeito: quem JOGOU e perdeu (Fernando, 3 jogos, saldo -6) caía ABAIXO
 * de quem NÃO jogou (Vivian, 0 jogos, saldo 0). Ordem do dono: _"o fernando que jogou nao
 * pode ficar pior que a vivian que nao jogou. ela é quase um wo, mas continua em 4o"_.
 *
 * ⭐ COMO FOI ACHADO, e vale como método: a MESMA função, com o MESMO dado do banco,
 * devolvia a ordem CERTA rodando em Node e a ERRADA no navegador. A diferença não estava na
 * função — estava no que chegava nela. Quando os dois lados discordam com o mesmo dado,
 * o suspeito é a FRONTEIRA, não a lógica. [[feedback_no_blind_fixes]]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./render-harness');
const W = H.W || H.window || H;
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── o retrato congelado viaja até quem ordena ────');

/* ── ① o cenário REAL do Grupo D ───────────────────────────────────────────── */
const U = {
  rost: 'uid-rostanda', zilda: 'uid-zilda', fer: 'uid-fernando', viv: 'uid-vivian',
};
// 3 jogos Rei/Rainha. Fernando joga os três e perde os três (saldo -6).
// Vivian NÃO joga nenhum (saldo 0). Jogador X é o coringa que cobriu a vaga dela.
const jogo = (p1, p2, t1, t1u, t2, t2u, s1, s2, win) => ({
  id: 'm' + p1 + p2, p1: p1, p2: p2, team1: t1, team1Uids: t1u, team2: t2, team2Uids: t2u,
  scoreP1: s1, scoreP2: s2, winner: win, resultAt: 1,
  sets: [{ gamesP1: s1, gamesP2: s2 }],
});
const matches = [
  jogo('Zilda / Fernando', 'Rostanda / Jogador X',
       ['Zilda', 'Fernando'], [U.zilda, U.fer], ['Rostanda', 'Jogador X'], [U.rost, null],
       3, 6, 'Rostanda / Jogador X'),
  jogo('Zilda / Rostanda', 'Fernando / Jogador X',
       ['Zilda', 'Rostanda'], [U.zilda, U.rost], ['Fernando', 'Jogador X'], [U.fer, null],
       6, 4, 'Zilda / Rostanda'),
  jogo('Zilda / Jogador X', 'Fernando / Rostanda',
       ['Zilda', 'Jogador X'], [U.zilda, null], ['Fernando', 'Rostanda'], [U.fer, U.rost],
       6, 5, 'Zilda / Jogador X'),
];
const players = ['Zilda', 'Fernando', 'Rostanda', 'Jogador X', 'Vivian'];
const playersUids = [U.zilda, U.fer, U.rost, null, U.viv];
const congelada = [
  { name: 'Rostanda', uid: U.rost },
  { name: 'Zilda', uid: U.zilda },
  { name: 'Fernando', uid: U.fer },
  { name: 'Vivian', uid: U.viv },
  { name: 'Jogador X', uid: null },
];
const t = { ligaGhosts: ['Jogador X'] };
const nomes = (st) => (st || []).map((l) => l.name).join(' · ');

/* ── ② SEM o retrato: a ordem calculada é a INJUSTA (prova que divergem) ───── */
const semCong = W._computeMonarchStandings({ players, playersUids, matches }, t, null);
console.log('    sem retrato: ' + nomes(semCong));
ok('⭐ sem o retrato, quem NÃO jogou passa na frente de quem jogou (o problema existe)',
  nomes(semCong).indexOf('Vivian') < nomes(semCong).indexOf('Fernando'),
  'se estes dois não divergirem, o teste não prova nada — reveja o cenário');

/* ── ③ COM o retrato: a ordem do dono ──────────────────────────────────────── */
const comCong = W._computeMonarchStandings({ players, playersUids, matches, classifCongelada: congelada }, t, null);
console.log('    com retrato: ' + nomes(comCong));
ok('⭐⭐ com o retrato, sai exatamente a ordem congelada',
  nomes(comCong) === 'Rostanda · Zilda · Fernando · Vivian · Jogador X',
  'obtido: ' + nomes(comCong));
ok('  → Fernando (jogou e perdeu) fica ACIMA de Vivian (não jogou)',
  nomes(comCong).indexOf('Fernando') < nomes(comCong).indexOf('Vivian'));
ok('  → Jogador X entra por NOME (é ghost, não tem uid) e fica em último',
  (comCong[comCong.length - 1] || {}).name === 'Jogador X');
ok('  → e o ghost não pontua', ((comCong.find((l) => l.name === 'Jogador X') || {}).wins || 0) === 0);

/* ── ④ A FRONTEIRA: todo chamador do render TEM que passar o campo ─────────── */
// ⛔ Esta é a asserção que pega a regressão de verdade. O teste funcional acima passaria
// mesmo com o bug em produção, porque ele chama a função DIRETO. O bug vivia no caminho.
const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket.js'), 'utf8');
const chamadas = src.split('_computeMonarchStandings(').slice(1);
ok('⭐ achei os chamadores em bracket.js', chamadas.length >= 2, 'achei ' + chamadas.length);
let semCampo = 0;
chamadas.forEach((trecho, i) => {
  const args = trecho.slice(0, 400);
  if (!/classifCongelada/.test(args)) { semCampo++; console.log('      ▸ chamador #' + (i + 1) + ' NÃO passa classifCongelada'); }
});
ok('⭐⭐ TODO chamador de bracket.js passa `classifCongelada`', semCampo === 0,
  semCampo + ' chamador(es) montam o objeto sem o campo — o retrato não chega e a tela recalcula');

/* ── ⑤ E O RETRATO TEM QUE SOBREVIVER À TRAVESSIA ATÉ O RENDERIZADOR ────────────────
 * ⛔ ACHADO EM 01/set/2026, e é a MESMA falha de novo, um andar acima. O bloco ④ garante que
 * `bracket.js` PASSA `sg.classifCongelada`. Só que `sg` não é o grupo: é uma cópia montada
 * por `_getUnifiedRounds`. E `_buildGroupsColumn` montava essa cópia com um literal de
 * quatro campos — `{ name, players, matches, rounds }` — então em todo torneio cujos grupos
 * moram em `t.groups` o campo chegava AUSENTE e a correção da 2.1.2 era INERTE.
 * ⭐ A régua deste bloco é o comportamento, não o texto do código: monta um grupo com
 * retrato, passa pelo construtor REAL e confere que o campo saiu do outro lado.
 * [[feedback_chave_de_espelho_nunca_e_posicao]] — a cópia tem que copiar. */
console.log('──── ⑤ o retrato sobrevive à travessia até o renderizador ────');
{
  const _t = {
    id: 'tt', format: 'Liga', ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha',
    groups: [{ name: 'Grupo D', players, playersUids, matches, classifCongelada: congelada,
               playersSlotIds: players.map(() => null) }],
  };
  const uni = (typeof W._getUnifiedRounds === 'function') ? W._getUnifiedRounds(_t) : null;
  ok('⭐ o construtor de colunas rodou', !!(uni && uni.columns && uni.columns.length));
  const col = (uni && uni.columns || []).find((c) => c.subgroups && c.subgroups.length);
  ok('  → e produziu a coluna com subgrupos', !!col);
  const sg = col && col.subgroups[0];
  ok('⭐⭐ `classifCongelada` CHEGA no subgrupo que o render lê', !!(sg && Array.isArray(sg.classifCongelada)),
    'chegou: ' + JSON.stringify(sg && sg.classifCongelada));
  ok('  → com o retrato inteiro, na mesma ordem',
    !!sg && JSON.stringify(sg.classifCongelada) === JSON.stringify(congelada));
  ok('  → e a identidade veio junto (uids e slots)',
    !!sg && Array.isArray(sg.playersUids) && Array.isArray(sg.playersSlotIds));
  // e o efeito de ponta a ponta: com o subgrupo que o construtor entregou, a ordem sai congelada
  const st = W._computeMonarchStandings(
    { players: sg.players, playersUids: sg.playersUids, matches: sg.matches,
      classifCongelada: sg.classifCongelada }, t, null);
  ok('⭐⭐ e com ESSE subgrupo a classificação sai na ordem publicada',
    nomes(st) === 'Rostanda · Zilda · Fernando · Vivian · Jogador X', 'obtido: ' + nomes(st));
}

console.log(falhas === 0 ? '\n✅ congelada-viaja-ate-o-render: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
