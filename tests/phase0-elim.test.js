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

// ── 6 jogadores: ÁRVORE MÍNIMA → 3 jogos exatos, ZERO folga, ninguém some ──
//
// Era "pow2=8 → 2 BYEs". A chave deixou de ser inflada até a potência de 2 (decisão do
// dono, jul/2026: o desenho novo SUBSTITUI o anterior, com menos repescagens e poucos
// byes). Com 6 inscritos a 1ª rodada tem piso(6/2)=3 jogos reais e não sobra ninguém —
// não há vaga para preencher, então não há folga nem repescagem para criar.
(function () {
  var t = runDraw(mkT(6, { p2Resolution: 'bye' }));
  var r1 = byRound(t, 1);
  ok(r1.length === 3, '6 jogadores → 3 jogos na R1 (piso(6/2)) [' + r1.length + ']');
  ok(r1.every(function (m) { return !m.isBye; }), '6 jogadores → ZERO folga na R1 (N par não deixa sobra)');
  ok(r1.every(function (m) { return !m.isRepechageSlot; }), '6 jogadores → ZERO repescagem na R1');
  ok(realNames(t).length === 6, '6 jogadores → todos os 6 preservados (ninguém some)');
})();

// ── 7 jogadores: N ÍMPAR deixa UMA sobra, e ela entra por REPESCAGEM (nunca folga) ──
// Regra do dono: a sobra da 1ª rodada da principal é o ÚLTIMO INSCRITO (emparelhamento
// adjacente + tardio entra na próxima posição livre). Folga ali seria "quem chegou por
// último avança sem jogar". Ele joga contra o perdedor do 1º jogo da rodada.
(function () {
  var t = runDraw(mkT(7, { p2Resolution: 'bye' }));
  var r1 = byRound(t, 1);
  ok(r1.length === 4, '7 jogadores → 4 jogos na R1 (teto(7/2)) [' + r1.length + ']');
  ok(r1.filter(function (m) { return m.isRepechageSlot; }).length === 1, '7 jogadores → exatamente 1 repescagem na R1');
  ok(r1.every(function (m) { return !m.isBye; }), '7 jogadores → ZERO folga na R1 (a sobra joga a repescagem)');
  ok(realNames(t).length === 7, '7 jogadores → todos os 7 preservados (ninguém some)');
})();

// ── VIP na Fase 0: não existe mais folga na 1ª rodada para dar a ninguém ──
//
// MUDANÇA DE COMPORTAMENTO, deliberada. Antes, a chave inflada criava B−N vagas na R1
// e o `seedVip` as entregava aos VIPs — era assim que "VIP folga" funcionava. Na árvore
// mínima a R1 é toda de jogos reais (no máximo uma repescagem, quando N é ímpar), então
// não há folga a distribuir e o VIP entra em quadra como todo mundo. O que continua
// valendo, e é o que este bloco tranca, é que o VIP não pode SUMIR nem ser duplicado
// pelo sorteio.
(function () {
  var t = mkT(6, { p2Resolution: 'bye', vips: { P3: true, P5: true } });
  runDraw(t);
  var r1 = byRound(t, 1);
  ok(r1.every(function (m) { return !m.isBye; }), 'VIP: N par não abre folga nem para VIP [' + r1.filter(function (m) { return m.isBye; }).length + ' bye(s)]');
  var nomes = realNames(t);
  ok(nomes.indexOf('P3') !== -1 && nomes.indexOf('P5') !== -1, 'VIP: P3 e P5 continuam na chave [' + JSON.stringify(nomes) + ']');
  var vezes = {};
  r1.forEach(function (m) { [m.p1, m.p2].forEach(function (p) { if (p) vezes[p] = (vezes[p] || 0) + 1; }); });
  ok(vezes.P3 === 1 && vezes.P5 === 1, 'VIP: cada VIP ocupa exatamente 1 slot (sem duplicar)');
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
