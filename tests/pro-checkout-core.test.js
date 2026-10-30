/* O webhook Pro deve ignorar Checkout de inscrições e qualquer sessão ambígua. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const root = path.join(__dirname, '..');
  const { isProCheckoutSession } = await import(pathToFileURL(path.join(root, 'functions-stripe/pro-checkout-core.js')).href);
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
  console.log('✓ webhook Pro isola sessões de assinatura de pagamentos avulsos');
})().catch((error) => { console.error(error); process.exitCode = 1; });
