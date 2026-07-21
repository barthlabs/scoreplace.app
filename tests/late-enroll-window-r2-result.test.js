// JANELA da inscrição tardia (toggle 'Inscrições durante a fase' = standby/expand) — spec do dono
// (jul/2026): "fecha assim que for lançado o PRIMEIRO PLACAR da R2, mas fica aberta enquanto não
// houver placar lançado em todos os jogos da R1". O toggle é o ÚNICO controle; a janela R1→R2 é a
// regra. BUG: _lateEnrollR2Started contava startedAt (só ABRIR o placar ao vivo) e score parcial
// como "R2 começou" → fechava a janela ANTES de qualquer placar lançado → +Participante inativo
// cedo demais. Fix: só RESULTADO LANÇADO (winner OU placar registrado nos 2 lados) fecha.
const H = require('./render-harness');
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Torneio elim, toggle standby, R1 (2 jogos round 1) + R2 (1 jogo round 2).
function makeT(over) {
  var t = {
    id: 't_le', format: 'Eliminatórias Simples', status: 'active', currentPhaseIndex: 0,
    lateEnrollment: 'standby',
    matches: [
      { id: 'a', round: 1, p1: 'A', p2: 'B', winner: 'A' },
      { id: 'b', round: 1, p1: 'C', p2: 'D', winner: 'C' },
      { id: 'f', round: 2, p1: 'A', p2: 'C', winner: null }
    ]
  };
  if (over) over(t);
  return t;
}

// R1 completa, R2 sem NENHUM sinal → janela ABERTA (fecha só no 1º placar da R2).
ok(W._lateEnrollWindowOpen(makeT()) === true, 'R1 done, R2 sem resultado → ABERTA');

// R1 AINDA em jogo (um jogo sem winner), R2 intacto → ABERTA.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches[1].winner = null; })) === true,
  'R1 incompleta → ABERTA');

// R2 só ABERTO no placar ao vivo (startedAt) mas SEM placar lançado → ABERTA (o fix).
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches[2].startedAt = 1720000000000; })) === true,
  'R2 startedAt (só abriu, sem resultado) → CONTINUA ABERTA');

// R2 com um único score parcial (não é placar lançado dos 2 lados) → ABERTA.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches[2].scoreP1 = 3; })) === true,
  'R2 com 1 score parcial → CONTINUA ABERTA');

// R2 com RESULTADO LANÇADO (winner) → FECHA.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches[2].winner = 'A'; })) === false,
  'R2 com winner (placar lançado) → FECHA');

// R2 com placar registrado nos 2 lados (empate/registro) → FECHA.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches[2].scoreP1 = 6; t.matches[2].scoreP2 = 4; })) === false,
  'R2 com placar nos 2 lados → FECHA');

// Toggle 'closed' → janela sempre fechada.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.lateEnrollment = 'closed'; })) === false,
  'toggle closed → FECHADA');

// Organizador fechou na mão (status closed) → fechada.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.status = 'closed'; })) === false,
  'status closed (fechou na mão) → FECHADA');

// Só existe R1 (R2 nem gerada) → ABERTA.
ok(W._lateEnrollWindowOpen(makeT(function (t) { t.matches = t.matches.filter(function (m) { return m.round === 1; }); })) === true,
  'só R1 existe → ABERTA');

console.log('\n' + (fail === 0 ? '✅ late-enroll-window-r2-result: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
