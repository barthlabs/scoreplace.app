/* accountSummaryEmail — O E-MAIL DA CONTA CHEGA MESMO NA FILA (emulador).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ POR QUE ESTE ARQUIVO EXISTE. O gatilho usava
 *     admin.firestore.FieldValue.serverTimestamp()
 * e no runtime do emulador de Functions esse namespace vem SEM `.FieldValue`. A chamada
 * lançava, o catch de best-effort engolia, e o log repetia
 *     [accountSummaryEmail] falhou (best-effort): Cannot read properties of undefined
 *     (reading 'serverTimestamp')
 * enquanto a suíte inteira ficava VERDE — porque nada olhava a fila `mail`. Resultado real:
 * ninguém que criava conta recebia o e-mail de boas-vindas, e `accountEmailSig` nunca era
 * gravado (a ordem do gatilho é enfileirar PRIMEIRO, assinar DEPOIS), então toda escrita de
 * perfil re-tentava e re-falhava para sempre.
 *
 * ⛔ A PROVA É DE EMULADOR, não de regex. Regex sobre o fonte diria apenas que a linha mudou;
 * o que importa é o EFEITO — existe documento em `mail`, com destinatário e corpo, e o
 * `createdAt` resolveu para Timestamp de verdade.
 *
 * ⚠️ ORDEM NA SUÍTE: `run.js` chama este arquivo LOGO no início. O emulador executa gatilhos
 * em FILA e as suítes de amizade apagam dezenas de perfis, cada exclusão custando ~5 s de
 * espera deliberada em `_sweepDeletionLeftovers`. Rodando tarde, este teste mediria a fila,
 * não o gatilho.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const db = admin.firestore();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const U = 'uidSUMMARY0000000000000000001';
const EMAIL = 'summary.teste@exemplo.com';
const REPLY_TO = 'contato@barthlabs.com';
const TETO_MS = 120000;          // teto EXPLÍCITO: sem ele a ausência viraria espera infinita
const GRACA_MS = 15000;          // janela para provar que a guarda por assinatura NÃO reenvia

const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const perfil = async () => { const d = await db.collection('users').doc(U).get(); return d.exists ? (d.data() || {}) : null; };

/** Quantos e-mails já foram enfileirados para este destinatário. */
async function emailsPara(email) {
  const s = await db.collection('mail').where('to', 'array-contains', email).get();
  return s.docs.map((d) => d.data() || {});
}

async function limpar() {
  for (const col of ['users', 'mail']) {
    const s = await db.collection(col).get();
    const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  try { await admin.auth().deleteUser(U); } catch (e) {}
}

module.exports = (async () => {
  await limpar();

  // ── 1) NASCIMENTO DA CONTA ────────────────────────────────────────────────
  await admin.auth().createUser({ uid: U, email: EMAIL });
  await db.collection('users').doc(U).set({ displayName: 'Fulano Summary', email: EMAIL });

  /* Espera o e-mail APARECER e, no mesmo laço, vigia a ORDEM: `accountEmailSig` é gravado
   * DEPOIS do enfileiramento, de propósito — se a fila falhar, a assinatura não pode existir,
   * senão a re-tentativa some e o e-mail se perde em silêncio. Ver assinar depois de enfileirar. */
  let msgs = [], sigAntesDoEmail = false;
  const limite = Date.now() + TETO_MS;
  for (;;) {
    msgs = await emailsPara(EMAIL);
    if (msgs.length) break;
    const p = await perfil();
    if (p && p.accountEmailSig) { sigAntesDoEmail = true; break; }
    if (Date.now() > limite) break;
    await espera(500);
  }

  ok(msgs.length >= 1, '⛔ accountSummaryEmail ENFILEIROU o e-mail da conta em `mail` dentro de ' +
    (TETO_MS / 1000) + 's (ausente = o gatilho morreu calado)');
  ok(!sigAntesDoEmail, '⛔ e `accountEmailSig` NÃO foi gravado antes do e-mail existir ' +
    '(assinar antes apagaria a re-tentativa e perderia o e-mail em silêncio)');

  if (msgs.length) {
    const m = msgs[0];
    ok(Array.isArray(m.to) && m.to.indexOf(EMAIL) !== -1, '   vai para o e-mail da conta');
    ok(m.replyTo === REPLY_TO, '   com replyTo ' + REPLY_TO);
    ok(!!(m.message && String(m.message.subject || '').trim()), '   tem assunto');
    ok(!!(m.message && String(m.message.html || '').trim()), '   tem corpo html');
    ok(!!(m.message && String(m.message.text || '').trim()), '   tem corpo texto');
    ok(String((m.message || {}).text || '').indexOf(EMAIL) !== -1,
      '   e o corpo mostra o e-mail de login da pessoa');
    /* ⛔ ESTA é a asserção que pega o bug de origem: `serverTimestamp()` resolvido vira um
     * Timestamp com `toDate`. `undefined` aqui significa que o `_FV` não funcionou. */
    ok(!!(m.createdAt && typeof m.createdAt.toDate === 'function'),
      '⛔ `createdAt` é Timestamp resolvido (prova que serverTimestamp() funcionou)');
  }

  // ── 2) A ASSINATURA É GRAVADA DEPOIS ──────────────────────────────────────
  let p2 = null;
  const limite2 = Date.now() + TETO_MS;
  while (Date.now() < limite2) {
    p2 = await perfil();
    if (p2 && p2.accountEmailSig) break;
    await espera(500);
  }
  ok(!!(p2 && p2.accountEmailSig), '⛔ e `accountEmailSig` É gravado depois do envio ' +
    '(sem ele toda escrita do perfil re-enviaria para sempre)');

  // ── 3) UPDATE IRRELEVANTE NÃO GERA E-MAIL NOVO ────────────────────────────
  /* `accountDocSig` é displayName|email|phone. Mexer em qualquer outra coisa não muda a
   * identidade — e a guarda por assinatura existe justamente para o gatilho não virar
   * spam a cada escrita de perfil (presença, tema, notificação, cache social...). */
  const antes = (await emailsPara(EMAIL)).length;
  await db.collection('users').doc(U).set({ city: 'Belo Horizonte' }, { merge: true });
  await espera(GRACA_MS);
  const depois = (await emailsPara(EMAIL)).length;
  ok(depois === antes, '⛔ update irrelevante do perfil NÃO gera e-mail novo ' +
    '(antes ' + antes + ', depois ' + depois + ') — a guarda por assinatura segue de pé');
  const p3 = await perfil();
  ok(!!(p3 && p3.city === 'Belo Horizonte'), '   e a escrita irrelevante aconteceu mesmo');

  console.log('\n  accountSummaryEmail: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
