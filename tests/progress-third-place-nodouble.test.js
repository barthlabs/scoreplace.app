// PROGRESSO do torneio não pode inflar o total. Bug do dono (jul/2026): 13 jogos jogados,
// todos com placar, mas a barra diz "13/14 (93%)" e nunca fecha.
// Raiz: o motor de fases cria o jogo de 3º lugar como match isThirdPlace DENTRO de t.matches
// (não em t.thirdPlaceMatch). Quando esse jogo já foi jogado (entre os 13), _getTournamentProgress
// via `if (!t.thirdPlaceMatch)` ainda adicionava um placeholder FANTASMA de 3º lugar por cima →
// 14 total, travado em 13/14. Fix: não adicionar placeholder se já existe match isThirdPlace.
// Vale pra QUALQUER torneio/fase — mesma função conta tudo via _collectAllMatches.
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Bracket single-elim COMPLETO com 3º lugar canônico (isThirdPlace) JÁ jogado.
// 13 jogos reais, todos com winner. Esperado: 13/13 (100%), não 13/14.
function makeComplete() {
  var ms = [];
  // R1: 8 jogos (16 duplas) — todos jogados
  for (var i = 0; i < 8; i++) ms.push({ id: 'r1_' + i, round: 1, p1: 'A' + i, p2: 'B' + i, winner: 'A' + i });
  // R2 (quartas): 4
  for (var j = 0; j < 4; j++) ms.push({ id: 'r2_' + j, round: 2, p1: 'A' + j, p2: 'A' + (j + 4), winner: 'A' + j });
  // Wait — recontagem pra dar exatamente 13 reais incl. 3º lugar (ver abaixo).
  return ms;
}

// Monta um bracket com 12 degraus + 1 jogo de 3º lugar = 13 reais, todos jogados.
function makeT() {
  var ms = [];
  var mk = function (id, round, w) { ms.push({ id: id, round: round, p1: 'P' + id + 'a', p2: 'P' + id + 'b', winner: w ? 'P' + id + 'a' : null }); };
  // 8 (R1) + 4 (quartas=R2) — para _hasMultipleRounds (round>=2)
  for (var i = 0; i < 8; i++) mk('r1_' + i, 1, true);
  for (var j = 0; j < 3; j++) mk('r2_' + j, 2, true);   // 3 jogos R2 jogados
  mk('semi', 3, true);                                    // 1 semi
  // 3º lugar CANÔNICO já jogado (isThirdPlace em t.matches)
  ms.push({ id: 'third', round: 3, isThirdPlace: true, p1: 'X', p2: 'Y', winner: 'X' });
  // total real = 8+3+1+1 = 13, todos com winner
  return { id: 't_prog', format: 'Eliminatórias Simples', matches: ms };
}

const t = makeT();
const realCount = t.matches.length;
ok(realCount === 13, 'setup: 13 jogos reais no bracket (incl. 3º lugar isThirdPlace jogado)');

const prog = W._getTournamentProgress(t);
ok(prog.total === 13, 'total = 13 (sem placeholder fantasma de 3º lugar) — deu ' + prog.total);
ok(prog.completed === 13, 'completed = 13');
ok(prog.pct === 100, 'pct = 100% (barra fecha) — deu ' + prog.pct);

// Guarda-corpo: torneio elim SEM nenhum 3º lugar ainda (nem isThirdPlace nem thirdPlaceMatch)
// PODE ter o placeholder (comportamento legado preservado — 3º lugar futuro entra no total).
const t2 = {
  id: 't2', format: 'Eliminatórias Simples',
  matches: [
    { id: 'a', round: 1, p1: 'P1', p2: 'P2', winner: 'P1' },
    { id: 'b', round: 2, p1: 'P1', p2: 'P3', winner: 'P1' }
  ]
};
const prog2 = W._getTournamentProgress(t2);
ok(prog2.total === 3, 'sem 3º lugar existente: placeholder legado mantém total=3 (2 reais + 1 futuro)');

console.log('\n' + (fail === 0 ? '✅ progress-third-place-nodouble: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
