/* CLASSIFICAÇÃO JÁ PUBLICADA NÃO MUDA — nem quando a régua melhora
 *
 * Ordem do dono (22/ago/2026): _"essas duplas que já foram publicadas na classificação não
 * podem mudar. as pessoas já sabem suas duplas. mesmo que seja porque agora o sistema é
 * melhor. azar. essas duplas que já jogaram ficam como estão."_
 *
 * O RISCO, medido no sandbox do Confra: a CHAVE grava as duplas dentro do jogo (`p1`/`p2`),
 * então ela é imutável. Mas a classificação do grupo NÃO era gravada em lugar nenhum — o
 * grupo só tinha `matchIds, rosterAt, players, name, playersUids` — e era RECALCULADA a cada
 * render. Bastava a régua de desempate melhorar (e ela melhorou no mesmo dia, na 2.0.18,
 * quando `pontos_avancados`, Buchholz e Sonneborn-Berger passaram a contar) para a tela
 * reordenar e passar a discordar da dupla que a pessoa já tinha visto e da que está na chave.
 *
 * A REGRA: no avanço da fase, a ordem do grupo vira FATO e é gravada em
 * `group.classifCongelada`. Daí em diante a tela LÊ o retrato. É a mesma regra do placar
 * lançado — o que já foi jogado e publicado não se reescreve.
 *
 * O que NÃO congela: as estatísticas (V/D/saldo seguem refletindo os jogos). Congela a ORDEM.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require(path.join(ROOT, 'tests/render-harness'));
const W = H.sandbox;

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── classificação publicada não muda ────');

// Grupo de 4 em Rei/Rainha, com um EMPATE de propósito entre B e C — é aí que uma régua
// diferente reordena.
function grupo(congelada) {
  const g = {
    name: 'R1 Grupo X',
    players: ['A', 'B', 'C', 'D'],
    playersUids: ['uA', 'uB', 'uC', 'uD'],
    matches: [
      { id: 'x1', p1: 'A / B', p2: 'C / D', team1: ['A', 'B'], team2: ['C', 'D'],
        team1Uids: ['uA', 'uB'], team2Uids: ['uC', 'uD'], scoreP1: 6, scoreP2: 3, winner: 'A / B' },
      { id: 'x2', p1: 'A / C', p2: 'B / D', team1: ['A', 'C'], team2: ['B', 'D'],
        team1Uids: ['uA', 'uC'], team2Uids: ['uB', 'uD'], scoreP1: 6, scoreP2: 4, winner: 'A / C' },
      { id: 'x3', p1: 'A / D', p2: 'B / C', team1: ['A', 'D'], team2: ['B', 'C'],
        team1Uids: ['uA', 'uD'], team2Uids: ['uB', 'uC'], scoreP1: 6, scoreP2: 5, winner: 'A / D' }
    ]
  };
  if (congelada) g.classifCongelada = congelada;
  return g;
}
const t = { id: 'tst', tiebreakers: ['saldo_pontos', 'vitorias', 'sorteio'], rounds: [], matches: [] };
const ordem = (g) => (W._computeMonarchStandings(g, t, null) || []).map(x => x.name).join(' > ');

ok('o cálculo de classificação existe', typeof W._computeMonarchStandings === 'function');

// ── sem retrato: a régua manda (comportamento normal, antes de avançar) ──────────────
const semRetrato = ordem(grupo(null));
ok('sem retrato, a ordem sai da régua', semRetrato.length > 0, 'veio: ' + semRetrato);

// ── com retrato: a ordem PUBLICADA vence, mesmo sendo "pior" pela régua ──────────────
// Retrato deliberadamente INVERTIDO em relação ao que a régua daria.
const publicada = [{ name: 'D', uid: 'uD' }, { name: 'C', uid: 'uC' },
                   { name: 'B', uid: 'uB' }, { name: 'A', uid: 'uA' }];
const comRetrato = ordem(grupo(publicada));
ok('⛔ com retrato, a ordem PUBLICADA é respeitada', comRetrato === 'D > C > B > A',
  'veio: ' + comRetrato + ' — a tela reordenou e desmentiu o que já foi publicado');
ok('  → e ela difere do que a régua daria (o teste está provando algo)',
  comRetrato !== semRetrato, 'os dois casos deram a mesma ordem; o cenário não discrimina');

// ── mudar a régua NÃO pode mexer no que já foi publicado ─────────────────────────────
const t2 = { id: 'tst', tiebreakers: ['vitorias', 'saldo_pontos', 'sorteio'], rounds: [], matches: [] };
const comOutraRegua = (W._computeMonarchStandings(grupo(publicada), t2, null) || []).map(x => x.name).join(' > ');
ok('⛔ trocar os critérios NÃO reordena um grupo já publicado', comOutraRegua === comRetrato,
  'com a régua nova veio ' + comOutraRegua + ', com a antiga ' + comRetrato);

// ── quem entrou DEPOIS do retrato vai pro fim, sem furar a ordem ─────────────────────
const gExtra = grupo([{ name: 'B', uid: 'uB' }, { name: 'A', uid: 'uA' }]);   // retrato só com 2
const ordExtra = ordem(gExtra).split(' > ');
ok('quem não está no retrato vai pro FIM, sem furar a ordem antiga',
  ordExtra[0] === 'B' && ordExtra[1] === 'A', 'veio: ' + ordExtra.join(' > '));

// ── as ESTATÍSTICAS seguem vivas (congela a ordem, não os números) ───────────────────
const linhas = W._computeMonarchStandings(grupo(publicada), t, null) || [];
const a = linhas.find(x => x.name === 'A');
ok('as estatísticas continuam refletindo os jogos', !!a && (a.wins || 0) === 3,
  'A venceu os 3 jogos; veio wins=' + (a && a.wins));

// ── o AVANÇO grava o retrato, e só uma vez ──────────────────────────────────────────
const eng = fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8');
ok('o avanço de fase grava a classificação congelada', /g\.classifCongelada = _st\.map/.test(eng));
ok('  → e é IDEMPOTENTE: nunca regrava por cima', /if \(!g \|\| Array\.isArray\(g\.classifCongelada\)\) return;/.test(eng));
ok('  → com nome E uid (nome envelhece, uid é a identidade)',
  /name: \(x && x\.name\) \|\| '', uid: \(x && x\.uid\) \|\| null/.test(eng));
ok('  → e congelar nunca pode impedir o avanço', /catch \(e\) \{ \/\* congelar nunca pode impedir o avanço \*\/ \}/.test(eng));

// ── CONGELA JÁ AO FECHAR O GRUPO, não só no avanço ──────────────────────────────────
// Ordem do dono: _"é importante congelar agora os que foram jogados na Confra real. os que
// não têm resultado ainda podem ser recalculados sem problemas."_ A Confra está pela metade
// (54 de 102 jogos), então quem já terminou precisa do retrato AGORA.
const gEncerrado = { rounds: [{ monarchGroups: [grupo(null)] }], matches: [] };
W._congelaGruposEncerrados(Object.assign({ tiebreakers: t.tiebreakers }, gEncerrado));
const gg = gEncerrado.rounds[0].monarchGroups[0];
ok('grupo com TODOS os jogos decididos é congelado na hora', Array.isArray(gg.classifCongelada),
  'sem isso, melhorar a régua depois reordena um grupo que as pessoas já viram');
ok('  → e guarda o carimbo de quando', !!gg.classifCongeladaAt);

// grupo AINDA em jogo não congela — não há o que desmentir
const gPend = grupo(null);
gPend.matches[2].winner = null; gPend.matches[2].scoreP1 = null; gPend.matches[2].scoreP2 = null;
const tPend = { tiebreakers: t.tiebreakers, rounds: [{ monarchGroups: [gPend] }], matches: [] };
W._congelaGruposEncerrados(tPend);
ok('⛔ grupo com jogo PENDENTE não é congelado (segue recalculando)',
  !Array.isArray(gPend.classifCongelada));

// e não regrava por cima de um retrato que já existe
const gJa = grupo([{ name: 'D', uid: 'uD' }]);
W._congelaGruposEncerrados({ tiebreakers: t.tiebreakers, rounds: [{ monarchGroups: [gJa] }], matches: [] });
ok('  → e nunca regrava por cima de um retrato existente',
  gJa.classifCongelada.length === 1 && gJa.classifCongelada[0].name === 'D');

// O gancho vive na PORTA ÚNICA do placar. Não pode ser o `_advanceWinner`: jogo de grupo
// nem passa por ele — o `_applyResultToTournament` desvia grupo pro `_checkGroupRoundComplete`.
const ui = fs.readFileSync(path.join(ROOT, 'js/views/bracket-ui.js'), 'utf8');
const corpoApply = ui.slice(ui.indexOf('window._applyResultToTournament = function'));
ok('cada placar lançado dispara o congelamento dos grupos encerrados',
  /window\._congelaGruposEncerrados\(t\)/.test(corpoApply.slice(0, corpoApply.indexOf('\n};'))),
  'sem o gancho na porta única, um grupo do Confra real só congelaria no avanço de fase');
ok('  → e congelar nunca pode derrubar o lançamento do placar',
  /try \{ window\._congelaGruposEncerrados\(t\); \} catch \(e\) \{\}/.test(corpoApply));
ok('  → o desvio de jogo de GRUPO continua existindo (é por isso que o gancho não é o _advanceWinner)',
  /\} else if \(isGroupMatch\) \{/.test(corpoApply));

// ═══════════════════════════════════════════════════════════════════════════════
// O CONGELADOR TEM QUE ENXERGAR O JOGO ONDE ELE REALMENTE ESTÁ
// ═══════════════════════════════════════════════════════════════════════════════
// ⛔ MEDIDO no Confra real (26/ago/2026): o congelador procurava os jogos só em `g.matches`
// e `g.rounds[].matches`. No Confra os 115 jogos moram em `t.rounds[0].matches`, cada um
// apontando o grupo pelo campo `monarchGroup`. Ele achava ZERO jogos nos 35 grupos, caía no
// `return` e não gravava nada — sem erro, sem log.
// A conta antes do conserto: 24 grupos realmente fechados, 18 com retrato (todos gravados
// pelo OUTRO caminho, o avanço de fase) e 6 fechados SEM retrato, recalculados a cada tela.
// Depois: 18 → 24.
//
// Ordem do dono: _"os congelamentos são fundamentais para não mudar nenhuma classificação
// antes de corrigirmos os critérios de desempate que não estavam funcionando corretamente.
// depois de corrigidos, jogos jogados depois não devem mais precisar do congelamento."_
// Ou seja: o retrato é uma CATRACA sobre o passado. Ela não pode ter ponto cego.
console.log('\n──── o congelador enxerga o jogo onde ele está ────');

function jogo(gi, t1, t2, venc, n) {
  return { id: 'm' + gi + '-' + n, isMonarch: true, monarchGroup: gi, roundIndex: 0,
           team1: t1, team2: t2, winner: venc, scoreP1: 6, scoreP2: 3, _gameNum: n };
}
// A FORMA DO CONFRA: jogos na RODADA, grupo declarado dentro do jogo.
const tConfra = {
  tiebreakers: ['saldo_pontos', 'vitorias'],
  rounds: [{
    name: 'R1',
    matches: [
      jogo(0, ['A'], ['B'], 'A', 1), jogo(0, ['A'], ['C'], 'A', 2), jogo(0, ['B'], ['C'], 'B', 3),
      jogo(1, ['D'], ['E'], 'D', 4)   // grupo 1 com um jogo só, decidido
    ],
    monarchGroups: [
      { name: 'R1 Grupo A', players: ['A', 'B', 'C'], playersUids: ['uA', 'uB', 'uC'] },
      { name: 'R1 Grupo B', players: ['D', 'E'], playersUids: ['uD', 'uE'] }
    ]
  }]
};
W._congelaGruposEncerrados(tConfra);
const gA = tConfra.rounds[0].monarchGroups[0], gB = tConfra.rounds[0].monarchGroups[1];
ok('⛔ grupo cujos jogos moram na RODADA (forma do Confra) CONGELA',
  Array.isArray(gA.classifCongelada) && gA.classifCongelada.length === 3,
  'era exatamente esta a cegueira: 6 grupos fechados do Confra sem retrato nenhum');
ok('  → e o retrato guarda o uid, não só o nome',
  !!(gA.classifCongelada && gA.classifCongelada[0] && gA.classifCongelada[0].uid));
ok('  → o segundo grupo da mesma rodada também', Array.isArray(gB.classifCongelada));
ok('  → e cada grupo pegou SÓ os seus jogos (A não herdou o jogo do B)',
  gA.classifCongelada.map(function (x) { return x.name; }).sort().join('') === 'ABC');

// ⛔ ÍNDICE DE GRUPO SE REPETE ENTRE FASES — juntar por índice sem olhar a rodada
// misturaria o Grupo A da Fase 1 com o Grupo A da Fase 2.
const tDuasFases = {
  tiebreakers: ['saldo_pontos'],
  rounds: [
    { name: 'R1', matches: [jogo(0, ['A'], ['B'], 'A', 1)],
      monarchGroups: [{ name: 'R1 Grupo A', players: ['A', 'B'], playersUids: ['uA', 'uB'] }] },
    { name: 'R2', matches: [Object.assign(jogo(0, ['C'], ['D'], 'C', 2), { roundIndex: 1 })],
      monarchGroups: [{ name: 'R2 Grupo A', players: ['C', 'D'], playersUids: ['uC', 'uD'] }] }
  ]
};
W._congelaGruposEncerrados(tDuasFases);
const nomes = function (g) { return (g.classifCongelada || []).map(function (x) { return x.name; }).sort().join(''); };
ok('⛔ mesmo índice de grupo em fases diferentes NÃO se mistura',
  nomes(tDuasFases.rounds[0].monarchGroups[0]) === 'AB' &&
  nomes(tDuasFases.rounds[1].monarchGroups[0]) === 'CD',
  'R1 ficou "' + nomes(tDuasFases.rounds[0].monarchGroups[0]) + '" e R2 "' + nomes(tDuasFases.rounds[1].monarchGroups[0]) + '"');

// ⛔ A CATRACA SÓ ANDA PRA FRENTE: grupo com jogo pendente não congela, e retrato que já
// existe nunca se regrava — nem quando a régua melhora.
const tPendente = {
  tiebreakers: ['saldo_pontos'],
  rounds: [{ matches: [jogo(0, ['A'], ['B'], 'A', 1), Object.assign(jogo(0, ['A'], ['C'], null, 2), { winner: null, scoreP1: null, scoreP2: null })],
             monarchGroups: [{ name: 'G', players: ['A', 'B', 'C'], playersUids: ['uA', 'uB', 'uC'] }] }]
};
W._congelaGruposEncerrados(tPendente);
ok('  → grupo com jogo PENDENTE não congela (ainda não há o que desmentir)',
  !Array.isArray(tPendente.rounds[0].monarchGroups[0].classifCongelada));
const jaTem = { name: 'X', players: ['A', 'B'], playersUids: ['uA', 'uB'],
                classifCongelada: [{ name: 'B', uid: 'uB' }, { name: 'A', uid: 'uA' }] };
W._congelaGruposEncerrados({ tiebreakers: ['saldo_pontos'], rounds: [{ matches: [jogo(0, ['A'], ['B'], 'A', 1)], monarchGroups: [jaTem] }] });
ok('⛔ retrato que JÁ EXISTE nunca se regrava — nem com a régua nova dizendo outra coisa',
  jaTem.classifCongelada[0].name === 'B');

console.log(falhas === 0
  ? '\n✅ classificacao-publicada-nao-muda: OK'
  : '\n❌ classificacao-publicada-nao-muda: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
