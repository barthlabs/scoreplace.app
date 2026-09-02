/* RODADA NÃO VOLTA PRA 1 QUANDO A FASE VIRA  (CONFRA.P2.1)
 * node tests/rodada-tem-numero-global-no-torneio.test.js
 *
 * RELATO DO DONO (01/set/2026, sandbox já avançado): no dashboard, a fase 2 aparecia como
 * "RODADA 1 · 0/36 jogos" — num torneio que já tinha a Rodada 1 CONCLUÍDA com 105 jogos.
 * Duas mentiras numa linha: o número da rodada VOLTOU para 1, e o denominador era o da
 * primeira coluna da chave (36), não o da fase (100).
 *
 * ⭐ AS DUAS CAUSAS, e por que são separadas:
 *   • o número: `_idx` é a posição da rodada DENTRO da fase. Índice local é o certo pro
 *     motor e pro AGENDAMENTO — `_phaseRoundWindow` fatia a janela da fase pelas rodadas
 *     DELA — então ele não muda. Faltava uma camada de APRESENTAÇÃO que somasse as rodadas
 *     já consumidas pelas fases anteriores;
 *   • o denominador: o box lia `_pr.total` (jogos da RODADA atual). Passa a ler
 *     `_currentPhaseGames`, a mesma fonte canônica que já conta os jogos da fase.
 *
 * ⛔ NADA DE ID, ÍNDICE INTERNO, AGENDAMENTO OU DADO GRAVADO MUDA: `roundNum` continua local
 * e é ele que o agendamento usa; o número global é um campo NOVO, só de leitura de tela.
 */
'use strict';
const H = require('./render-harness');
const W = H.sandbox;
try { require('./headless').load('tournaments-utils.js'); } catch (e) { /* medido abaixo */ }

let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

/* ── A CONFRA EQUIVALENTE ────────────────────────────────────────────────────────────
 * Fase 0: Rei/Rainha de RODADA ÚNICA, 105 jogos, concluída.  Fase 1: eliminatória em duas
 * trilhas (Ouro/Prata), 100 jogos no total, sendo 36 na primeira coluna — que é exatamente
 * o número que aparecia como se fosse o da fase. */
function confra() {
  const t = {
    id: 'confra-sb', name: 'Confra (sandbox)', status: 'in_progress',
    currentPhaseIndex: 1, _phaseMaterialized: 1,
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', reiRainha: true, drawMode: 'rei_rainha', rounds: 1 },
      { name: 'Ouro/Prata', formatCode: 'elim_dupla', format: 'Eliminatória', fixedPairs: true }
    ],
    rounds: [{ round: 1, status: 'complete', matches: [], monarchGroups: [] }],
    matches: []
  };
  // fase 0: 105 jogos concluídos, todos na rodada 1
  for (let i = 0; i < 105; i++) {
    // ⚠️ `p1`/`p2` não são enfeite: o agregado (`_getTournamentProgress`) só conta jogo com
    // os dois lados preenchidos. Fixture sem eles mede 0 e o teste provaria nada.
    t.rounds[0].matches.push({ id: 'f0m' + i, phaseIndex: 0, round: 1, p1: 'A' + i, p2: 'B' + i, team1: ['A' + i], team2: ['B' + i], winner: 'A' + i, resultAt: 1000 + i });
  }
  // fase 1: 100 jogos, 2 trilhas. Colunas por trilha: 18+18=36, 10+10=20, ... até somar 100.
  const colunas = [[1, 18], [2, 10], [3, 8], [4, 6], [5, 4], [6, 2], [7, 2]];  // por trilha → 50 × 2 = 100
  let n = 0;
  colunas.forEach(([r, porTrilha]) => {
    ['upper', 'lower'].forEach((bk) => {
      for (let i = 0; i < porTrilha; i++) {
        t.matches.push({ id: 'f1m' + n, phaseIndex: 1, round: r, bracket: bk, p1: 'X' + n, p2: 'Y' + n, team1: ['X' + n], team2: ['Y' + n] }); n++;
      }
    });
  });
  return t;
}

console.log('──── ① as portas existem ────');
['_rodadasVisiveisDaFase', '_deslocamentoDeRodadas', '_numeroGlobalDaRodada', '_phaseCurrentRoundProgress', '_currentPhaseGames']
  .forEach((n) => ok('  ' + n, typeof W[n] === 'function', 'tipo: ' + typeof W[n]));

