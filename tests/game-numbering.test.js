/* "JOGO N" — FONTE ÚNICA. node tests/game-numbering.test.js
 *
 * Cânone (project_game_numbering_canonical): `window._assignGlobalGameNumbers(t)` (bracket.js)
 * carimba `m._gameNum` em TODO jogo real; Rei/Rainha numera POR GRUPO (ordem do array de
 * grupos). Todo render lê `m._gameNum` — PROIBIDO 2º contador, ZERO fallback.
 *
 * BUG REAL travado aqui (dono, 17/jul, Confra staging tour_1780009816637): a dashboard mostrava
 * "👑 JOGO 73" no card "Próximo Jogo" enquanto a CHAVE mostrava "Jogo 19 (20 e 21)" pro mesmo
 * jogo. Causa: existia um 2º numerador SÓ pra Rei/Rainha (`window._monarchGlobalJogoNum`,
 * store.js) que espelhava um bracket ANTIGO ("os jogos dos OUTROS grupos contam primeiro e o
 * grupo do usuário vem depois" → 73) e NUNCA foi atualizado quando o canônico passou a numerar
 * na ordem dos grupos (→ 19). O cânone estava só na memória, sem teste → derivou.
 *
 * Este arquivo é a trava: (1) o canônico numera por grupo; (2) o 2º numerador NÃO existe.
 */
const H = require('./render-harness');
const W = H.window, buildViaDraw = H.buildViaDraw;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== "Jogo N" — fonte única ==');

ok(typeof W._assignGlobalGameNumbers === 'function', '_assignGlobalGameNumbers existe (o canônico)');

// ── [ANTI-2º-CONTADOR] o numerador rogue de Rei/Rainha NÃO pode voltar ──────────
// store.js É carregado por este harness, então isto testa de verdade.
ok(typeof W._monarchGlobalJogoNum === 'undefined',
  '[ANTI-2º] _monarchGlobalJogoNum NÃO existe — Rei/Rainha usa o MESMO numerador de todo mundo');

// ── Rei/Rainha: 28 jogadores → 7 grupos × 3 jogos = 21. Numeração POR GRUPO. ────
(function () {
  const t = buildViaDraw('Liga', 28, { ligaRoundFormat: 'rei_rainha', drawMode: 'rei_rainha', drawManual: true });
  W._assignGlobalGameNumbers(t);
  const rd = (t.rounds || [])[0] || {};
  const groups = rd.monarchGroups || [];
  ok(groups.length === 7, '28 jogadores → 7 grupos (got ' + groups.length + ')');

  // Cada grupo g (índice gi) tem 3 jogos e recebe os números 3*gi+1 .. 3*gi+3, NA ORDEM DO ARRAY
  // de grupos — nunca "o grupo do usuário por último".
  let ordemOk = true, detalhe = '';
  groups.forEach(function (g, gi) {
    const ms = (g && g.matches) || [];
    if (ms.length !== 3) { ordemOk = false; detalhe += ' g' + gi + ':len=' + ms.length; return; }
    ms.forEach(function (m, k) {
      const esperado = gi * 3 + k + 1;
      if (m._gameNum !== esperado) { ordemOk = false; detalhe += ' g' + gi + '[' + k + ']=' + m._gameNum + '≠' + esperado; }
    });
  });
  ok(ordemOk, '[CANON] numeração POR GRUPO: grupo gi → jogos 3gi+1..3gi+3' + detalhe);

  // O CASO DO DONO: o 7º grupo (índice 6) é 19/20/21 — jamais 73.
  const g7 = (groups[6] && groups[6].matches) || [];
  ok(g7.length === 3 && g7[0]._gameNum === 19 && g7[1]._gameNum === 20 && g7[2]._gameNum === 21,
    '[BUG-73] 7º grupo → Jogo 19, 20, 21 (o que a CHAVE mostra) — got ' + g7.map(function (m) { return m._gameNum; }).join(','));

  // Sem colisão e todo jogo real numerado.
  const nums = [];
  groups.forEach(function (g) { ((g && g.matches) || []).forEach(function (m) { nums.push(m._gameNum); }); });
  ok(nums.length === 21 && nums.every(function (n) { return typeof n === 'number' && n >= 1; }), 'todos os 21 jogos numerados — got ' + nums.length);
  ok(new Set(nums).size === nums.length, 'sem colisão de número (21 únicos) — got ' + new Set(nums).size);

  // O array plano confirma pelas MESMAS ids (grupo e plano batem — nada de 2 números pro mesmo jogo).
  let flatOk = true;
  const byId = {};
  groups.forEach(function (g) { ((g && g.matches) || []).forEach(function (m) { byId[m.id] = m._gameNum; }); });
  ((rd.matches) || []).forEach(function (m) {
    if (m && m.isMonarch && byId[m.id] != null && m._gameNum !== byId[m.id]) flatOk = false;
  });
  ok(flatOk, '[CANON] array plano e grupo dão o MESMO número pro mesmo id');
})();


