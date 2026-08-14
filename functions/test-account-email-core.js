/* E-MAIL DE CONSOLIDAÇÃO DA CONTA — o registro pesquisável de "como eu entro".
 *
 * Pedido do dono (13/ago/2026): e-mail automático dizendo como a pessoa entra,
 * disparado no nascimento da conta, re-enviado quando a identidade consolidada
 * muda, e backfillado pra base inteira. Este teste trava:
 *   1. a ASSINATURA (o anti-spam): só identidade conta — tema/stats/preferência não;
 *   2. o CONTEÚDO: métodos certos, celular formatado, relay da Apple explicado,
 *      contato SEMPRE contato@barthlabs.com (nunca o gmail);
 *   3. a FIAÇÃO do gatilho (functions/index.js): guarda por assinatura, enfileira
 *      ANTES de gravar a assinatura, replyTo certo;
 *   4. o BACKFILL (scripts/send-account-summary-emails.js): NUNCA cria doc stub
 *      (mataria o resgate resolveLoginRedirect, que exige doc inexistente).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const core = require('./account-email-core.js');

let pass = 0, fail = 0;
const ok = (m, c) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── account-email-core ────');

// ── 1. ASSINATURA ──────────────────────────────────────────────────────────────
ok('assinatura cobre nome+email+celular',
  core.accountDocSig({ displayName: 'Ana', email: 'A@x.com', phone: '(11) 98888-7777' }) === 'Ana|a@x.com|11988887777');
ok('e-mail é case-insensitive na assinatura',
  core.accountDocSig({ email: 'A@X.com' }) === core.accountDocSig({ email: 'a@x.com' }));
ok('celular ignora máscara (dígitos puros)',
  core.accountDocSig({ phone: '(11) 98888-7777' }) === core.accountDocSig({ phone: '11988887777' }));
ok('tema/preferência/stats NÃO entram na assinatura',
  core.accountDocSig({ displayName: 'Ana', theme: 'dark', notifyLevel: 'todas', plan: 'pro' }) ===
  core.accountDocSig({ displayName: 'Ana' }));
ok('doc vazio tem assinatura estável (não explode)', core.accountDocSig(null) === '||');

// ── 2. CONTEÚDO ────────────────────────────────────────────────────────────────
const mGoogle = core.buildAccountEmail({
  name: 'Ana Silva', email: 'ana@gmail.com', phone: '11988887777',
  providers: ['google.com'], isNew: true
});
ok('método Google aparece', mGoogle.text.indexOf('Google') !== -1 && mGoogle.html.indexOf('Google') !== -1);
ok('nome aparece', mGoogle.text.indexOf('Ana Silva') !== -1);
ok('celular sai FORMATADO', mGoogle.text.indexOf('+55 (11) 98888-7777') !== -1);
ok('nascimento: assunto "como você entra"', /como você entra/i.test(mGoogle.subject));
ok('nascimento: CTA de unir contas', /unir as duas/i.test(mGoogle.text));
ok('contato é SEMPRE contato@barthlabs.com', mGoogle.text.indexOf('contato@barthlabs.com') !== -1 &&
  mGoogle.html.indexOf('contato@barthlabs.com') !== -1);
ok('o gmail de suporte NÃO aparece (regra do dono: barthlabs)',
  mGoogle.text.indexOf('scoreplace.app@gmail.com') === -1 && mGoogle.html.indexOf('scoreplace.app@gmail.com') === -1);

const mMudanca = core.buildAccountEmail({
  name: 'Ana', email: 'ana@gmail.com', phone: '', providers: ['password'], isNew: false
});
ok('mudança: assunto de CONFIRMAÇÃO', /confirmação/i.test(mMudanca.subject));
ok('mudança: canal de contestação ("não reconhece")', /não reconhece/i.test(mMudanca.text));
ok('sem celular → pede o celular', /celular/i.test(mMudanca.text) && mMudanca.text.indexOf('#profile') !== -1);
ok('método "e-mail e senha" pro provider password', mMudanca.text.indexOf('e-mail e senha') !== -1);

const mRelay = core.buildAccountEmail({
  name: 'Bia', email: 'x9z@privaterelay.appleid.com', phone: '', providers: ['apple.com'], isNew: true
});
ok('relay da Apple é detectado', core.isAppleRelay('x9z@privaterelay.appleid.com') && !core.isAppleRelay('x@gmail.com'));
ok('relay: e-mail explica o "Ocultar meu e-mail"', /ocultar meu e-mail/i.test(mRelay.text));
ok('relay: método Apple', mRelay.text.indexOf('Apple') !== -1);

const mMulti = core.buildAccountEmail({ email: 'a@b.com', providers: ['google.com', 'apple.com', 'password'] });
ok('múltiplos métodos viram lista "ou"', /Google ou Apple ou e-mail e senha/.test(mMulti.text));
ok('sem provider no Auth → cai no authProviderFallback',
  core.buildAccountEmail({ email: 'a@b.com', providers: [], authProviderFallback: 'google.com' }).text.indexOf('Google') !== -1);
ok('HTML escapa conteúdo (nome com <)', core.buildAccountEmail({ name: 'A<b>', email: 'a@b.com' }).html.indexOf('A&lt;b&gt;') !== -1);

// ── 3. FIAÇÃO DO GATILHO ───────────────────────────────────────────────────────
const idx = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
const trigStart = idx.indexOf('exports.accountSummaryEmail');
ok('gatilho accountSummaryEmail existe no index.js', trigStart !== -1);
const trig = idx.slice(trigStart, trigStart + 4000);
ok('gatilho é onDocumentWritten em users/{uid} (nascimento E mudança)',
  /onDocumentWritten\(\s*\{ document: "users\/\{uid\}"/.test(trig));
ok('gatilho guarda por ASSINATURA (accountEmailSig === sig → retorna)',
  /accountEmailSig === sig\) return/.test(trig));
ok('gatilho usa o construtor do CORE (não uma segunda montagem)',
  /_accountEmail\.buildAccountEmail\(/.test(trig));
ok('gatilho pula conta absorvida (mergedInto)', /mergedInto\) return/.test(trig));
ok('replyTo do gatilho é contato@barthlabs.com', /replyTo: "contato@barthlabs\.com"/.test(trig));
ok('ordem: enfileira ANTES de gravar a assinatura (falha de envio → re-tenta)',
  trig.indexOf('_enqueueMail') < trig.indexOf('await after.ref.set({ accountEmailSig: sig }, { merge: true });\n      console.log'));

// ── 4. BACKFILL ────────────────────────────────────────────────────────────────
const bf = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'send-account-summary-emails.js'), 'utf8');
ok('backfill usa o MESMO core', /require\(.*account-email-core/.test(bf));
ok('backfill é idempotente por assinatura', /accountEmailSig === sig/.test(bf));
ok('backfill tem --dry-run', /--dry-run/.test(bf));
ok('backfill NUNCA cria doc pra conta sem users/{uid} (mataria o resolveLoginRedirect)',
  /doc\.exists \&\&.*accountEmailSig !== sig/.test(bf) && /if \(doc\.exists\) await doc\.ref\.set/.test(bf));
ok('backfill replyTo contato@barthlabs.com', /replyTo: 'contato@barthlabs\.com'/.test(bf));

console.log(fail === 0 ? '✅ account-email-core: ' + pass + ' asserções, 0 falha(s)'
                       : '❌ account-email-core: ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);
