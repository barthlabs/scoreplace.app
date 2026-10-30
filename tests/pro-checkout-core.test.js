/* O webhook Pro deve ignorar Checkout de inscrições e qualquer sessão ambígua. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.join(__dirname, '..');
  const { isProCheckoutSession, proSubscriptionEventId, matchesProSubscriptionEvent } =
    await import(pathToFileURL(path.join(root, 'functions-stripe/pro-checkout-core.js')).href);
  const pro = { mode: 'subscription', client_reference_id: 'user_123', metadata: { userId: 'user_123' } };
  assert.equal(isProCheckoutSession(pro), true, 'assinatura Pro existente continua válida');
  assert.equal(isProCheckoutSession({ mode: 'subscription', metadata: { userId: 'user_123' } }), true, 'UID no metadata continua válido');
  assert.equal(isProCheckoutSession({ mode: 'payment', client_reference_id: 'user_123' }), false, 'pagamento avulso sem kind não concede Pro');
  assert.equal(isProCheckoutSession({ mode: 'payment', client_reference_id: 'user_123', metadata: { kind: 'late_registration' } }), false);
  assert.equal(isProCheckoutSession({ client_reference_id: 'user_123' }), false, 'mode ausente falha fechado');
  assert.equal(isProCheckoutSession({ ...pro, metadata: { userId: 'user_123', kind: 'late_registration' } }), false);
  assert.equal(isProCheckoutSession({ ...pro, metadata: { userId: 'user_123', kind: '' } }), false, 'kind vazio ainda é presente');
  assert.equal(isProCheckoutSession({ mode: 'subscription', metadata: {} }), false, 'UID ausente falha fechado');
  assert.equal(isProCheckoutSession({ mode: 'subscription', client_reference_id: ' ' }), false, 'UID em branco falha fechado');
  assert.equal(isProCheckoutSession(null), false);

  const user = { stripeCustomerId: 'cus_pro', stripeSubscriptionId: 'sub_pro' };
  const invoice = { customer: 'cus_pro', subscription: 'sub_pro' };
  const cancellation = { customer: 'cus_pro', id: 'sub_pro' };
  for (const type of ['invoice.paid', 'invoice.payment_failed']) {
    assert.equal(proSubscriptionEventId(type, invoice), 'sub_pro');
    assert.equal(matchesProSubscriptionEvent(type, invoice, user), true, type + ' da assinatura Pro');
    assert.equal(matchesProSubscriptionEvent(type, { ...invoice, subscription: 'sub_other' }, user), false,
      'outra assinatura do mesmo customer não altera Pro');
    assert.equal(matchesProSubscriptionEvent(type, { ...invoice, customer: 'cus_other' }, user), false);
    assert.equal(matchesProSubscriptionEvent(type, { ...invoice, subscription: null }, user), false,
      'fatura avulsa sem assinatura é ignorada');
    assert.equal(matchesProSubscriptionEvent(type, { customer: 'cus_pro' }, user), false);
    assert.equal(matchesProSubscriptionEvent(type, { ...invoice, subscription: { id: 'sub_pro' } }, user), false);
  }
  assert.equal(proSubscriptionEventId('customer.subscription.deleted', cancellation), 'sub_pro');
  assert.equal(matchesProSubscriptionEvent('customer.subscription.deleted', cancellation, user), true);
  assert.equal(matchesProSubscriptionEvent('customer.subscription.deleted', { ...cancellation, id: 'sub_old' }, user), false,
    'exclusão da assinatura substituída não cancela Pro');
  assert.equal(matchesProSubscriptionEvent('customer.subscription.deleted', { ...cancellation, customer: 'cus_other' }, user), false);
  assert.equal(matchesProSubscriptionEvent('customer.subscription.deleted', { customer: 'cus_pro' }, user), false);
  assert.equal(matchesProSubscriptionEvent('customer.subscription.deleted', { ...cancellation, id: 123 }, user), false);
  assert.equal(matchesProSubscriptionEvent('invoice.paid', invoice, { stripeCustomerId: 'cus_pro' }), false,
    'usuário histórico sem assinatura requer conciliação; não há fallback por customer');
  assert.equal(proSubscriptionEventId('unknown', invoice), null);

  const source = fs.readFileSync(path.join(root, 'functions-stripe/index.js'), 'utf8');
  const caseStart = source.indexOf('case "checkout.session.completed":');
  const guard = source.indexOf('if (!isProCheckoutSession(obj))', caseStart);
  const userWrite = source.indexOf('db.collection("users")', caseStart);
  const nextCase = source.indexOf('case "invoice.paid":', caseStart);
  assert.ok(caseStart >= 0 && guard > caseStart && userWrite > guard && userWrite < nextCase,
    'o handler aplica a guarda antes de gravar o plano Pro');
  assert.match(source.slice(guard, userWrite), /break;/, 'evento não-Pro sai do caso sem gravar');
  assert.match(source.slice(nextCase), /res\.status\(200\)\.json\(\{ received: true \}\)/,
    'evento ignorado recebe 200 após o switch');
  const lookupStart = source.indexOf('async function findProUserForEvent');
  const lookupEnd = source.indexOf('// ============================================================================', lookupStart);
  const lookup = source.slice(lookupStart, lookupEnd);
  assert.ok(lookupStart >= 0 && lookupEnd > lookupStart);
  assert.match(lookup, /proSubscriptionEventId\(type, object\)/);
  assert.match(lookup, /where\("stripeSubscriptionId", "==", subscriptionId\)\.limit\(2\)/);
  assert.match(lookup, /if \(snap\.size > 1\) \{[\s\S]*?return null;/);
  assert.match(lookup, /matchesProSubscriptionEvent\(type, object, userDoc\.data\(\)\)/);
  for (const [type, next] of [
    ['invoice.paid', 'customer.subscription.deleted'],
    ['customer.subscription.deleted', 'invoice.payment_failed'],
    ['invoice.payment_failed', 'default:'],
  ]) {
    const start = source.indexOf('case "' + type + '":');
    const end = source.indexOf(next === 'default:' ? next : 'case "' + next + '":', start);
    const branch = source.slice(start, end);
    assert.ok(start >= 0 && end > start, type + ' existe');
    assert.match(branch, /const userDoc = await findProUserForEvent\(event\.type, obj\);\s*if \(!userDoc\) break;/,
      type + ' só escreve após a correlação');
    assert.ok(branch.indexOf('if (!userDoc) break;') < branch.indexOf('userDoc.ref.update('),
      type + ' guarda ocorre antes de update');
    assert.doesNotMatch(branch, /where\("stripeCustomerId"/, type + ' não busca somente por customer');
  }
  console.log('✓ webhook Pro isola sessões de assinatura de pagamentos avulsos');
})().catch((error) => { console.error(error); process.exitCode = 1; });
