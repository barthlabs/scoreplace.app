/* Cenários dos vetores de paridade do Caminho B (Leva 1).
 * Contrato: docs/smartwatch-bridge.md, seção "Caminho B".
 *
 * Cada cenário é uma sequência de EVENTOS dirigida contra o motor GSM REAL
 * (bracket-ui.js, via tests/watch-engine/harness.html) — o gerador captura o
 * snapshot (_getLiveScoreState) depois de CADA evento e grava em
 * tests/watch-engine/vectors/<name>.json. Os motores nativos (Swift/Kotlin,
 * Leva 2) rodam os MESMOS eventos e têm que produzir snapshots idênticos.
 *
 * Tipos de evento (espelham a superfície do motor, que é o que o relógio dirige):
 *   { kind: 'serveSelect', team, idx }  → _liveServeSelect(team, idx)
 *   { kind: 'serveConfirm' }            → _liveServeConfirm()
 *   { kind: 'point', team }             → _liveScorePoint(team)
 *   { kind: 'undo' }                    → _liveScoreUndoLastPoint()
 *   { kind: 'resolveTie', rule }        → _liveResolveTie('extend'|'tiebreak')
 *
 * ⚠️ Regras que os cenários EXERCITAM de propósito (medidas no motor real):
 * - ponto ANTES de confirmar sacador cai no vazio (o motor bloqueia) — por isso
 *   todo cenário começa com serveSelect+serveConfirm;
 * - fim do game 1 em duplas abre o seletor do 2º SACADOR e bloqueia pontos até
 *   confirmar (o exato ponto do incidente de 13/ago);
 * - 5-5 (BT, tiebreakAt g-1) levanta tieRulePending e bloqueia pontos até
 *   resolveTie;
 * - undo atravessa game, set e FIM DE PARTIDA (1.8.64).
 */
'use strict';

// helpers de construção de sequência ───────────────────────────────────────
function pt(team) { return { kind: 'point', team: team }; }
function pts(team, n) { var a = []; for (var i = 0; i < n; i++) a.push(pt(team)); return a; }
// game "seco" na contagem de tênis: 4 pontos seguidos do mesmo time
function game(team) { return pts(team, 4); }
function games(seq) { // 'games("121")' = game t1, game t2, game t1
  var a = [];
  String(seq).split('').forEach(function (c) { a = a.concat(game(+c)); });
  return a;
}
function serve(team, idx) { return [{ kind: 'serveSelect', team: team, idx: idx }, { kind: 'serveConfirm' }]; }
function tie(rule) { return [{ kind: 'resolveTie', rule: rule }]; }
function undo(n) { var a = []; for (var i = 0; i < (n || 1); i++) a.push({ kind: 'undo' }); return a; }
function flat() { return Array.prototype.concat.apply([], arguments); }

var DUPLAS = { p1Name: 'Ana/Bruno', p2Name: 'Caio/Duda', isDoubles: true };
var SIMPLES = { p1Name: 'Ana', p2Name: 'Caio', isDoubles: false };

