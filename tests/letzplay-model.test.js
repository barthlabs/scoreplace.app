/* Modelo canônico do histórico letzplay — node tests/letzplay-model.test.js
 *
 * ARQUITETURA: cada competição é um doc; cada partida um doc pendurado nela
 * (letzplayTournaments/{compId}/matches/{gid}) — igual ao letzplay e aos nossos jogos
 * (tournaments/{id}/results/{matchId}).
 *
 * O QUE ESTE TESTE PROTEGE: uma partida do letzplay tem 4 pessoas, então ela vai ser
 * importada até 4 VEZES (uma por perspectiva). Se o id não for IDÊNTICO visto de qualquer
 * lado, em vez de deduplicar a gente MULTIPLICA — e o histórico do jogador fica com o
 * mesmo jogo repetido, com o placar invertido em metade das cópias.
 *
 * FIXTURES REAIS (produção, 14/jul/2026): os 3 jogos da "Seletiva de mistas - PPP" de
 * 07/08/25, onde Rodrigo e Kelly jogaram JUNTOS — o dono confirmou que é o único torneio
 * em que isso aconteceu (os rankings do letzplay são separados por gênero, então eles
 * nunca se cruzam fora daí). Um lado veio do autoimport dele, o outro do scan do
 * organizador sobre o perfil dela.
 *
 * A ARMADILHA QUE ISTO CONGELA: a 1ª versão do modelo pôs o compId na identidade. O
 * import do Rodrigo tinha `tourneyId=297385`; o scan da Kelly (extensão mais velha, de
 * antes da captura por referência) tinha `undefined`. Mesmo jogo, mesma data, mesmo
 * placar → DOIS ids. Ou seja: re-varrer com extensão mais nova duplicaria tudo. Lição:
 * a identidade NUNCA pode depender de um campo cuja captura varia por versão. Competição
 * é ATRIBUTO (mesclado pelo melhor conhecido), nunca identidade.
 * Ver project_letzplay_game_per_doc_schema.
 */
