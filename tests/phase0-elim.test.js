/* Eliminatória da Fase 0 roteada pelo núcleo único genTierBracket — node tests/phase0-elim.test.js
 *
 * Increment 8 do motor canônico (swap da Eliminatória Simples da Fase 0). Roda a
 * generateDrawFunction REAL (tournaments-draw.js) num sandbox headless e confere que
 * a chave sai do núcleo (genTierBracket): seed 1×N com nextSlot explícito (≠ legado
 * _buildNextMatchLinks, que só seta nextMatchId), BYEs auto-avançados, VIP folga,
 * categorias independentes. O seed em si já é travado por tests/elim-seed.test.js.
 */
const { window, load } = require('./headless.js');

// ── stubs de I/O e helpers de identidade que vivem no store.js (Firebase-bound) ──
let _curT = null;
window._findTournamentById = function () { return _curT; };
window.AppStore = {
  logAction: function () {},
  getTournament: function () { return _curT; },
  syncImmediate: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
  // Blindagem: _commitInitialDraw usa commitDrawTx. Este é um teste do MOTOR (asserção
  // sobre a chave no `t` local, já mutada otimisticamente), não de persistência — a
  // prova de corrida vive em tests/concurrency (emulador). Stub thenable no-op.
  commitDrawTx: function () { return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; },
};
window._notifyDrawPersonalized = function () {};
window.showAlertDialog = function () {};
window.showNotification = function () {};
// Gate de pré-sorteio (potência de 2 / ímpar): em produção o painel é quem seta
// t.p2Resolution. No teste, replicamos o cálculo e bypassamos os painéis (não-pow2
// roda com t.p2Resolution já escolhido, igual ao fluxo real).
window.checkPowerOf2 = function (t) {
  var n = (t.participants || []).length;
  return { count: n, isPowerOf2: (n & (n - 1)) === 0, teamSize: t.teamSize || 1 };
};
window.showPowerOf2Panel = function () {};
window.checkOddEntries = function () { return { isOdd: false }; };
window.showOddEntriesPanel = function () {};
window.document = { getElementById: function () { return null; }, body: { style: {} } };
window.location = { hash: '' };
// Identidade (réplica fiel mínima — single-elim individual): nome canônico = displayName,
// VIP por presença em t.vips[name], sem membros de time.
window._pName = function (p) { return typeof p === 'string' ? p : (p.displayName || p.name || ''); };
window._entryTeamMembers = function () { return null; };
window._entryHasVip = function (t, p) {
  var nm = window._pName(p);
  return !!(t && t.vips && t.vips[nm]);
};
window._formDoublesTeams = function (parts) { return { participants: parts, newTeamsCount: 0, leftoverCount: 0, allMaleCount: 0 }; };

load('draw-cores.js');
load('tournaments-draw.js');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

function mkT(n, extra) {
  var parts = [];
  for (var i = 1; i <= n; i++) parts.push({ displayName: 'P' + i, name: 'P' + i });
  var t = Object.assign({ id: 'x', format: 'Eliminatórias Simples', teamSize: 1, participants: parts }, extra || {});
  return t;
}
function runDraw(t) { _curT = t; window.generateDrawFunction('x'); return t; }
// rodadas da CHAVE (exclui o jogo de 3º/4º, que o motor canônico gera no sorteio).
function byRound(t, r) { return (t.matches || []).filter(function (m) { return m.round === r && !m.isThirdPlace; }); }
function realNames(t) {
  var s = {};
  byRound(t, 1).forEach(function (m) {
    [m.p1, m.p2].forEach(function (p) { if (p && p !== 'TBD' && p !== 'BYE' && p !== 'BYE (Avança Direto)') s[p] = 1; });
  });
  byRound(t, 1).forEach(function (m) { if (m.isBye && m.winner) s[m.winner] = 1; });
  return Object.keys(s);
}

