#!/usr/bin/env node
/* conferir-admin-por-uid.js — o uid já cobre TODOS os admins de hoje?
 *
 * Ordem do dono (26/ago): _"nada por nome ou email, sempre por uid a menos que seja
 * digitado por organizador e nao tenha uid. organizador sempre por uid."_
 *
 * ⛔ ESTA MEDIÇÃO VEM ANTES DE QUALQUER TROCA. Tirar o e-mail da autorização sem antes
 * provar que o uid cobre 100% dos casos TRANCA O ORGANIZADOR PRA FORA DO PRÓPRIO TORNEIO —
 * e ele descobre isso na quadra, no meio do torneio, sem poder fazer nada.
 * Cada e-mail de admin que NÃO resolve pra um uid é uma pessoa que perde o acesso.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const low = (x) => String(x || '').trim().toLowerCase();

(async () => {
  // mapa e-mail → uid, de TODA a base de usuários
  const us = await db.collection('users').get();
  const uidPorEmail = {};
  us.forEach((u) => {
    const d = u.data() || {};
    [d.email, d.email_lower].filter(Boolean).forEach((e) => { uidPorEmail[low(e)] = u.id; });
    (Array.isArray(d.linkedEmails) ? d.linkedEmails : []).forEach((e) => { if (e && !uidPorEmail[low(e)]) uidPorEmail[low(e)] = u.id; });
  });
  console.log('base de usuários: ' + us.size + ' · e-mails mapeados: ' + Object.keys(uidPorEmail).length + '\n');

  const snap = await db.collection('tournaments').get();
  let semCreatorUid = [], orfaos = [], cobertos = 0, totalAdmins = 0;
  const faltando = new Map();
  snap.forEach((doc) => {
    const t = doc.data() || {};
    const nome = (t.name || doc.id).slice(0, 34);
    // ① organizador: creatorUid é obrigatório pelo "organizador sempre por uid"
    if (!t.creatorUid) semCreatorUid.push(nome + '  (creatorEmail: ' + (t.creatorEmail || '—') + ')');
    // ② todo e-mail de admin tem que ter um uid equivalente
    const uids = new Set([...(Array.isArray(t.adminUids) ? t.adminUids : []), t.creatorUid].filter(Boolean));
    (Array.isArray(t.coHosts) ? t.coHosts : []).forEach((c) => { if (c && c.uid) uids.add(c.uid); });
    const emails = new Set([...(Array.isArray(t.adminEmails) ? t.adminEmails : []),
      t.adminEmail, t.organizerEmail, t.creatorEmail].filter(Boolean).map(low));
    emails.forEach((e) => {
      totalAdmins++;
      const u = uidPorEmail[e];
      if (u && uids.has(u)) { cobertos++; return; }
      if (u) { // existe usuário, mas o uid dele não está na lista do torneio
        orfaos.push(nome + '  ' + e.slice(0, 3) + '***  → uid EXISTE (' + u.slice(0, 8) + ') mas NÃO está em adminUids/creatorUid');
        faltando.set(doc.id + '|' + u, { id: doc.id, uid: u, email: e });
      } else {
        orfaos.push(nome + '  ' + e.slice(0, 3) + '***  → ⛔ NENHUM usuário com esse e-mail');
      }
    });
  });
  console.log('e-mails de admin conferidos: ' + totalAdmins);
  console.log('  ✓ já cobertos por uid ...... ' + cobertos);
  console.log('  ⚠️ NÃO cobertos ............ ' + orfaos.length);
  orfaos.slice(0, 25).forEach((o) => console.log('     ' + o));
  if (orfaos.length > 25) console.log('     … e mais ' + (orfaos.length - 25));
  console.log('\ntorneios SEM creatorUid ("organizador sempre por uid"): ' + semCreatorUid.length);
  semCreatorUid.slice(0, 10).forEach((x) => console.log('     ' + x));
  console.log('\n⇒ ' + (orfaos.length || semCreatorUid.length
    ? 'AINDA NÃO dá pra trocar: ' + faltando.size + ' uid(s) precisam entrar em adminUids antes.'
    : '✅ o uid cobre 100% — a troca pode ser feita sem trancar ninguém.'));
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