const M = require('../js/letzplay-model.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── Fixtures REAIS de produção ───────────────────────────────────────
// Visão do RODRIGO (users/{uid}.letzplayImport — autoimport, extensão nova: TEM tourneyId)
const R = [
  { idx: 0, date: 'Quinta, 07/08/25 às 18:30h', club: 'paineiras-bt', competition: 'Mista D',
    tourneyName: 'Seletiva de mistas - PPP - Mista - D', tourneyId: '297385', rankingId: null,
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'KellyBarth1', oppHandles: ['FernandoIde', 'LiviaMorais'], myScore: 0, oppScore: 0, won: null },
  { idx: 1, date: 'Quinta, 07/08/25 às 18:30h', club: 'paineiras-bt', competition: 'Mista D',
    tourneyName: 'Seletiva de mistas - PPP - Mista - D', tourneyId: '297385', rankingId: null,
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'KellyBarth1', oppHandles: ['FabioGod', 'MoniqueTraldi'], myScore: 2, oppScore: 6, won: false },
  { idx: 2, date: 'Quinta, 07/08/25', club: 'paineiras-bt', competition: 'Mista D',
    tourneyName: 'Seletiva de mistas - PPP - Mista - D', tourneyId: '297385', rankingId: null,
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'KellyBarth1', oppHandles: ['PauloSierra', 'RenataSierra'], myScore: 4, oppScore: 6, won: false },
];
// Visão da KELLY (letzplayScans/{uid}.fullImport — org-scan, extensão velha: SEM tourneyId)
const K = [
  { idx: 71, date: 'Quinta, 07/08/25 às 18:30h', club: 'paineiras-bt', competition: 'Mista D',
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'RodrigoBarth', oppHandles: ['FernandoIde', 'LiviaMorais'], myScore: 0, oppScore: 0, won: null },
  { idx: 72, date: 'Quinta, 07/08/25 às 18:30h', club: 'paineiras-bt', competition: 'Mista D',
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'RodrigoBarth', oppHandles: ['FabioGod', 'MoniqueTraldi'], myScore: 2, oppScore: 6, won: false },
  { idx: 73, date: 'Quinta, 07/08/25', club: 'paineiras-bt', competition: 'Mista D',
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'RodrigoBarth', oppHandles: ['PauloSierra', 'RenataSierra'], myScore: 4, oppScore: 6, won: false },
];

// ── 1. O MESMO jogo, visto dos dois lados, é UM doc ──
for (let i = 0; i < 3; i++) {
  const idR = M.matchId(R[i], 'RodrigoBarth');
  const idK = M.matchId(K[i], 'KellyBarth1');
  ok(idR === idK, 'jogo ' + (i + 1) + ': id tem que ser igual dos 2 lados\n      R: ' + idR + '\n      K: ' + idK);
  const dR = M.toMatchDoc(R[i], 'RodrigoBarth');
  const dK = M.toMatchDoc(K[i], 'KellyBarth1');
  ok(JSON.stringify(dR.teams) === JSON.stringify(dK.teams), 'jogo ' + (i + 1) + ': times idênticos dos 2 lados');
  ok(dR.winner === dK.winner, 'jogo ' + (i + 1) + ': vencedor idêntico (o doc é neutro de perspectiva)');
}

// ── 2. A ARMADILHA: competição capturada diferente NÃO pode mudar o id ──
// (é exatamente o caso real: tourneyId=297385 no Rodrigo, ausente na Kelly)
{
  ok(R[0].tourneyId && !K[0].tourneyId, 'sanidade: o fixture reproduz a captura desigual do tourneyId');
  ok(M.compId(R[0]) !== M.compId(K[0]), 'sanidade: os compId realmente divergem (id real vs balde de categoria)');
  ok(M.matchId(R[0], 'RodrigoBarth') === M.matchId(K[0], 'KellyBarth1'),
    'compId divergente NÃO pode mudar o id do jogo — senão re-varrer com extensão nova DUPLICA tudo');
}
// e um jogo sem NENHUM dado de competição ainda casa com o mesmo jogo que tem
{
  const semComp = Object.assign({}, K[1]); delete semComp.competition;
  ok(M.matchId(semComp, 'KellyBarth1') === M.matchId(R[1], 'RodrigoBarth'),
    'jogo sem categoria nenhuma ainda casa — a identidade é quem+quando+placar');
}

// ── 3. O doc é NEUTRO de perspectiva (o placar não pode inverter) ──
{
  // Jogo 2: Rodrigo/Kelly PERDERAM de 2x6. Do lado deles é myScore=2. Um adversário
  // (FabioGod) importaria o mesmo jogo com myScore=6 — o doc tem que ser o mesmo.
  const fabio = { date: 'Quinta, 07/08/25 às 18:30h', club: 'paineiras-bt', competition: 'Mista D',
    kind: 'tournament', official: true, sport: 'Beach Tennis',
    partnerHandle: 'MoniqueTraldi', oppHandles: ['RodrigoBarth', 'KellyBarth1'], myScore: 6, oppScore: 2, won: true };
  const idF = M.matchId(fabio, 'FabioGod');
  ok(idF === M.matchId(R[1], 'RodrigoBarth'), 'o adversário importando o MESMO jogo dá o mesmo id (placar invertido não cria doc novo)');
  const dF = M.toMatchDoc(fabio, 'FabioGod'), dR = M.toMatchDoc(R[1], 'RodrigoBarth');
  ok(JSON.stringify(dF.teams) === JSON.stringify(dR.teams), 'times canônicos iguais vistos do vencedor e do perdedor');
  ok(dF.winner === dR.winner, 'vencedor é o mesmo índice, não "eu ganhei" de cada lado');
}

// ── 4. Jogos DIFERENTES não colidem ──
{
  const ids = new Set(R.map((g) => M.matchId(g, 'RodrigoBarth')));
  ok(ids.size === 3, '3 jogos distintos no mesmo dia, mesma competição → 3 ids (adversários diferem)');
  // mesmo par de adversários no mesmo dia, placar diferente = jogo diferente
  const outro = Object.assign({}, R[1], { myScore: 6, oppScore: 4 });
  ok(M.matchId(outro, 'RodrigoBarth') !== M.matchId(R[1], 'RodrigoBarth'),
    'mesmo dia/adversários mas placar diferente → jogos diferentes (o placar está na chave)');
}
// clubes diferentes no mesmo dia não se cruzam
{
  const outroClube = Object.assign({}, R[0], { club: 'sampamorumbi' });
  ok(M.matchId(outroClube, 'RodrigoBarth') !== M.matchId(R[0], 'RodrigoBarth'), 'clubes diferentes → ids diferentes');
}

// ── 5. `players` serve pra query do histórico (collectionGroup array-contains) ──
{
  const d = M.toMatchDoc(R[0], 'RodrigoBarth');
  ok(d.players.length === 4, 'players tem os 4 (é o que responde "meu histórico" sem carregar torneio)');
  ['rodrigobarth', 'kellybarth1', 'fernandoide', 'liviamorais'].forEach((h) => {
    ok(d.players.indexOf(h) >= 0, 'players inclui ' + h + ' (minúsculo, pra array-contains casar)');
  });
}

// ── 6. Data: só o dia entra (a hora varia de exibição entre os dois caminhos) ──
{
  ok(M.dateKey('Quinta, 07/08/25 às 18:30h') === '20250807', 'dateKey extrai o dia do texto sujo do letzplay');
  ok(M.dateKey('Quinta, 07/08/25 às 18:30h') === M.dateKey('Quinta, 07/08/25'),
    'com e sem hora → mesma chave (o jogo 3 vem sem hora num lado)');
  ok(M.dateKey('') === '' && M.dateKey(null) === '', 'data ausente não explode');
}

console.log((fail ? '✗' : '✓') + ' letzplay-model: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
