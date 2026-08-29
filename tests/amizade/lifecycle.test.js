/* CICLO DE VIDA DA AMIZADE — INTEGRAÇÃO REAL contra o emulador do Firestore.
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ POR QUE ESTE ARQUIVO EXISTE (3ª auditoria, ponto 8): a fiação estava provada só por
 * regex sobre o fonte. Regex não prova o EFEITO — não diz se o `pairId` foi rekeyado, se a
 * projeção sobrou, se o cache ficou com uid morto. Aqui as funções REAIS
 * (functions/amizade-lifecycle.js) rodam contra um Firestore de verdade e o estado final é
 * lido do banco.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));
const vida = require(path.join(__dirname, '..', '..', 'functions', 'amizade-lifecycle.js'));
const core = require(path.join(__dirname, '..', '..', 'functions', 'amizade-authority-core.js'));

const db = admin.firestore();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

const T0 = '2026-08-01T10:00:00.000Z', T1 = '2026-08-02T10:00:00.000Z';
const P = (a, b) => core.pairId(a, b);

async function limpar() {
  for (const col of ['friendships', 'users']) {
    const s = await db.collection(col).get();
    const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  const acc = await db.collectionGroup('accepted').get();
  const b2 = db.batch(); acc.forEach((d) => b2.delete(d.ref)); await b2.commit();
}
async function perfil(uid, extra) { await db.collection('users').doc(uid).set(Object.assign({ displayName: uid }, extra || {})); }
async function rel(u1, u2, status, by, criado, aceito) {
  const p = core.parOrdenado(u1, u2);
  await db.collection('friendships').doc(P(u1, u2)).set({
    uidA: p.uidA, uidB: p.uidB, status, requestedBy: by, createdAt: criado || T0, acceptedAt: aceito || null });
}
async function acesso(u, f) { await db.collection('friendAccess').doc(u).collection('accepted').doc(f).set({ since: T0 }); }
const existeRel = async (a, b) => (await db.collection('friendships').doc(P(a, b)).get()).exists;
const statusRel = async (a, b) => { const d = await db.collection('friendships').doc(P(a, b)).get(); return d.exists ? d.data().status : null; };
const temAcesso = async (u, f) => (await db.collection('friendAccess').doc(u).collection('accepted').doc(f).get()).exists;
const cacheDe = async (u) => { const d = await db.collection('users').doc(u).get(); return d.exists ? (d.data() || {}) : {}; };
async function todasProjecoes() {
  const s = await db.collectionGroup('accepted').get(); const out = [];
  s.forEach((d) => { const pai = d.ref.parent.parent; if (pai && pai.parent && pai.parent.id === 'friendAccess') out.push(pai.id + '/' + d.id); });
  return out;
}

const OLD = 'uidOLD', KEEP = 'uidKEEP', C = 'uidC', D = 'uidD';

/* ⚠️ EXPORTA a promessa: o `run.js` faz `await require(...)`, e sem isto o módulo
 * devolvia {} na hora e os dois testes rodavam CONCORRENTES no mesmo emulador,
 * um limpando as coleções do outro. Falha que parecia bug do código testado. */
