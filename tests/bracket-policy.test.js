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
