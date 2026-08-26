#!/usr/bin/env node
/* tirar-email-do-doc-publico.js — o e-mail sai do documento que qualquer um lê.
 *
 * ⛔ O PROBLEMA, CONFERIDO CONTRA PRODUÇÃO (26/ago/2026):
 *   `GET https://firestore.googleapis.com/v1/.../tournaments/{id}` SEM cabeçalho de
 *   autenticação devolveu **HTTP 200 e 61 e-mails**. A regra é
 *   `allow read: if resource.data.isPublic == true` — sem login.
 * ⛔ E REGRA DO FIRESTORE NÃO ESCONDE CAMPO: leitura é o documento INTEIRO ou nada. Não
 *   existe "esconde só o e-mail". A única correção é o campo não morar ali.
 *
 * Este script cuida da MAIOR e mais SEGURA fonte: `categoryNotifications[].targetEmail`
 * — 84 ocorrências / 60 e-mails distintos, num registro cujo próprio código diz que
 * `targetUid` é a chave canônica e o e-mail é só fallback de documento legado.
 * O registro NÃO é apagado: o dono desligou a tela em 31/jul mas mandou guardar o
 * histórico ("voltaremos a isso depois"). Só o e-mail sai.
 *
 * ⚠️ NÃO cobre `organizerEmail` / `creatorEmail` / `adminEmails` / `participants[].email`:
 * essas participam de AUTORIZAÇÃO e de identidade legada. Mexer nelas sem cuidado tranca
 * gente pra fora do próprio torneio. Ficam para uma leva própria, com decisão do dono.
 *
 * Uso: node scripts/tirar-email-do-doc-publico.js [--aplicar]
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const APLICAR = process.argv.indexOf('--aplicar') !== -1;

(async () => {
  /* ⭐ TROCA, NÃO APAGA. 82 dos 84 registros são legados e não têm `targetUid` — sair só
   * apagando o e-mail deixaria eles identificados apenas pelo nome, e o dono mandou
   * GUARDAR esse histórico ("voltaremos a isso depois"). Medido antes: 59 dos 60 e-mails
   * resolvem pra um uid da base de usuários. Então o e-mail vira uid e nada se perde.
   * O único que não resolve fica pelo nome — e nome já está na lista de inscritos do
   * mesmo documento, então não acrescenta exposição nenhuma. */
  const us = await db.collection('users').get();
  const uidPorEmail = {};
  us.forEach((u) => {
    const d = u.data() || {};
    [d.email, d.email_lower].filter(Boolean).forEach((e) => { uidPorEmail[String(e).toLowerCase()] = u.id; });
  });

  const snap = await db.collection('tournaments').get();
  let docs = 0, campos = 0, gravados = 0, semUid = 0;
  const emails = new Set();
  for (const doc of snap.docs) {
    const t = doc.data() || {};
    const cn = t.categoryNotifications;
    if (!Array.isArray(cn) || !cn.length) continue;
    let mudou = false;
    const novo = cn.map((r) => {
      if (!r || !r.targetEmail) return r;
      campos++; emails.add(r.targetEmail);
      // ⚠️ registro SEM uid perde o único identificador forte. Não apago o registro —
      // fica pelo nome, que já está na lista de inscritos do mesmo doc (não acrescenta
      // exposição). Mas CONTO, pra ficar visível quantos são.
      const c = Object.assign({}, r);
      if (!c.targetUid) {
        const achou = uidPorEmail[String(r.targetEmail).toLowerCase()];
        if (achou) c.targetUid = achou; else semUid++;
      }
      delete c.targetEmail;
      mudou = true;
      return c;
    });
    if (!mudou) continue;
    docs++;
    console.log('  ' + (t.name || doc.id).slice(0, 44).padEnd(46) +
      ' público:' + (t.isPublic === true ? 'SIM' : 'não') + '  registros:' + cn.length);
    if (APLICAR) { await doc.ref.update({ categoryNotifications: novo }); gravados++; }
  }
  console.log('\n' + campos + ' campo(s) targetEmail em ' + docs + ' torneio(s) · ' +
    emails.size + ' e-mail(s) distinto(s)');
  console.log(semUid ? '⚠️ ' + semUid + ' registro(s) sem uid resolvível — ficam pelo nome'
                     : '✓ todos ganharam targetUid — nada se perde');
  console.log(APLICAR ? '✓ aplicado em ' + gravados + ' torneio(s)' : '(em seco — nada gravado; rode com --aplicar)');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
