/**
 * scoreplace.app — teste da ESTRUTURA de import (letzplay-import.js)
 * Run: node tests/letzplay-import.test.js
 * Alimenta o normalizador com dados REAIS de @RodrigoBarth (extraídos do letzplay)
 * e valida a estrutura canônica que vai pro Firestore.
 */
global.window = {};
require('../js/views/letzplay-rating.js');   // _spRating (bandForRating)
require('../js/views/letzplay-import.js');    // _spImport
var I = window._spImport;

var passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}

// ── raw REAL do Rodrigo (extraído do letzplay nesta sessão) ──
var rawRodrigo = {
  handle: 'RodrigoBarth', name: 'Rodrigo Barth', memberSince: '2022-03', gender: 'M',
  sports: ['Beach Tennis'],
  venues: ['Clube Paineiras do Morumby'],   // BTG Pactual é PATROCÍNIO de torneio, NÃO venue
  totals: { matches: 81, wins: 39, losses: 42 },
  ladder: 'beach-masc-2025',
  rankings: [
    { name: 'Social Masc D+ / C- | 2026', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Social Masc D+ / C-', gender: 'M', year: 2026, status: 'active', position: 5, players: 39, wins: 11, losses: 13, winPct: 45.8, points: 765 },
    { name: 'BT SOCIAL - Cat Masculina D', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Masculina D', gender: 'M', year: 2024, status: 'done', position: 3, players: 23, wins: 24, losses: 21, winPct: 53.3 }
  ],
  tournaments: [
    { name: 'Finals ranking social 2025 - Finais Masculina D', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Masculina D', gender: 'M', year: 2025, status: 'done', players: 8, title: false },
    { name: 'Seletiva de mistas - PPP - Mista - D', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Mista D', gender: 'X', year: 2025, status: 'done', players: 9, partnerName: 'Kelly Barth', partnerHandle: 'KellyBarth1', title: false },
    { name: 'Torneio Interno de Beach Tennis - BTG Pactual - Masculina 50', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Masculina 50', ageBand: 50, gender: 'M', year: 2024, status: 'done', players: 7, partnerName: 'Flavio Staudohar', partnerHandle: 'FlavioStaudohar', title: false },
    { name: 'Torneio Interno de Beach Tennis - BTG Pactual - Masculina D', club: 'paineiras-bt', sport: 'Beach Tennis', categoryRaw: 'Masculina D', gender: 'M', year: 2024, status: 'done', players: 9, partnerName: 'Flavio Staudohar', partnerHandle: 'FlavioStaudohar', title: false }
  ],
  matches: [
    { date: '2026-06-20', categoryRaw: 'Social Masc D+ / C-', round: 9, partnerHandle: 'MarceloBemelmans1', partnerName: 'Marcelo Bemelmans', oppHandles: ['GersomOtsu', 'JoaoScassa'], oppNames: ['Gersom Otsu', 'João Scassa'], won: true },
    { date: '2026-06-17', categoryRaw: 'Social Masc D+ / C-', round: 8, partnerHandle: 'msmano', partnerName: 'Max Mano', oppHandles: ['FabioRuggiero2', 'FabioSimaoB'], oppNames: ['Fabio Ruggiero', 'Fábio Simão'], won: false }
  ]
};

var out = I.normalize(rawRodrigo, { importedAt: '2026-07-10T15:00:00Z' });

// ── Validação estrutural ──
console.log('\n📋 Validação da estrutura');
var v = I.validate(out);
assert(v.valid, 'estrutura VÁLIDA' + (v.valid ? '' : ' — erros: ' + v.errors.join('; ')));
assert(I.validate({ source: 'x' }).valid === false, 'objeto inválido é rejeitado');

// ── Identidade + perfil ──
console.log('\n📋 Identidade e perfil');
assert(out.source === 'letzplay' && out.version === I.SCHEMA_VERSION, 'source + version');
assert(out.handle === 'RodrigoBarth', 'handle canônico');
assert(out.importedAt === '2026-07-10T15:00:00Z', 'importedAt vem de fora (puro)');
assert(out.profile.totals.matches === 81, 'totais preservados');
assert(out.profile.venues.length === 1 && /Paineiras/.test(out.profile.venues[0]), 'venue = clube (BTG Pactual NÃO virou venue)');

// ── Footprint ──
console.log('\n📋 Footprint (rankings + torneios)');
assert(out.footprint.length === 6, 'footprint tem 6 entradas (2 rankings + 4 torneios)');
var ageEntry = out.footprint.filter(function (f) { return f.ageBand === 50; })[0];
assert(!!ageEntry, 'categoria de IDADE (Masc 50) detectada com ageBand=50');

// ── Oficial (torneio) vs recreativo (ranking) ──
console.log('\n📋 Oficial vs recreativo (torneio manda no anti-gato)');
assert(out.footprint.filter(function (f) { return f.official; }).length === 4, '4 torneios marcados official:true');
assert(out.footprint.filter(function (f) { return f.ctx === 'ranking'; }).every(function (f) { return f.official === false; }), 'rankings são recreativos (official:false)');
assert(out.officialCategory && out.officialCategory.skill === 'D', 'categoria OFICIAL = D (torneio Masculina D; Masc 50 ignorada por idade)');

// ── Categorias multi-competição ──
console.log('\n📋 Categorias por competição (ranking=pontos, torneio=conquista)');
var rankCat = out.categories.filter(function (c) { return /D\+ \/ C-/.test(c.categoryRaw) && c.rule === 'points'; })[0];
var tourCat = out.categories.filter(function (c) { return c.categoryRaw === 'Masculina D' && c.rule === 'achievement'; })[0];
assert(!!rankCat, 'ranking D+/C- com rule=points');
assert(!!tourCat, 'torneio Masculina D com rule=achievement (sobe ao vencer)');

// ── Rating derivado ──
console.log('\n📋 Rating medido (semeado da categoria mais forte)');
assert(out.rating && typeof out.rating.value === 'number', 'rating.value numérico');
assert(out.rating.value > 1450 && out.rating.value < 1590, 'rating cai na faixa D+/C- (' + out.rating.value + ')');
assert(out.rating.band === 'D+/C-', 'banda derivada = D+/C- (' + out.rating.band + ')');

// ── Duplas ──
console.log('\n📋 Duplas (parceria + categoria)');
var kelly = out.pairs.filter(function (p) { return p.partnerHandle === 'KellyBarth1'; })[0];
assert(!!kelly && kelly.categoryRaw === 'Mista D', 'dupla com Kelly registrada como Mista D');
assert(out.pairs.filter(function (p) { return p.partnerHandle === 'FlavioStaudohar'; }).length >= 1, 'dupla com Flavio registrada');

// ── Observações de terceiros (ocultas) ──
console.log('\n📋 Observações de terceiros (efeito rede, ocultas)');
var handles = out.observations.map(function (o) { return o.anchors.handle; });
assert(handles.indexOf('GersomOtsu') !== -1 && handles.indexOf('FabioRuggiero2') !== -1, 'adversários viram observações por handle');
assert(handles.indexOf('MarceloBemelmans1') !== -1, 'parceiro também vira observação');
assert(out.observations.every(function (o) { return o.visible === false; }), 'TODAS nascem visible:false');
assert(out.observations.every(function (o) { return o.sourceImport === '@RodrigoBarth'; }), 'fonte do import marcada');

// ── seedRating: faixa sobreposta = média dos tokens ──
console.log('\n📋 seedRating');
var sdMid = I.seedRating('Social Masc D+ / C-', 50, 24);
assert(sdMid.value >= 1490 && sdMid.value <= 1510, 'D+/C- a 50% ≈ 1500 (média D+ e C-)');
assert(I.skillTokens('Social Masc D+ / C-').sort().join(',') === 'C-,D+', 'tokens de skill = [C-, D+] (ignora Masc)');

// ── Summary ──
console.log('\n' + '─'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(40));
process.exit(failed > 0 ? 1 : 0);
