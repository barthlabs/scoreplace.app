const policy = require('../js/views/bracket-policy.js');

let pass = 0;
let fail = 0;
function ok(condition, message) {
  if (condition) { pass++; return; }
  fail++;
  console.error('  ✗ ' + message);
}
function throws(fn, message) {
  let didThrow = false;
  try { fn(); } catch (_) { didThrow = true; }
  ok(didThrow, message);
}

console.log('\n── contrato de política de chave ──');
ok(policy.requiresPolicy(6) === true, '6 entradas exige decisão explícita');
ok(policy.requiresPolicy(8) === false, '8 entradas não exige política');
throws(() => policy.assertPolicy('automatico'), 'não aceita política automática');
throws(() => policy.assertPolicy('signIn'), 'não aceita valor desconhecido');

ok(policy.planRound({ entrants: 7, policy: 'repescagem' }).action === 'repescagem',
  'repescagem permanece escolha explícita');
ok(policy.planRound({ entrants: 7, policy: 'bye' }).action === 'bye',
  'BYE permanece escolha explícita');

function entries(plan) { return plan.rounds.map((round) => round.entrants); }
function games(plan, key) { return plan.rounds.map((round) => round[key || 'games'] == null ? round.games : round[key || 'games']); }

const bye5 = policy.planClassicBye(5);
ok(JSON.stringify(entries(bye5)) === JSON.stringify([2, 4, 2]) && JSON.stringify(games(bye5)) === JSON.stringify([1, 2, 2]),
  'BYE clássico de 5 segue play-in, chave de 4 e final');
const bye36 = policy.planClassicBye(36);
ok(JSON.stringify(entries(bye36)) === JSON.stringify([8, 32, 16, 8, 4, 2]) && bye36.totalGames === 36,
  'BYE clássico de 36 bate a cadeia e total da planilha');

const rep6 = policy.planRepechage(6);
ok(JSON.stringify(entries(rep6)) === JSON.stringify([6, 4, 2]) && rep6.returning === 1 && rep6.totalGames === 7,
  'repescagem de 6 traz uma perdedora e fecha em 4');
const rep36 = policy.planRepechage(36);
ok(JSON.stringify(entries(rep36)) === JSON.stringify([36, 32, 16, 8, 4, 2]) && rep36.returning === 14 && rep36.totalGames === 50,
  'repescagem de 36 traz 14 perdedoras e bate 50 jogos');

const single36 = policy.planSingleSurplus(36);
ok(JSON.stringify(entries(single36)) === JSON.stringify([36, 18, 9, 5, 3, 2]),
  'sobra única de 36 nunca procura potência de dois');
ok(JSON.stringify(games(single36, 'gamesWithBye')) === JSON.stringify([18, 9, 4, 2, 1, 2]) &&
  single36.totalGamesWithBye === 36 && single36.totalGamesWithRepechage === 39,
  'sobra única de 36 bate jogos com folga e com repescagem');
ok(single36.rounds[4].surplus === 'repescagem_obrigatoria',
  'semifinal com três é marcada como repescagem obrigatória');

const first = policy.planRound({
  entrants: 5, policy: 'sobra_unica', eligibleIds: ['a', 'b', 'c'], priorRecipients: ['a']
});
ok(first.action === 'sobra_unica' && first.recipientId === 'b',
  'sobra única prioriza quem ainda não recebeu sobra');
const balanced = policy.selectSurplusRecipient(['a', 'b', 'c'], ['a', 'b', 'a', 'b', 'c']);
ok(balanced === 'c', 'quando todos já receberam, escolhe a menor contagem');
throws(() => policy.selectSurplusRecipient(['a', 'a'], []), 'não aceita equipe elegível duplicada');

const semi = policy.planRound({
  entrants: 3, policy: 'sobra_unica', isSemifinal: true, eligibleIds: ['a', 'b', 'c']
});
ok(semi.action === 'repescagem' && semi.reason === 'semifinal-com-tres',
  'semifinal com três entradas usa repescagem, não folga');

if (fail) {
  console.error('\n❌ bracket-policy: ' + pass + ' ok, ' + fail + ' falharam');
  process.exit(1);
}
console.log('\n✅ bracket-policy: ' + pass + ' ok');
