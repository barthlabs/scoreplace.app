/* O GATILHO DE AUTO-MERGE ATRAVESSA O FREEZE? — emulador REAL (8ª auditoria, ponto 1).
 * Roda dentro de: npm run test:amizade
 *
 * ⛔ O FURO: `_scanAndMergeByField` consultava a fase, mas `autoMergeOnProfileUpdate` chama
 * `_executeMerge` DIRETO — e `_executeMerge` só punha o lock, sem olhar a fase. Uma edição
 * de perfil (telefone/e-mail) disparava o gatilho e a fusão passava por cima do
 * congelamento, contradizendo o runbook, que promete backend parado em `frozen`.
 * A correção foi levar a trava para a FRONTEIRA (`_executeMerge`), pra qualquer caller
 * futuro nascer protegido em vez de depender de alguém lembrar de gatear.
 *
 * ⚠️ Este teste escreve no Firestore e ESPERA o gatilho rodar — por isso a folga. Ele prova
 * o EFEITO (zero merge, zero lápide, zero mudança social), não a presença de uma linha.
 *
 * ⛔ O QUE ELE **NÃO** PROVA, e por quê — MEDIDO no emulador em 29/ago/2026:
 * o Firebase Auth (emulador e produção) RECUSA duas contas com o mesmo telefone
 * (`auth/phone-number-already-exists`) ou o mesmo e-mail. E `_mayAutoMerge` exige
 * `credentialsProveSamePerson`, que pede exatamente a MESMA credencial nos dois lados.
 * Logo não dá pra montar, num fixture limpo, um par que o gatilho aceite fundir — ele
 * sempre para antes, em "sem-credencial-autenticada". Este teste prova que o gatilho roda e
 * não funde; ele NÃO consegue provar que a trava de fase é o que o impede.
 * ⭐ Quem prova a trava é `guardaDeMerge` (functions/amizade-lifecycle.js), exercitada
 * logo abaixo: é a MESMA fronteira que `_executeMerge` usa. Não inventar um fixture que o
 * Firebase não permite é mais honesto que um teste verde pelo motivo errado.
 */
const path = require('path');
const admin = require(path.join(__dirname, '..', '..', 'functions', 'node_modules', 'firebase-admin'));

const db = admin.firestore();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const A = 'uidAUTOMERGEa000000000000001';
const B = 'uidAUTOMERGEb000000000000002';
const C = 'uidAUTOMERGEc000000000000003';
const FONE = '+5511999990001';

async function limpar() {
  for (const col of ['friendships', 'users', 'userLifecycle']) {
    const s = await db.collection(col).get(); const b = db.batch(); s.forEach((d) => b.delete(d.ref)); await b.commit();
  }
  const acc = await db.collectionGroup('accepted').get();
  const b2 = db.batch(); acc.forEach((d) => b2.delete(d.ref)); await b2.commit();
}
const lapide = async (uid) => { const d = await db.collection('users').doc(uid).get(); return !!(d.exists && d.data().mergedInto); };

module.exports = (async () => {
  // ══ EM `frozen`: o gatilho dispara, mas NÃO funde ═════════════════════════
  await limpar();
  await db.doc('_meta/amizadeMigration').set({ fase: 'frozen', maintenance: false });

  await db.collection('users').doc(A).set({ displayName: 'Dupla A', phone: FONE, createdAt: '2026-01-01T00:00:00Z' });
  await db.collection('users').doc(B).set({ displayName: 'Dupla B', createdAt: '2026-02-01T00:00:00Z' });
  await db.collection('users').doc(C).set({ displayName: 'Terceiro', friends: [] });
  await espera(1500);

  const relAntes = (await db.collection('friendships').get()).size;

  // a EDIÇÃO que dispara o gatilho: B ganha o mesmo telefone de A
  await db.collection('users').doc(B).update({ phone: FONE });
  await espera(8000);          // folga pro gatilho rodar de verdade

  ok(!(await lapide(A)) && !(await lapide(B)),
    '⛔ [frozen] ZERO lápide — o auto-merge NÃO fundiu as duas contas');
  ok((await db.collection('users').doc(A).get()).exists && (await db.collection('users').doc(B).get()).exists,
    '   e as duas contas continuam de pé');
  ok((await db.collection('friendships').get()).size === relAntes,
    '⛔ [frozen] ZERO mudança em friendships');
  const acc = await db.collectionGroup('accepted').get();
  let nAcc = 0; acc.forEach((d) => { const p = d.ref.parent.parent; if (p && p.parent && p.parent.id === 'friendAccess') nAcc++; });
  ok(nAcc === 0, '⛔ [frozen] ZERO friendAccess');
  const lifecycle = await db.collection('userLifecycle').get();
  const presos = lifecycle.docs.filter((d) => (d.data() || {}).estado && d.data().estado !== 'active');
  ok(presos.length === 0, '   e nenhum lock ficou preso (a trava recusa ANTES de adquirir)');

  // ══ EM `live` + maintenance: também não ═══════════════════════════════════
  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: true });
  await db.collection('users').doc(B).update({ phone: '+5511999990002' });
  await espera(2000);
  await db.collection('users').doc(B).update({ phone: FONE });
  await espera(8000);
  ok(!(await lapide(A)) && !(await lapide(B)),
    '⛔ [live+maintenance] o auto-merge também NÃO funde');

  // ══ A GUARDA DE MERGE — a fronteira que `_executeMerge` usa ══════════════
  const vida = require(path.join(__dirname, '..', '..', 'functions', 'amizade-lifecycle.js'));
  class FakeHttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
  const tentar = async () => {
    let rodou = false;
    try {
      await vida.guardaDeMerge(db, FakeHttpsError, [A, B], async () => { rodou = true; return 'fez'; });
      return { rodou, erro: null };
    } catch (e) { return { rodou, erro: e }; }
  };

  for (const est of [{ fase: 'not_started', maintenance: false }, { fase: 'frozen', maintenance: false },
                     { fase: 'live', maintenance: true }]) {
    await db.doc('_meta/amizadeMigration').set(est);
    const t = await tentar();
    const rotulo = est.fase + (est.maintenance ? '+maintenance' : '');
    ok(t.erro !== null && !t.rodou,
      '⛔ [guardaDeMerge/' + rotulo + '] a fusão NÃO roda (erro: ' + (t.erro && t.erro.code) + ')');
    const locks = await db.collection('userLifecycle').get();
    ok(locks.docs.every((d) => !(d.data() || {}).estado || d.data().estado === 'active'),
      '   e nenhum lock foi adquirido (a fase é conferida ANTES de adquirir)');
  }

  await db.doc('_meta/amizadeMigration').set({ fase: 'live', maintenance: false });
  const t2 = await tentar();
  ok(t2.erro === null && t2.rodou, '✅ [guardaDeMerge/live] com tudo liberado, a fusão roda');
  const locks2 = await db.collection('userLifecycle').get();
  ok(locks2.docs.every((d) => !(d.data() || {}).estado || d.data().estado === 'active'),
    '   e o lock é LIBERADO no fim');

  console.log('\n  auto-merge no freeze: ' + pass + ' ok, ' + fail + ' falhas');
  if (fail) process.exit(1);
})();
