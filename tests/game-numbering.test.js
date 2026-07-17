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

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' game-numbering: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