console.log('──── ② a Confra: Rodada 1 tem 105 jogos, Rodada 2 tem 100 ────');
const t = confra();
{
  ok('a fixture reproduz o cenário: 105 jogos na fase 0', t.rounds[0].matches.length === 105);
  ok('  → e 100 na fase 1', t.matches.filter((m) => m.phaseIndex === 1).length === 100,
    'obtido ' + t.matches.filter((m) => m.phaseIndex === 1).length);
  ok('  → dos quais 36 na primeira coluna (o número que aparecia errado)',
    t.matches.filter((m) => m.phaseIndex === 1 && m.round === 1).length === 36);
  ok('⭐ a fase 0 consumiu UMA rodada visível', W._rodadasVisiveisDaFase(t, 0) === 1,
    'obtido ' + W._rodadasVisiveisDaFase(t, 0));
  ok('⭐ o deslocamento da fase 1 é 1', W._deslocamentoDeRodadas(t, 1) === 1,
    'obtido ' + W._deslocamentoDeRodadas(t, 1));
  const pr = W._phaseCurrentRoundProgress(t);
  ok('a porta da rodada respondeu', !!pr);
  ok('⭐⭐ a primeira rodada da fase 2 é a RODADA 2 (não volta pra 1)', pr.roundNumGlobal === 2,
    'obtido ' + pr.roundNumGlobal);
  ok('⭐⭐ e o rótulo diz "Rodada 2"', /Rodada 2\b/.test(pr.name), 'obtido: ' + pr.name);
  ok('⛔ e NÃO diz "Rodada 1"', !/Rodada 1\b/.test(pr.name), 'obtido: ' + pr.name);
  ok('⭐ o índice LOCAL continua 1 — é dele que o agendamento depende', pr.roundNum === 1,
    'obtido ' + pr.roundNum);
  const fase = W._currentPhaseGames(t);
  ok('⭐⭐ o contador da fase é 0/100, não 0/36', fase.total === 100 && fase.done === 0,
    JSON.stringify(fase));
  ok('⛔ em especial o total NÃO é 36 (era a primeira coluna se passando por fase)',
    fase.total !== 36, 'obtido ' + fase.total);
  const agregado = W._getTournamentProgress(t);
  ok('⭐⭐ o agregado do torneio segue 105/205', agregado.total === 205 && agregado.completed === 105,
    JSON.stringify(agregado));
}

console.log('──── ③ o rótulo aparece no box que o dono vê ────');
{
  const html = W._buildProgressInner(t) || '';
  ok('o box foi montado', html.length > 100);
  ok('⭐⭐ o box diz "Rodada 2"', /Rodada 2/.test(html), 'não achei "Rodada 2" no HTML');
  ok('⛔ e NÃO diz "RODADA 1"', !/Rodada 1\b/i.test(html));
  /* ⛔⛔ ESTA REGRA FOI INVERTIDA PELO DONO em 02/set/2026, e a inversão fica registrada
   * aqui em vez de o teste sumir. A versão anterior travava o oposto — "o denominador é
   * 100 (a fase), não 36 (a coluna)" — porque anunciar "0/36" numa fase de 100 parecia
   * mentir sobre o tamanho da etapa. Vendo no ar, a ordem foi outra:
   *   _"99 jogos é a fase 2 toda. deveria ser apenas os jogos da rodada 2"_.
   * O motivo é geometria do cartão: o cabeçalho diz "RODADA N" e as DUAS COLUNAS de baixo
   * são o início e o fim DAQUELA rodada. Um total de FASE ao lado de um prazo de RODADA é
   * que era a mentira — o número e o prazo falavam de coisas diferentes.
   * ⭐ O agregado da fase e do torneio não se perde: ele vive na linha "🏆 TORNEIO
   * COMPLETO", que este mesmo box imprime logo abaixo. */
  ok('⭐⭐ o denominador da RODADA é 36 (a coluna atual), não 100 (a fase)',
     /\b0\s*\/\s*36\b/.test(html) || /\b36 jogos/i.test(html));
  ok('⭐ e o agregado da fase/torneio continua no box (linha do Torneio completo)',
     /\b100\b/.test(html));
}

