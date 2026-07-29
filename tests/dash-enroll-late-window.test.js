/* _dashEnroll × INSCRIÇÃO DURANTE A FASE — node tests/dash-enroll-late-window.test.js
 *
 * BUG REAL (25/jul/2026, "Torneio de Férias só Casais" tour_1781996342871, Dupla Eliminatória
 * ao vivo): torneio com "Inscrições durante a fase" = Abertas (lateEnrollment 'expand'), sorteio
 * feito, R1 Sup em jogo e NENHUM placar lançado na R2 Sup. O card do dashboard mostrava o botão
 * "✅ Inscrever-se" (canEnroll leva a inscrição tardia em conta) e o clique respondia com o modal
 * "Inscrições Encerradas" — porque window._dashEnroll tinha uma CÓPIA driftada da regra que só
 * olhava `status` + `sorteio` e ignorava a janela tardia. Não tinha nada a ver com a R2: bastava
 * o sorteio existir pra travar.
 *
 * INVARIANTE CONGELADO AQUI: com a janela tardia ABERTA, _dashEnroll NUNCA mostra
 * "Inscrições Encerradas" — delega pro fluxo canônico (enrollCurrentUser → lista de espera).
 * Fechada a janela (toggle 'closed', 1º placar da R2, status closed/finished), volta a bloquear.
 */
const H = require('./render-harness');
require('./headless').load('dashboard.js'); // define window._dashEnroll no MESMO contexto
const W = H.sandbox;
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// Dupla Eliminatória ao vivo: R1 Sup (3 jogos, 2 decididos) + R2 Sup (2 jogos, nenhum decidido).
function makeT(over) {
  const t = {
    id: 't_dash_le', name: 'Casais', format: 'Dupla Eliminatória', status: 'active',
    currentPhaseIndex: 0, lateEnrollment: 'expand', teamSize: 2, enrollmentMode: 'teams',
    participants: [], matches: [
      { id: 'u0', round: 1, bracket: 'upper', p1: 'A / B', p2: 'C / D', winner: 'A / B', scoreP1: 6, scoreP2: 2 },
      { id: 'u1', round: 1, bracket: 'upper', p1: 'E / F', p2: 'G / H', winner: 'E / F', scoreP1: 6, scoreP2: 3 },
      { id: 'u2', round: 1, bracket: 'upper', p1: 'I / J', p2: 'K / L', winner: null },
      { id: 'u3', round: 2, bracket: 'upper', p1: 'A / B', p2: 'TBD', winner: null },
      { id: 'u4', round: 2, bracket: 'upper', p1: 'E / F', p2: 'TBD', winner: null },
      { id: 'l0', round: 1, bracket: 'lower', p1: 'C / D', p2: 'G / H', winner: null }
    ]
  };
  if (over) over(t);
  return t;
}

// Espiona o desfecho de _dashEnroll: bloqueio (modal) × delegação (fluxo canônico).
function runDashEnroll(t) {
  const out = { blocked: null, delegated: false, enrolledDirect: false };
  W.AppStore.tournaments = [t];
  W.AppStore.currentUser = { uid: 'u_new', displayName: 'Novo Inscrito', email: 'novo@x.com' };
  const _alert = W.showAlertDialog, _enroll = W.enrollCurrentUser, _do = W._doEnrollCurrentUser;
  W.showAlertDialog = function (title) { out.blocked = String(title || ''); };
  W.enrollCurrentUser = function () { out.delegated = true; };
  W._doEnrollCurrentUser = function () { out.enrolledDirect = true; };
  try { W._dashEnroll(t.id); } finally {
    W.showAlertDialog = _alert; W.enrollCurrentUser = _enroll; W._doEnrollCurrentUser = _do;
  }
  return out;
}

// 1) O BUG: janela tardia aberta (R2 sem placar) → não pode bloquear.
var r = runDashEnroll(makeT());
ok(r.blocked === null, 'janela ABERTA (R2 sem placar): NÃO mostra "Inscrições Encerradas" — vi: ' + r.blocked);
ok(r.delegated === true, 'janela ABERTA: delega pro fluxo canônico (enrollCurrentUser → lista de espera)');
ok(r.enrolledDirect === false, 'janela ABERTA: NÃO grava direto no roster (pós-sorteio é lista de espera)');

// 2) Coerência com o próprio card: canEnroll (que renderiza o botão) e o handler concordam.
(function () {
  const t = makeT();
  const _le = W._effectiveLateEnrollment(t);
  const canEnroll = (_le === 'standby' || _le === 'expand') && t.status !== 'closed' && t.status !== 'finished';
  ok(canEnroll && runDashEnroll(t).blocked === null,
    'card mostra "Inscrever-se" E o clique não bloqueia (fim da contradição card × handler)');
})();

// 3) 1º placar LANÇADO na R2 Sup → janela fecha → volta a bloquear.
ok(runDashEnroll(makeT(function (t) { t.matches[3].winner = 'A / B'; })).blocked !== null,
  'R2 Sup com resultado → bloqueia (janela fechada)');

// 4) Toggle "Fechadas" → bloqueia mesmo sem placar na R2.
ok(runDashEnroll(makeT(function (t) { t.lateEnrollment = 'closed'; })).blocked !== null,
  'toggle closed → bloqueia');

// 5) Organizador fechou na mão / torneio encerrado → bloqueia.
ok(runDashEnroll(makeT(function (t) { t.status = 'closed'; })).blocked !== null, 'status closed → bloqueia');
ok(runDashEnroll(makeT(function (t) { t.status = 'finished'; })).blocked !== null, 'status finished → bloqueia');

// 6) 'standby' (Suplentes Apenas) também é inscrição ABERTA — vai pra espera, não bloqueia.
ok(runDashEnroll(makeT(function (t) { t.lateEnrollment = 'standby'; })).blocked === null,
  'standby (suplentes) → não bloqueia, vai pra lista de espera');

// 7) Valor POR FASE sobrepõe o top-level (regra por-fase).
ok(runDashEnroll(makeT(function (t) {
  t.lateEnrollment = 'expand';
  t.phases = [{ name: 'Eliminatória', lateEnrollment: 'closed' }];
})).blocked !== null, 'fase corrente com closed sobrepõe top-level expand → bloqueia');

console.log('\n' + (fail === 0 ? '✅ dash-enroll-late-window: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { fails.forEach((f) => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