// ── 8 jogadores (potência de 2): 4+2+1, sem BYE, nextSlot presente (prova do núcleo) ──
(function () {
  var t = runDraw(mkT(8));
  ok(byRound(t, 1).length === 4 && byRound(t, 2).length === 2 && byRound(t, 3).length === 1, '8 jogadores → 4/2/1 por rodada [' + byRound(t, 1).length + '/' + byRound(t, 2).length + '/' + byRound(t, 3).length + ']');
  ok(byRound(t, 1).every(function (m) { return !m.isBye; }), '8 jogadores → R1 sem BYE');
  ok(byRound(t, 1).every(function (m) { return m.nextMatchId && (m.nextSlot === 'p1' || m.nextSlot === 'p2'); }), '8 jogadores → R1 com nextMatchId + nextSlot (saiu do núcleo)');
  ok(byRound(t, 1).every(function (m) { return m.team1Obj && m.team2Obj; }), 'shape canônico: R1 com team1Obj/team2Obj (uid preservado)');
  ok((t.matches || []).every(function (m) { return m.bracket === 'main'; }), 'shape canônico: m.bracket === "main" (linha única, render único)');
  ok(t._canonicalDraw === true, 'Fase 0 marcada como canônica (render único via _renderPhaseBracket)');
  ok(realNames(t).length === 8, '8 jogadores → todos os 8 na R1');
})();

// ── 6 jogadores: pow2=8 → 2 BYEs, BYEs auto-avançados pra R2, ninguém some ──
// (não-pow2 → fluxo real exige t.p2Resolution já escolhido no painel = 'bye')
(function () {
  var t = runDraw(mkT(6, { p2Resolution: 'bye' }));
  var byes = byRound(t, 1).filter(function (m) { return m.isBye; });
  ok(byes.length === 2, '6 jogadores → 2 BYEs na R1 [' + byes.length + ']');
  ok(byes.every(function (m) { return m.winner; }), '6 jogadores → cada BYE tem vencedor (auto-avança)');
  // os vencedores de BYE caem na R2 já preenchidos (pXFromBye)
  var r2 = byRound(t, 2);
  var seeded = r2.some(function (m) { return m.p1FromBye || m.p2FromBye; });
  ok(seeded, '6 jogadores → R2 recebe os vencedores de BYE pré-preenchidos (p1FromBye/p2FromBye)');
  ok(realNames(t).length === 6, '6 jogadores → todos os 6 preservados (ninguém some)');
})();

// ── VIP folga: 2 VIPs num sorteio de 6 → eles são os vencedores dos BYEs ──
(function () {
  var t = mkT(6, { p2Resolution: 'bye', vips: { P3: true, P5: true } });
  runDraw(t);
  var byeWinners = byRound(t, 1).filter(function (m) { return m.isBye; }).map(function (m) { return m.winner; });
  ok(byeWinners.indexOf('P3') !== -1 && byeWinners.indexOf('P5') !== -1, 'VIP folga → P3 e P5 (VIPs) recebem os BYEs [byes ' + JSON.stringify(byeWinners) + ']');
})();

// ── Categorias: 2 categorias → 2 chaves independentes, matches marcados ──
(function () {
  var parts = [];
  for (var i = 1; i <= 4; i++) parts.push({ displayName: 'A' + i, name: 'A' + i, categories: ['Fem A'] });
  for (var j = 1; j <= 4; j++) parts.push({ displayName: 'B' + j, name: 'B' + j, categories: ['Masc A'] });
  var t = { id: 'x', format: 'Eliminatórias Simples', teamSize: 1, participants: parts, combinedCategories: ['Fem A', 'Masc A'] };
  runDraw(t);
  var fem = (t.matches || []).filter(function (m) { return m.category === 'Fem A' && !m.isThirdPlace; });
  var masc = (t.matches || []).filter(function (m) { return m.category === 'Masc A' && !m.isThirdPlace; });
  ok(fem.length === 3 && masc.length === 3, '2 categorias (4+4) → 3 jogos de chave por categoria [' + fem.length + '/' + masc.length + ']');
  ok((t.matches || []).every(function (m) { return m.category === 'Fem A' || m.category === 'Masc A'; }), 'todo match marcado com a categoria');
})();

// ── 1 inscrito na categoria → campeão por BYE (preserva o legado) ──
// (count<2 → painel bloquearia; com t.p2Resolution setado o gate é pulado)
(function () {
  var t = runDraw(mkT(1, { p2Resolution: 'bye' }));
  ok((t.matches || []).length === 1 && t.matches[0].isBye && t.matches[0].winner === 'P1', '1 jogador → 1 jogo BYE, campeão P1');
})();

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' phase0-elim: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