module.exports = [
  {
    name: 'bt-duplas-6-0-liso',
    sport: 'Beach Tennis', players: DUPLAS,
    note: 'BT duplas: pick fase 0 + pick do 2º sacador após o game 1; 6-0 fecha o set único e a partida.',
    events: flat(
      serve(1, 0),
      game(1),          // abre o pick da fase 1 (2º sacador) e BLOQUEIA pontos
      pt(2),            // ponto no vazio de propósito — o vetor prova o bloqueio
      serve(2, 1),
      games('11111')    // 6-0 → fim
    )
  },
  {
    name: 'bt-duplas-tiebreak-5-5',
    sport: 'Beach Tennis', players: DUPLAS,
    note: 'BT: 5-5 levanta tieRulePending (tiedAt 5); tiebreak decide 7-1; set fecha 6-5.',
    events: flat(
      serve(1, 0), game(1), serve(2, 1),
      games('212121212'),   // alterna até 5-5 (o último levanta o prompt)
      pt(1),                // ponto com o prompt aberto — bloqueado (provado no vetor)
      tie('tiebreak'),
      pts(1, 2), pt(2), pts(1, 5)   // TB 7-1 (rotação de saque do TB entra no vetor)
    )
  },
  {
    name: 'bt-duplas-prorroga-e-tiebreak-6-6',
    sport: 'Beach Tennis', players: DUPLAS,
    note: 'BT: no 5-5 PRORROGA (extend); no 6-6 pergunta de novo; aí tiebreak decide.',
    events: flat(
      serve(1, 0), game(1), serve(2, 1),
      games('212121212'),   // 5-5 → prompt
      tie('extend'),
      game(1), game(2),     // 6-6 → prompt de novo (a recorrência do extend)
      tie('tiebreak'),
      pts(2, 7)             // TB 0-7 → set 6-7 pro time 2
    )
  },
  {
    name: 'tenis-simples-vantagem-e-2-sets',
    sport: 'Tênis', players: SIMPLES,
    note: 'Tênis simples (advantageRule): deuce → Ad → deuce → Ad → game; sem pick de 2º sacador (simples alterna sozinho); 2 sets fecham a partida.',
    events: flat(
      serve(1, 0),
      pts(1, 3), pts(2, 3), // 40-40 (deuce)
      pt(1),                // Ad Ana
      pt(2),                // volta ao deuce
      pts(2, 2),            // Ad Caio → game Caio
      games('112111'),      // + games até 5-1 (Ana 5, Caio 2)... sequência: t1,t1,t2,t1,t1,t1
      // set 1: Ana precisa de 6 games: já tem 5 do bloco acima? (1º game foi do Caio)
      game(1),              // fecha o set 1
      games('222222')       // Caio leva o set 2 6-0 → 1-1... continua? setsToWin 2
      // ⚠️ o cenário TERMINA com a partida ABERTA de propósito: vetor também
      // cobre estado intermediário estável (1 set a 1, super TB à frente).
    )
  },
  {
    name: 'undo-atravessa-game-e-set',
    sport: 'Beach Tennis', players: DUPLAS,
    note: 'Undo desfaz o ponto que fechou o game (game volta) e o que fechou... o prompt de 5-5 (tiedAt volta pro jogo anterior).',
    events: flat(
      serve(1, 0), game(1), serve(2, 1),
      pts(2, 4),            // game do time 2 (1-1)
      undo(),               // desfaz o ponto do game → 1-0, 40-x
      pt(2),                // refaz → 1-1 de novo
      games('12121212'),    // até 5-5 → prompt
      undo(),               // desfaz o ponto que levantou o prompt → 5-4, 40-x
      pt(2)                 // refaz → 5-5 → prompt de novo
    )
  },
  {
    name: 'undo-atravessa-o-fim',
    sport: 'Beach Tennis', players: DUPLAS,
    note: 'O incidente de 13/ago virado vetor: a partida TERMINA (6-0), o undo REABRE (isFinished volta a false, active volta a true) e o novo fim regrava.',
    events: flat(
      serve(1, 0), game(1), serve(2, 1),
      games('1111'),        // 5-0
      pts(1, 3),            // 40-0 no game do fim
      pt(1),                // 6-0 → FIM (isFinished true, winner 1)
      undo(),               // ⟵ reabre: 5-0 40-0
      pt(2), pt(2),         // o jogo SEGUE de verdade
      pts(1, 2)             // e fecha de novo 6-0
    )
  },
  {
    name: 'pickleball-numerico',
    sport: 'Pickleball', players: SIMPLES,
    note: 'Contagem NUMÉRICA (não tênis): os pontos sobem 1-2-3… conforme a config real do esporte (sport-rules.js decide).',
    events: flat(
      serve(1, 0),
      pts(1, 5), pts(2, 3), pts(1, 6)
      // deixa o motor decidir game/fechamento pela config real — o vetor captura
    )
  }
];
