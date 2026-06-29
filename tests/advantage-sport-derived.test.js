/* VANTAGEM (DEUCE) DERIVADA DO ESPORTE — node tests/advantage-sport-derived.test.js
 *
 * Congela a decisão de produto (dono, 29/jun): a "Regra de vantagem (deuce 40-40)" NÃO é mais
 * escolha manual (toggle removido) — é DERIVADA DO ESPORTE. Só o Tênis tem AD; todos os demais
 * = sem vantagem. ("Ganhar por 2 pontos" do vôlei/futevôlei é set-level, OUTRA coisa — não é deuce.)
 * Lê os defaults REAIS de create-tournament.js (window._sportScoringDefaults / _gsmAdvantageDefault).
 */
const H = require('./headless.js');
H.load('create-tournament.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const defs = W._sportScoringDefaults;
ok(defs && typeof defs === 'object', '_sportScoringDefaults existe');

// Só o Tênis tem vantagem (deuce); todos os outros = false.
ok(defs['Tênis'].advantageRule === true, 'Tênis tem vantagem (deuce) por padrão');
['Beach Tennis', 'Pickleball', 'Tênis de Mesa', 'Padel', 'Vôlei de Praia', 'Futevôlei', '_default'].forEach((s) => {
  ok(defs[s] && defs[s].advantageRule === false, '[' + s + '] sem vantagem (deuce) por padrão');
});

// nenhum esporte além do Tênis pode ter advantageRule:true
var withAd = Object.keys(defs).filter((s) => defs[s].advantageRule === true);
ok(withAd.length === 1 && withAd[0] === 'Tênis', 'somente Tênis com advantageRule:true (got [' + withAd.join(',') + '])');

// _gsmAdvantageDefault (fonte da derivação) = só Tênis
ok(W._gsmAdvantageDefault && W._gsmAdvantageDefault['Tênis'] === true, '_gsmAdvantageDefault tem Tênis:true');
ok(Object.keys(W._gsmAdvantageDefault).length === 1, '_gsmAdvantageDefault só tem Tênis');

// esportes no-ad travados (não podem ter deuce nem por engano)
['Beach Tennis', 'Padel', 'Pickleball', 'Tênis de Mesa'].forEach((s) => {
  ok(W._gsmNoAdLocked && W._gsmNoAdLocked[s] === true, '[' + s + '] travado como no-ad');
});

// o toggle manual não existe mais no fluxo: _gsmGetAdvantageForSport é a derivação canônica
ok(typeof W._gsmGetAdvantageForSport === 'function', '_gsmGetAdvantageForSport (derivação) existe');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' advantage-sport-derived: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