// ── Eliminatórias por linha: rodada é o eixo externo ──────────────────────────
(function () {
  const match = function (id, category, bracket, round) {
    return { id, category, bracket, round, p1: id + ' A', p2: id + ' B' };
  };
  const t = {
    skillCategories: ['A', 'B', 'C', 'D'],
    matches: [
      // Inserção deliberadamente fora da ordem: o canônico não pode depender dela.
      match('a-g2', 'Fem A', 'gold', 2), match('d-s2', 'Fem D', 'silver', 2),
      match('d-g1', 'Fem D', 'gold', 1), match('a-s1', 'Fem A', 'silver', 1),
      match('d-g2', 'Fem D', 'gold', 2), match('a-g1', 'Fem A', 'gold', 1),
      match('d-s1', 'Fem D', 'silver', 1), match('a-s2', 'Fem A', 'silver', 2)
    ]
  };
  W._assignGlobalGameNumbers(t);
  const got = Object.fromEntries(t.matches.map(function (m) { return [m.id, m._gameNum]; }));
  const expected = {
    'd-g1': 1, 'd-s1': 2, 'd-g2': 3, 'd-s2': 4,
    'a-g1': 5, 'a-s1': 6, 'a-g2': 7, 'a-s2': 8
  };
  const sequenceOk = Object.keys(expected).every(function (id) { return got[id] === expected[id]; });
  ok(sequenceOk,
    '[CANON] categoria mais baixa completa primeiro; dentro dela R1 Ouro/Prata, depois R2 Ouro/Prata — got ' + JSON.stringify(got));
})();

// ── Marca de partes velha não pode congelar números depois da hidratação. ────────
(function () {
  const t = {
    _semPesados: ['matches'], _nJogos: 2, _faltamPesados: true,
    matches: [
      { id: 'late-gold-R1-P2', bracket: 'gold', round: 1, p1: 'A', p2: 'B' },
      { id: 'late-gold-R1-P1', bracket: 'gold', round: 1, p1: 'C', p2: 'D' }
    ]
  };
  W._assignGlobalGameNumbers(t);
  ok(!t._faltamPesados && t.matches[1]._gameNum === 1 && t.matches[0]._gameNum === 2,
    '[HIDRATAÇÃO] marcador velho é recalculado antes de numerar a chave completa');
})();

// ── Inscritos/histórico pendentes não podem bloquear a chave já completa. ─────────
(function () {
  const t = {
    _semPesados: ['participants'], _nPartes: { participants: 1 },
    _faltamPesados: true, _faltaOQue: ['participants'],
    matches: [
      { id: 'complete-gold-R1-P2', bracket: 'gold', round: 1, p1: 'A', p2: 'B' },
      { id: 'complete-gold-R1-P1', bracket: 'gold', round: 1, p1: 'C', p2: 'D' }
    ]
  };
  W._assignGlobalGameNumbers(t);
  ok(t.matches[1]._gameNum === 1 && t.matches[0]._gameNum === 2,
    '[HIDRATAÇÃO] parte não estrutural pendente não bloqueia a numeração da chave');
})();

// ── Chave entregue em lote preserva o carimbo do servidor. ───────────────────────
(function () {
  const t = {
    _nJogos: 3,
    matches: [
      { id: 'loaded-gold-R1-P1', bracket: 'gold', round: 1, p1: 'A', p2: 'B', _gameNum: 123 },
      { id: 'loaded-gold-R2-P1', bracket: 'gold', round: 2, p1: 'C', p2: 'D', _gameNum: 141 }
    ]
  };
  W._assignGlobalGameNumbers(t);
  ok(t.matches[0]._gameNum === 123 && t.matches[1]._gameNum === 141,
    '[LOTE PARCIAL] não recomeça em 1 nem sobrescreve o número persistido enquanto falta jogo');
})();

// ── Posição P<n>: IDs do Firestore ordenam P10 antes de P2 se tratados como texto. ──
(function () {
  const match = function (id, bracket) { return { id, bracket, round: 1, p1: id + ' A', p2: id + ' B' }; };
  const t = {
    matches: [
      // É a ordem que uma leitura lexical do Firestore pode fornecer.
      match('tour-gold-R1-P10', 'gold'), match('tour-silver-R1-P2', 'silver'),
      match('tour-gold-R1-P2', 'gold'), match('tour-silver-R1-P1', 'silver'),
      match('tour-gold-R1-P1', 'gold')
    ]
  };
  W._assignGlobalGameNumbers(t);
  const got = Object.fromEntries(t.matches.map(function (m) { return [m.id, m._gameNum]; }));
  const expected = {
    'tour-gold-R1-P1': 1, 'tour-gold-R1-P2': 2, 'tour-gold-R1-P10': 3,
    'tour-silver-R1-P1': 4, 'tour-silver-R1-P2': 5
  };
  ok(Object.keys(expected).every(function (id) { return got[id] === expected[id]; }),
    '[CANON] dentro da rodada, P1/P2/P10 usa posição numérica; depois vem a mesma rodada da Prata — got ' + JSON.stringify(got));
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' game-numbering: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
