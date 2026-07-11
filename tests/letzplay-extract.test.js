/**
 * scoreplace.app — teste do EXTRATOR (letzplay-extract.js), núcleo puro.
 * Run: node tests/letzplay-extract.test.js
 * Usa primitives REAIS observados no letzplay (@RodrigoBarth) e valida a
 * lógica de parsing + a ponte extract → normalize (letzplay-import.js).
 */
global.window = {};
require('../js/views/letzplay-rating.js');
require('../js/views/letzplay-import.js');
require('../js/views/letzplay-extract.js');
var X = window._spExtract;
var I = window._spImport;

var passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}

// ── handleFromHref ──
console.log('\n📋 handleFromHref');
assert(X.handleFromHref('/GersomOtsu') === 'GersomOtsu', 'handle simples');
assert(X.handleFromHref('/MarceloBemelmans1') === 'MarceloBemelmans1', 'handle com dígito');
assert(X.handleFromHref('/u/matches/history') === null, 'rota /u/ ignorada');
assert(X.handleFromHref('/paineiras-bt/rankings/48552') === null, 'link de ranking ignorado');
assert(X.handleFromHref('/login') === null, 'reservado /login ignorado');
assert(X.handleFromHref('/paineiras-bt/tournaments/436041') === null, 'link de torneio ignorado');

// ── parseCategory ──
console.log('\n📋 parseCategory');
var pc = X.parseCategory('Social Masc D+ / C- | 2026 Rodada: 9');
assert(pc.categoryRaw === 'Social Masc D+ / C-', 'categoria antes do "|" (sem ano/rodada)');
assert(pc.year === 2026, 'ano extraído');
assert(pc.round === 9, 'rodada extraída');
var pc2 = X.parseCategory('BT SOCIAL - Cat Masculina D');
assert(pc2.categoryRaw === 'BT SOCIAL - Cat Masculina D' && pc2.round === null, 'sem "|" nem rodada');
var pt1 = X.parseCategory('Grupos • Finals ranking social 2025 - Finais Masculina D');
assert(pt1.categoryRaw === 'Masculina D', 'torneio: categoria = Masculina D (ignora "social")');
var pt2 = X.parseCategory('Grupos • Seletiva de mistas - PPP - Mista - D');
assert(pt2.categoryRaw === 'Mista D', 'torneio: "Mista - D" → "Mista D" (ignora "de mistas")');

// ── parseRankingRef ──
console.log('\n📋 parseRankingRef');
var rr = X.parseRankingRef('/paineiras-bt/rankings/48552');
assert(rr.club === 'paineiras-bt' && rr.rankingId === '48552', 'clube + id do ranking');

// ── matchFromCard (card REAL: rodada 9 do Social Masc D+/C-) ──
console.log('\n📋 matchFromCard (real, duplas rotativas da Liga social)');
var card = {
  catHref: '/paineiras-bt/rankings/48552',
  catText: 'Social Masc D+ / C- | 2026 Rodada: 9',
  dateText: '2026-06-20',
  teams: [
    { handles: ['GersomOtsu', 'JoaoScassa'], names: ['Gersom Otsu', 'João Scassa'], score: 3 },
    { handles: ['MarceloBemelmans1', 'RodrigoBarth'], names: ['Marcelo Bemelmans', 'Rodrigo Barth'], score: 6 }
  ]
};
var m = X.matchFromCard(card, 'RodrigoBarth');
assert(!!m, 'jogo montado (meu lado encontrado)');
assert(m.partnerHandle === 'MarceloBemelmans1', 'parceiro = o outro do meu time');
assert(m.oppHandles.join(',') === 'GersomOtsu,JoaoScassa', 'adversários = o outro time');
assert(m.won === true, 'venci (6 > 3)');
assert(m.categoryRaw === 'Social Masc D+ / C-' && m.round === 9 && m.club === 'paineiras-bt', 'categoria/rodada/clube');
assert(X.matchFromCard(card, 'AlguemQueNaoJogou') === null, 'card sem meHandle → null (defensivo)');
assert(m.official === false && m.kind === 'ranking', 'card de ranking → official:false (recreativo)');

// OFICIAL (torneio) vs recreativo
console.log('\n📋 Oficial (torneio) vs recreativo (ranking)');
var tCard = {
  catHref: '/paineiras-bt/tournaments/335721',
  catText: 'Grupos • Finals ranking social 2025 - Finais Masculina D',
  dateText: '2025-10-26', official: true,
  teams: [
    { handles: ['AlexandreKitahara2', 'FabioSimaoB'], names: [], score: 4 },
    { handles: ['GersomOtsu', 'RodrigoBarth'], names: [], score: 6 }
  ]
};
var tm = X.matchFromCard(tCard, 'RodrigoBarth');
assert(tm.official === true && tm.kind === 'tournament', 'card de torneio → official:true, kind:tournament');
assert(tm.categoryRaw === 'Masculina D' && tm.won === true, 'categoria do torneio parseada + vitória');

// ── ponte EXTRACT → NORMALIZE (ponta a ponta) ──
console.log('\n📋 Ponte extract → normalize (observações de terceiros)');
var extracted = [
  X.matchFromCard(card, 'RodrigoBarth'),
  X.matchFromCard({
    catHref: '/paineiras-bt/rankings/48552',
    catText: 'Social Masc D+ / C- | 2026 Rodada: 8',
    dateText: '2026-06-17',
    teams: [
      { handles: ['FabioRuggiero2', 'FabioSimaoB'], names: ['Fabio Ruggiero', 'Fábio Simão'], score: 6 },
      { handles: ['msmano', 'RodrigoBarth'], names: ['Max Mano', 'Rodrigo Barth'], score: 5 }
    ]
  }, 'RodrigoBarth')
];
var raw = {
  handle: 'RodrigoBarth', name: 'Rodrigo Barth', sports: ['Beach Tennis'],
  venues: ['Clube Paineiras do Morumby'], totals: { matches: 81, wins: 39, losses: 42 },
  ladder: 'beach-masc-2025', rankings: [], tournaments: [], matches: extracted
};
var norm = I.normalize(raw, { importedAt: '2026-07-10T15:00:00Z' });
assert(I.validate(norm).valid, 'letzplayImport gerado do extraído é VÁLIDO');
var obsHandles = norm.observations.map(function (o) { return o.anchors.handle; });
assert(obsHandles.indexOf('GersomOtsu') >= 0 && obsHandles.indexOf('FabioRuggiero2') >= 0
  && obsHandles.indexOf('MarceloBemelmans1') >= 0, 'adversários e parceiros viram observações');
assert(norm.observations.every(function (o) { return o.visible === false; }), 'observações nascem ocultas');

// ── Summary ──
console.log('\n' + '─'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(40));
process.exit(failed > 0 ? 1 : 0);