module.exports = (async () => {
  // as funções de lifecycle são chamadas direto (sem callable), mas o service consulta a fase
  await db.doc('_meta/amizadeMigration').set({ fase: 'live' });
  // ══ 1) OLD e KEEP eram AMIGOS ENTRE SI ═════════════════════════════════════
  await limpar();
  await perfil(OLD); await perfil(KEEP);
  await rel(OLD, KEEP, 'accepted', OLD, T0, T1);
  await acesso(OLD, KEEP); await acesso(KEEP, OLD);
  await vida.amizadeNoMerge(db, OLD, KEEP);

  ok(!(await existeRel(OLD, KEEP)), '[old↔keep] a relação entre as duas contas fundidas SOME');
  ok((await todasProjecoes()).length === 0, '[old↔keep] nenhuma projeção sobra');
  const cK1 = await cacheDe(KEEP);
  ok(!(cK1.friends || []).includes(OLD), '[old↔keep] ⛔ uid MORTO não fica no cache do sobrevivente');
  ok(!(cK1.friends || []).includes(KEEP), '[old↔keep] ⛔ e ninguém vira amigo de si mesmo');

  // ══ 2) OLD accepted com C · KEEP pending com C (colisão) ═══════════════════
  await limpar();
  await perfil(OLD); await perfil(KEEP); await perfil(C);
  await rel(OLD, C, 'accepted', OLD, T0, T1);
  await acesso(OLD, C); await acesso(C, OLD);
  await rel(KEEP, C, 'pending', C, T1, null);
  await vida.amizadeNoMerge(db, OLD, KEEP);

  ok(await statusRel(KEEP, C) === 'accepted', '[colisão] accepted prevalece sobre pending');
  ok(!(await existeRel(OLD, C)), '[colisão] o doc com o pairId do uid MORTO é apagado');
  ok(await temAcesso(KEEP, C) && await temAcesso(C, KEEP), '[colisão] projeção nas duas direções do KEEP');
  ok(!(await temAcesso(OLD, C)) && !(await temAcesso(C, OLD)), '[colisão] projeção do uid morto some');
  const cK2 = await cacheDe(KEEP), cC2 = await cacheDe(C);
  ok((cK2.friends || []).includes(C) && (cC2.friends || []).includes(KEEP), '[colisão] cache dos DOIS reflete a amizade');
  ok(!(cC2.friendRequestsSent || []).includes(KEEP) && !(cC2.friendRequestsReceived || []).includes(KEEP),
    '[colisão] ⛔ NÃO sobra pending residual (era o que a união deixava)');
  ok(!(cC2.friends || []).includes(OLD), '[colisão] o terceiro não fica com o uid morto');
  ok((await todasProjecoes()).length === 2, '[colisão] exatamente 2 projeções no banco');

  // ══ 3) OLD e KEEP ambos com relação com C, os DOIS accepted ════════════════
  await limpar();
  await perfil(OLD); await perfil(KEEP); await perfil(C);
  await rel(OLD, C, 'accepted', OLD, T0, T1); await acesso(OLD, C); await acesso(C, OLD);
  await rel(KEEP, C, 'accepted', KEEP, T0, T1); await acesso(KEEP, C); await acesso(C, KEEP);
  await vida.amizadeNoMerge(db, OLD, KEEP);
  ok(await statusRel(KEEP, C) === 'accepted', '[2×accepted] resulta em UMA amizade accepted');
  ok(!(await existeRel(OLD, C)), '[2×accepted] sem doc duplicado');
  ok((await todasProjecoes()).length === 2, '[2×accepted] sem projeção duplicada');
  ok(((await cacheDe(C)).friends || []).filter((u) => u === KEEP).length === 1, '[2×accepted] cache sem repetição');

  // ══ 4) PENDING nos dois sentidos ═══════════════════════════════════════════
  await limpar();
  await perfil(OLD); await perfil(KEEP); await perfil(C); await perfil(D);
  await rel(OLD, C, 'pending', OLD, T0, null);   // OLD convidou C
  await rel(OLD, D, 'pending', D, T0, null);     // D convidou OLD
  await vida.amizadeNoMerge(db, OLD, KEEP);
  ok(await statusRel(KEEP, C) === 'pending', '[pending] convite ENVIADO é repontado');
  ok(await statusRel(KEEP, D) === 'pending', '[pending] convite RECEBIDO é repontado');
  const cK4 = await cacheDe(KEEP), cC4 = await cacheDe(C), cD4 = await cacheDe(D);
  ok((cK4.friendRequestsSent || []).includes(C), '[pending] KEEP herda o enviado');
  ok((cK4.friendRequestsReceived || []).includes(D), '[pending] e o recebido, no sentido certo');
  ok((cC4.friendRequestsReceived || []).includes(KEEP) && !(cC4.friendRequestsSent || []).includes(KEEP),
    '[pending] o outro lado só tem o sentido correspondente');
  ok((cD4.friendRequestsSent || []).includes(KEEP), '[pending] e D continua como quem enviou');
  ok((await todasProjecoes()).length === 0, '[pending] ⛔ pendência NÃO concede acesso');
  ok((cK4.friends || []).length === 0, '[pending] e não vira amizade no cache');

  // ══ 5) IDEMPOTÊNCIA ═══════════════════════════════════════════════════════
  const antes = JSON.stringify({ r: await statusRel(KEEP, C), p: (await todasProjecoes()).sort(), c: (await cacheDe(KEEP)).friendRequestsSent });
  await vida.amizadeNoMerge(db, OLD, KEEP);
  await vida.amizadeNoMerge(db, OLD, KEEP);
  const depois = JSON.stringify({ r: await statusRel(KEEP, C), p: (await todasProjecoes()).sort(), c: (await cacheDe(KEEP)).friendRequestsSent });
  ok(antes === depois, '[idempotência] rodar 3× dá exatamente o mesmo estado');

  // ══ 6) BRANCH RARA: perfil Firestore do KEEP NÃO existe ════════════════════
  await limpar();
  await perfil(OLD); await perfil(C);            // KEEP sem doc, de propósito
  await rel(OLD, C, 'accepted', OLD, T0, T1); await acesso(OLD, C); await acesso(C, OLD);
  await vida.amizadeNoMerge(db, OLD, KEEP);
  ok(await statusRel(KEEP, C) === 'accepted', '[keep sem doc] a relação migra mesmo assim');
  ok(!(await existeRel(OLD, C)), '[keep sem doc] e o doc do uid morto some');
  ok(await temAcesso(KEEP, C) && await temAcesso(C, KEEP), '[keep sem doc] projeção recriada');
  ok(!(await temAcesso(OLD, C)), '[keep sem doc] ⛔ projeção do morto NÃO sobrevive (tombstone sem migrar era o furo)');
  ok(!((await cacheDe(C)).friends || []).includes(OLD), '[keep sem doc] terceiro sem uid morto no cache');
  /* ⚠️ MUDOU na 4ª auditoria (ponto 6): antes este teste exigia que NENHUM doc nascesse.
   * Isso deixava o sobrevivente sem projeção social depois de a autoridade já apontar pra
   * ele. Agora a projeção MÍNIMA é criada — e a distinção que importa é esta: aqui só
   * entram os quatro campos DERIVADOS do cânone mais a marca `_socialProjetadoEm`; nenhuma
   * identidade é inventada. É o oposto do perfil fantasma que a callable recusa, onde o
   * uid vinha do corpo da chamada e nada provava que a conta existia. */
  const kDoc = (await db.collection('users').doc(KEEP).get()).data() || {};
  ok(kDoc._socialProjetadoEm, '[keep sem doc] a projeção social mínima É criada pro sobrevivente');
  ok(!kDoc.displayName && !kDoc.email, '[keep sem doc] ⛔ e NENHUMA identidade é inventada nela');

  // ══ 7) EXCLUSÃO DE CONTA ══════════════════════════════════════════════════
  await limpar();
  await perfil(OLD); await perfil(C); await perfil(D);
  await rel(OLD, C, 'accepted', OLD, T0, T1); await acesso(OLD, C); await acesso(C, OLD);
  await rel(OLD, D, 'pending', OLD, T0, null);
  await rel(C, D, 'accepted', C, T0, T1); await acesso(C, D); await acesso(D, C);
  await vida.excluirAmizade(db, OLD);
  ok(!(await existeRel(OLD, C)) && !(await existeRel(OLD, D)), '[exclusão] as relações do uid somem');
  ok(await existeRel(C, D), '[exclusão] ⛔ e a relação de TERCEIROS entre si não é tocada');
  ok(!(await temAcesso(C, OLD)) && !(await temAcesso(OLD, C)), '[exclusão] projeção órfã não sobra');
  ok(!((await cacheDe(C)).friends || []).includes(OLD), '[exclusão] cache do terceiro limpo');
  ok(((await cacheDe(C)).friends || []).includes(D), '[exclusão] e o resto do cache dele preservado');
  ok((await todasProjecoes()).sort().join() === [C + '/' + D, D + '/' + C].sort().join(),
    '[exclusão] sobram exatamente as projeções de C↔D');

  // ══ 8) CACHE RECONSTRUÍDO CORRIGE ESTADO SUJO PREEXISTENTE ════════════════
  await limpar();
  await perfil(C, { friends: [OLD, C, 'uid_fantasma'], friendRequestsSent: [D], friendRequestsReceived: [D],
                    friendRequestsSentAt: { [D]: T0, 'uid_fantasma': T0 } });
  await perfil(D);
  await rel(C, D, 'accepted', C, T0, T1);
  await vida.reconstruirCache(db, [C]);
  const cSujo = await cacheDe(C);
  ok((cSujo.friends || []).join() === D, '[cache] friends vem do CÂNONE (some uid morto, self e fantasma)');
  ok((cSujo.friendRequestsSent || []).length === 0 && (cSujo.friendRequestsReceived || []).length === 0,
    '[cache] ⛔ quem é amigo não fica em convite — invariante aplicada na saída');
  ok(Object.keys(cSujo.friendRequestsSentAt || {}).length === 0, '[cache] e o carimbo órfão some junto');

  // ══ 9) RETRY DE MERGE APÓS FALHA PARCIAL (4ª auditoria, ponto 5) ══════════
  /* Estado inicial que reproduz a falha: o cânone JÁ foi migrado (OLD→KEEP), mas o cache
   * de C ficou pra trás com o uid morto — é o que acontece quando o commit da autoridade
   * passa e a reconstrução do cache falha (timeout, instância morta).
   * Antes, o retry era no-op: `planejarMerge` não achava mais relação com OLD e a lista de
   * terceiros tinha ido embora junto. O estrago ficava de pé para sempre. */
  await limpar();
  await perfil(KEEP); await perfil(C, { friends: [OLD], friendRequestsSent: [], friendRequestsReceived: [] });
  await rel(KEEP, C, 'accepted', KEEP, T0, T1); await acesso(KEEP, C); await acesso(C, KEEP);
  await vida.amizadeNoMerge(db, OLD, KEEP);          // retry
  const cRetry = await cacheDe(C);
  ok(!(cRetry.friends || []).includes(OLD), '[retry merge] ⛔ o uid MORTO some do cache do terceiro');
  ok((cRetry.friends || []).includes(KEEP), '[retry merge] e o KEEP entra, porque o CÂNONE diz que a relação existe');
  ok(await statusRel(KEEP, C) === 'accepted', '[retry merge] a relação canônica não é alterada');
  ok(!(await existeRel(OLD, C)), '[retry merge] e nenhuma relação é inventada');

  // mesmo retry, mas SEM relação no cânone: o cache tem que esvaziar, não inventar KEEP
  await limpar();
  await perfil(KEEP); await perfil(C, { friends: [OLD] });
  await vida.amizadeNoMerge(db, OLD, KEEP);
  const cRetry2 = await cacheDe(C);
  ok((cRetry2.friends || []).length === 0,
    '[retry merge] ⛔ sem relação no cânone, o cache NÃO ganha KEEP — nada é inventado');

  // ══ 10) RETRY DE DELETE APÓS FALHA PARCIAL ════════════════════════════════
  await limpar();
  await perfil(C, { friends: [OLD], friendRequestsReceived: [OLD] });   // relação já apagada
  await vida.excluirAmizade(db, OLD);
  const cDel = await cacheDe(C);
  ok(!(cDel.friends || []).includes(OLD) && !(cDel.friendRequestsReceived || []).includes(OLD),
    '[retry delete] ⛔ o cache do terceiro é corrigido mesmo com a relação já apagada');

  // ══ 11) KEEP SEM PERFIL: a projeção é criada, e sobrevive à criação posterior ══
  await limpar();
  await perfil(OLD); await perfil(C);
  await rel(OLD, C, 'accepted', OLD, T0, T1); await acesso(OLD, C); await acesso(C, OLD);
  await vida.amizadeNoMerge(db, OLD, KEEP);
  const kProj = await cacheDe(KEEP);
  ok((kProj.friends || []).includes(C), '[keep sem perfil] a projeção social MÍNIMA é criada pro sobrevivente');
  ok(kProj._socialProjetadoEm, 'e fica marcada como projeção (quem criar o perfil faz merge por cima)');
  // agora o perfil "nasce" depois, com merge
  await db.collection('users').doc(KEEP).set({ displayName: 'Sobrevivente' }, { merge: true });
  const kDepois = await cacheDe(KEEP);
  ok((kDepois.friends || []).includes(C) && kDepois.displayName === 'Sobrevivente',
    '[keep sem perfil] ⛔ e a projeção NÃO se perde quando o perfil é criado depois');

  // ══ 12) LEGADO NÃO CONCEDE ACESSO (4ª auditoria, ponto 1) ═════════════════
  await limpar();
  await perfil(C); await perfil(D);
  await rel(C, D, 'legacy_unverified', C, T0, null);
  await vida.reconstruirCache(db, [C, D]);
  ok((await todasProjecoes()).length === 0, '[legacy] ⛔ relação legada NÃO gera friendAccess');
  ok(((await cacheDe(C)).friends || []).length === 0, '[legacy] e não aparece como amizade no cache');
  ok(((await cacheDe(C)).friendRequestsSent || []).length === 0, '[legacy] nem como convite pendente');
  ok(await existeRel(C, D), '[legacy] mas a relação CONTINUA legível (é dela que a reconfirmação parte)');

  console.log('\n' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})().catch((e) => { console.error('ERRO', e); process.exit(1); });