console.log('──── ④ mais fases: nenhum rótulo global se repete ────');
{
  const t3 = confra();
  t3.phases.push({ name: 'Final', formatCode: 'elim', format: 'Eliminatória' });
  // fase 2 com 3 rodadas
  [1, 2, 3].forEach((r) => {
    for (let i = 0; i < 4; i++) t3.matches.push({ id: 'f2m' + r + i, phaseIndex: 2, round: r, bracket: 'main', p1: 'P' + i, p2: 'Q' + i, team1: ['P' + i], team2: ['Q' + i] });
  });
  const vistos = [];
  for (let fase = 0; fase < 3; fase++) {
    const nRod = W._rodadasVisiveisDaFase(t3, fase);
    for (let loc = 0; loc < nRod; loc++) vistos.push(W._numeroGlobalDaRodada(t3, fase, loc));
  }
  ok('⭐⭐ os rótulos globais são todos distintos', new Set(vistos).size === vistos.length,
    'obtidos: ' + vistos.join(', '));
  ok('⭐⭐ e formam uma sequência contínua começando em 1',
    vistos.slice().sort((a, b) => a - b).join(',') === vistos.map((_, i) => i + 1).join(','),
    'obtidos: ' + vistos.join(', '));
  ok('  → fase 0 = Rodada 1; fase 1 começa em 2; fase 2 começa depois da 1',
    W._numeroGlobalDaRodada(t3, 0, 0) === 1 && W._numeroGlobalDaRodada(t3, 1, 0) === 2 &&
    W._numeroGlobalDaRodada(t3, 2, 0) === 2 + W._rodadasVisiveisDaFase(t3, 1),
    JSON.stringify(vistos));
}

console.log('──── ⑤ fase única e dado legado seguem idênticos ────');
{
  const uma = { id: 'u1', currentPhaseIndex: 0, matches: [] };
  for (let r = 1; r <= 3; r++) for (let i = 0; i < 4; i++) uma.matches.push({ id: 'm' + r + i, round: r, bracket: 'main', p1: 'A' + i, p2: 'B' + i, team1: ['A' + i], team2: ['B' + i] });
  ok('⭐ torneio de fase única: o número global é igual ao local',
    W._numeroGlobalDaRodada(uma, 0, 0) === 1 && W._numeroGlobalDaRodada(uma, 0, 2) === 3);
  ok('  → e o deslocamento da fase 0 é sempre 0', W._deslocamentoDeRodadas(uma, 0) === 0);
  // legado: sem `phases`, sem phaseIndex nos jogos
  const legado = { id: 'lg', matches: [{ id: 'a', round: 1, p1: 'A', p2: 'B', team1: ['A'], team2: ['B'] }, { id: 'b', round: 2, p1: 'C', p2: 'D', team1: ['C'], team2: ['D'] }] };
  ok('⭐ dado legado (sem phases, sem phaseIndex): número global = local',
    W._numeroGlobalDaRodada(legado, 0, 0) === 1 && W._numeroGlobalDaRodada(legado, 0, 1) === 2);
  ok('  → e a fase 0 do legado tem 2 rodadas visíveis', W._rodadasVisiveisDaFase(legado, 0) === 2,
    'obtido ' + W._rodadasVisiveisDaFase(legado, 0));
}

/* ── ⑥ ORDEM DE CARREGAMENTO NÃO PODE MUDAR O RÓTULO ────────────────────────────────
 * ⛔ Se o deslocamento contasse só o que já chegou, o rótulo nasceria "Rodada 1" e viraria
 * "Rodada 2" quando a subcoleção da fase anterior aterrissasse — piscando na cara de quem
 * está lendo. O piso vem da CONFIGURAÇÃO da fase, que viaja sempre no documento-base. */
console.log('──── ⑥ chegada tardia das partes não muda o rótulo ────');
{
  const dividido = confra();
  dividido._semPesados = ['participants', 'matches', 'grupos'];
  dividido._nPartes = { participants: 14, matches: 205, grupos: 4 };
  const antes = JSON.parse(JSON.stringify({ rounds: dividido.rounds, matches: dividido.matches }));
  // primeiro quadro: a fase 0 ainda NÃO chegou
  dividido.rounds = [];
  const rotuloAntes = W._numeroGlobalDaRodada(dividido, 1, 0);
  ok('⭐⭐ sem a fase 0 hidratada o rótulo JÁ é Rodada 2 (a config declara a rodada)',
    rotuloAntes === 2, 'obtido ' + rotuloAntes);
  // as partes chegam
  dividido.rounds = antes.rounds;
  const rotuloDepois = W._numeroGlobalDaRodada(dividido, 1, 0);
  ok('⭐⭐ e depois da chegada continua Rodada 2 — o rótulo não pisca',
    rotuloDepois === rotuloAntes, 'antes ' + rotuloAntes + ' depois ' + rotuloDepois);
  const pr = W._phaseCurrentRoundProgress(dividido);
  ok('  → e a porta da rodada devolve o mesmo número nas duas leituras', pr.roundNumGlobal === 2);
}

console.log(falhas === 0 ? '\n✅ rodada-tem-numero-global-no-torneio: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);
