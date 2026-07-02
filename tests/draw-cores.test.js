/* Núcleos de sorteio pool-based — node tests/draw-cores.test.js
 * Prova que buildGroupsCore (extração da Fase 0) gera grupos corretos e CONSERVA o pool
 * (ninguém some/duplica), com shuffle/now injetados (determinístico). roundRobin = o núcleo
 * REAL compartilhado (window._roundRobinSchedule via harness).
 */
const { window: W } = require('./headless.js');
const { buildGroupsCore } = require('../js/views/draw-cores.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' (veio ' + JSON.stringify(a) + ')');

const ID = (a) => a;                         // shuffle determinístico = identidade
const NOW = 1700000000000;
const base = { roundRobin: W._roundRobinSchedule, groupName: (i) => 'Grupo ' + String.fromCharCode(65 + i), safeHtml: (s) => s, shuffle: ID, now: NOW };
function names(n) { const a = []; for (let i = 0; i < n; i++) a.push('P' + i); return a; }
function membersAll(res) {
  return res.groups.reduce((acc, g) => acc.concat(g.participants), []).concat(res.waitNames);
}

// ── 1. Distribuição módulo (8 → 2 grupos), conservação, round-robin presente ──
(function () {
  const pool = names(8);
  const r = buildGroupsCore(pool, Object.assign({}, base, { numGroups: 2 }));
  eq(r.groups.map((g) => g.participants), [['P0', 'P2', 'P4', 'P6'], ['P1', 'P3', 'P5', 'P7']], '1: módulo distribui intercalado');
  eq(r.waitNames, [], '1: sem suplentes (8 cabe em 2 grupos)');
  const all = membersAll(r);
  ok(all.length === 8 && new Set(all).size === 8, '1: conservação — 8 nomes, sem duplicata');
  ok(r.groups.every((g) => g.rounds.length > 0 && g.standings.length === 4), '1: cada grupo tem rodadas + 4 standings');
  // round-robin de 4 = 3 rodadas; ids determinísticos com now fixo
  ok(r.groups[0].rounds.length === 3, '1: grupo de 4 → 3 rodadas (round-robin)');
  ok(r.groups[0].rounds[0].matches[0].id.indexOf('-' + NOW) !== -1, '1: id usa o now injetado (determinístico)');
  ok(r.groups[0].rounds[0].status === 'active' && r.groups[0].rounds[1].status === 'pending', '1: 1ª rodada ativa, demais pending');
})();

// ── 2. "Apenas grupos de mesmo tamanho": 7 → 2 grupos = 3+3, 1 suplente ───────
(function () {
  const pool = names(7);
  const r = buildGroupsCore(pool, Object.assign({}, base, { numGroups: 2, equalOnly: true }));
  ok(r.groups[0].participants.length === 3 && r.groups[1].participants.length === 3, '2: grupos iguais 3+3');
  eq(r.waitNames, ['P6'], '2: excedente (P6) vira suplente');
  const all = membersAll(r);
  ok(all.length === 7 && new Set(all).size === 7, '2: conservação — ninguém some');
})();

// ── 3. Cabeças de chave VIP: VIPs primeiro → 1 por grupo ──────────────────────
(function () {
  const pool = names(8); // VIPs = P5, P7 (no fim do pool); seed deve trazê-los pra frente
  const vip = { P5: 1, P7: 1 };
  const r = buildGroupsCore(pool, Object.assign({}, base, { numGroups: 2, seedVip: true, isVip: (n) => !!vip[n] }));
  // vipFirst=[P5,P7] + rest=[P0,P1,P2,P3,P4,P6] → módulo: grupo A pega P5 (idx0), grupo B pega P7 (idx1)
  ok(r.groups[0].participants[0] === 'P5' && r.groups[1].participants[0] === 'P7', '3: 1 VIP por grupo (espalhado)');
  const all = membersAll(r);
  ok(all.length === 8 && new Set(all).size === 8, '3: conservação com VIP');
})();

// ── 4. Cabeças por categoria: espalha cada categoria entre grupos ─────────────
(function () {
  const pool = ['A1', 'A2', 'B1', 'B2']; // 2 da cat A, 2 da cat B
  const cat = { A1: 'A', A2: 'A', B1: 'B', B2: 'B' };
  const r = buildGroupsCore(pool, Object.assign({}, base, { numGroups: 2, seedCategory: true, catOf: (n) => cat[n] }));
  // ordena estável por categoria → [A1,A2,B1,B2]; módulo → grupo A=[A1,B1], grupo B=[A2,B2]
  ok(r.groups[0].participants.indexOf('A1') !== -1 && r.groups[0].participants.indexOf('B1') !== -1, '4: categoria espalhada (grupo A tem 1 A + 1 B)');
  const all = membersAll(r);
  ok(all.length === 4 && new Set(all).size === 4, '4: conservação com categoria');
})();

// ── 5. Rei/Rainha (monarch): o núcleo das 3 pairings rotativas é _buildMonarchGroup ──
// (buildMonarchCore foi removido — campanha kill-monarch-format: monarch roda no motor
// league incremental; o núcleo ÚNICO das pairings continua sendo _buildMonarchGroup.)
(function () {
  const g0 = W._buildMonarchGroup({ roundNum: 1, roundIndex: 0, gi: 0, players: ['P0', 'P1', 'P2', 'P3'], ts: NOW });
  const ms = g0.matches;
  ok(ms.length === 3, '5: 3 jogos por grupo');
  eq(ms.map((m) => [m.team1.join(''), m.team2.join('')]),
    [['P0P1', 'P2P3'], ['P0P2', 'P1P3'], ['P0P3', 'P1P2']], '5: pairings rotativas AB/CD, AC/BD, AD/BC');
  ok(ms[0].p1 === 'P0 / P1' && ms[0].p2 === 'P2 / P3', '5: p1/p2 com " / "');
  ok(ms.every((m) => m.isMonarch && m.monarchGroup === 0 && m.winner === null), '5: isMonarch + monarchGroup');
  eq(g0.players, ['P0', 'P1', 'P2', 'P3'], '5: grupo conserva os 4 jogadores');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' draw-cores: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
