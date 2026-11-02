import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collectionGroup, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
assert.equal(host, '127.0.0.1');
assert.equal(Number(port), 8133);
const baseline = readFileSync(process.env.SP_PROBE_BASELINE_RULES, 'utf8');
const variant = readFileSync(process.env.SP_PROBE_VARIANT_RULES, 'utf8');
const nestedOnly = readFileSync(process.env.SP_PROBE_NESTED_RULES, 'utf8');
let env;
const useRules = async rules => {
  if (env) await env.cleanup();
  env = await initializeTestEnvironment({
    projectId: 'demo-scoreplace',
    firestore: { rules, host, port: Number(port) }
  });
};
await useRules(baseline);

const mixedUid = 'uid_mixed';
const publicUid = 'uid_public_only';
const dbFor = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
const result = (uid, id) => getDoc(doc(dbFor(uid), 'tournaments', id, 'results', 'm1'));
const history = uid => getDocs(query(collectionGroup(dbFor(uid), 'results'), where('playerUids', 'array-contains', uid)));
const denied = async promise => {
  const error = await assertFails(promise);
  assert.equal(error.code, 'permission-denied', 'a negativa deve vir das Rules, não de erro de sintaxe/rede');
};
const seed = async () => env.withSecurityRulesDisabled(async context => {
  const db = context.firestore();
  await setDoc(doc(db, 'tournaments', 'public'), {
    creatorUid: 'uid_org', adminUids: ['uid_org'], memberUids: [mixedUid, publicUid],
    isPublic: true, organizerOnly: false, membersOnly: false, isSandbox: false
  });
  await setDoc(doc(db, 'tournaments', 'hidden'), {
    creatorUid: 'uid_org', adminUids: ['uid_org'], memberUids: [mixedUid],
    isPublic: false, organizerOnly: true, membersOnly: false, isSandbox: false
  });
  await setDoc(doc(db, 'tournaments', 'public', 'results', 'm1'), { playerUids: [mixedUid, publicUid] });
  await setDoc(doc(db, 'tournaments', 'hidden', 'results', 'm1'), { playerUids: [mixedUid] });
});

try {
  await seed();
  await assertSucceeds(result(mixedUid, 'hidden'));
  const baselineHistory = await assertSucceeds(history(mixedUid));
  assert.deepEqual(baselineHistory.docs.map(d => d.ref.path).sort(), [
    'tournaments/hidden/results/m1', 'tournaments/public/results/m1'
  ]);

  await useRules(nestedOnly);
  await denied(result(mixedUid, 'hidden'));
  await assertSucceeds(result(mixedUid, 'public'));
  await assertSucceeds(result(null, 'public'));

  await useRules(variant);
  await denied(result(mixedUid, 'hidden'));
  await assertSucceeds(result(mixedUid, 'public'));
  await assertSucceeds(result(null, 'public'));

  // Mesmo caminho e playerUids; só a visibilidade da raiz muda.
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tournaments', 'hidden'), {
      organizerOnly: false, isPublic: true
    }, { merge: true });
  });
  await assertSucceeds(result(mixedUid, 'hidden'));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'tournaments', 'hidden'), {
      organizerOnly: true, isPublic: false
    }, { merge: true });
  });
  await denied(result(mixedUid, 'hidden'));

  await denied(history(mixedUid));
  try {
    const publicOnly = await history(publicUid);
    assert.deepEqual(publicOnly.docs.map(d => d.ref.path), ['tournaments/public/results/m1']);
    console.log('CONSULTA SÓ-PÚBLICA: SUCESSO');
  } catch (error) {
    assert.equal(error.code, 'permission-denied');
    console.log('CONSULTA SÓ-PÚBLICA: NEGADA');
  }
  console.log('CUSTO DE get(): não medido');
  console.log('VIABILIDADE: NÃO');
} finally {
  if (env) await env.cleanup();
}
