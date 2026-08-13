#!/usr/bin/env node
/* BACKFILL do e-mail de consolidação da conta — v1.8.40 (13/ago/2026).
 *
 * Ordem do dono: _"vamos disparar um para todos os que já entraram consolidando as
 * informações das contas de cada um"_. Daqui pra frente quem mantém é o gatilho
 * accountSummaryEmail (functions/index.js) — este script cobre quem JÁ existia.
 *
 * USO:
 *   node scripts/send-account-summary-emails.js --dry-run   # só conta e lista
 *   node scripts/send-account-summary-emails.js             # enfileira de verdade
 *
 * Credencial: Application Default (gcloud auth application-default login) — o mesmo
 * caminho dos scripts de produção anteriores. Projeto fixo: scoreplace-app.
 *
 * IDEMPOTENTE por assinatura: grava `accountEmailSig` no doc (o MESMO marcador do
 * gatilho); re-rodar pula quem já recebeu a foto atual da conta.
 *
 * ⚠️ CONTA DO AUTH SEM DOC users/{uid}: envia o e-mail mas NÃO cria o doc — criar um
 * doc stub mataria o resgate resolveLoginRedirect, que só age quando o doc NÃO existe.
 * Consequência: re-rodar o script re-envia pra essas (contadas no relatório).
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const core = require(path.join(__dirname, '..', 'functions', 'account-email-core.js'));

const DRY = process.argv.includes('--dry-run');
admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();

const isSynthetic = (e) => /@phone\.scoreplace\.app$/i.test(String(e || ''));

(async () => {
  const users = [];
  let token = undefined;
  do {
    const page = await admin.auth().listUsers(1000, token);
    users.push(...page.users);
    token = page.pageToken;
  } while (token);
  console.log('contas no Auth:', users.length, DRY ? '(DRY-RUN — nada será gravado)' : '');

  let enviados = 0, semEmail = 0, mergedOuDisabled = 0, jaEnviados = 0, semDoc = 0;
  for (const u of users) {
    if (u.disabled) { mergedOuDisabled++; continue; }
    const doc = await db.collection('users').doc(u.uid).get();
    const p = doc.exists ? (doc.data() || {}) : {};
    if (p.mergedInto) { mergedOuDisabled++; continue; }

    const authEmail = u.email || '';
    const email = (authEmail && !isSynthetic(authEmail)) ? authEmail
      : ((p.email && !isSynthetic(p.email)) ? String(p.email) : '');
    const sig = core.accountDocSig(p);

    if (!email) {
      semEmail++;
      if (doc.exists && p.accountEmailSig !== sig && !DRY) {
        await doc.ref.set({ accountEmailSig: sig }, { merge: true });
      }
      continue;
    }
    if (doc.exists && p.accountEmailSig === sig) { jaEnviados++; continue; }
    if (!doc.exists) semDoc++;

    const providers = (u.providerData || []).map((x) => x && x.providerId).filter(Boolean);
    const mail = core.buildAccountEmail({
      name: p.displayName || u.displayName || '',
      email: email,
      phone: p.phone || (u.phoneNumber || '').replace(/^\+55/, ''),
      providers: providers,
      authProviderFallback: p.authProvider || '',
      isNew: true, // no backfill todo mundo recebe a versão "como você entra" (com o CTA de unir contas)
    });

    if (DRY) {
      console.log('  [dry]', email, '→', core.providerLabels(providers, p.authProvider).join(' ou ') || '(e-mail e senha)');
      enviados++;
      continue;
    }
    await db.collection('mail').add({
      to: [email],
      replyTo: 'contato@barthlabs.com',
      message: { subject: mail.subject, html: mail.html, text: mail.text },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (doc.exists) await doc.ref.set({ accountEmailSig: sig }, { merge: true });
    enviados++;
  }

  console.log('\nRESULTADO' + (DRY ? ' (dry-run)' : '') + ':');
  console.log('  enfileirados:', enviados);
  console.log('  sem e-mail real (só-celular):', semEmail);
  console.log('  já enviados (assinatura igual):', jaEnviados);
  console.log('  fundidas/desabilitadas (puladas):', mergedOuDisabled);
  console.log('  sem doc users/ (enviado sem marcador):', semDoc);
  process.exit(0);
})().catch((e) => { console.error('FALHOU:', e && (e.message || e)); process.exit(1); });
