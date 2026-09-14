'use strict';
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
const core = require('../functions/pending-mail-core.js');
let pass = 0, fail = 0;
function ok(condition, message) {
  if (condition) pass++;
  else { fail++; console.error('  ✗ ' + message); }
}

ok(core.mailId('verification', 'abc') === 'pending-verification-abc',
  'o id de outbox é determinístico por tipo e pendência');

async function run() {
  let creates = 0;
  const existing = { exists: true, async get() { return this; }, async create() { creates++; } };
  const replay = await core.createOnce(existing, {});
  ok(replay.alreadyQueued && creates === 0, 'reentrega encontra a outbox antes de criar');

  const raced = { exists: false, async get() { return this; }, async create() { creates++; const e = new Error('ALREADY_EXISTS'); e.code = 6; throw e; } };
  const race = await core.createOnce(raced, {});
  ok(race.alreadyQueued && creates === 1, 'corrida no create é tratada como entrega já enfileirada');

for (const [name, start, kind, call] of [
  ['verificação', 'async function _queueVerificationEmail', 'verification', 'await _queueVerificationEmail(db, email, link, d.name || "", doc.id)'],
  ['reset', 'async function _queuePasswordResetEmail', 'password-reset', 'await _queuePasswordResetEmail(db, email, linkResult, d.name || "", doc.id)'],
]) {
  const body = source.slice(source.indexOf(start), source.indexOf('exports.', source.indexOf(start) + 1));
  ok(body.indexOf('_pendingMail.mailId("' + kind + '", pendingId)') !== -1,
    name + ': usa o id de outbox da pendência');
  ok(/if \(ref && \(await ref\.get\(\)\)\.exists\) return \{ alreadyQueued: true \}/.test(body),
    name + ': reentrega encontra o e-mail antes de criar novo link');
  ok(/return _pendingMail\.createOnce\(ref, message\)/.test(body),
    name + ': corrida no create é idempotente');
  ok(source.indexOf(call) !== -1,
    name + ': o dreno passa doc.id como identidade');
}

const directStart = source.indexOf('if (link) {', source.indexOf('exports.sendVerificationEmail'));
const pendingStart = source.indexOf('// v2.1.79: link indisponível', directStart);
const direct = source.slice(directStart, pendingStart);
ok(/throw new HttpsError\("internal"/.test(direct),
  'falha do envio direto é devolvida ao cliente');
ok(direct.indexOf('db.collection("pendingEmailVerifications")') === -1,
  'falha depois da outbox NÃO cria pendência que duplicaria o e-mail');

  console.log(fail ? '❌ pending-email-outbox-idempotent: ' + pass + ' ok, ' + fail + ' falha(s)' :
    '✅ pending-email-outbox-idempotent: ' + pass + ' asserções, 0 falha(s)');
  process.exit(fail ? 1 : 0);
}
run().catch((err) => { console.error(err); process.exit(1); });
