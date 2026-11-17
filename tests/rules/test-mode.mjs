import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8199').split(':');
const env = await initializeTestEnvironment({ projectId:'demo-scoreplace',
  firestore:{ rules:readFileSync('firestore.rules', 'utf8'), host, port:Number(port) } });
const dev = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const org = 'uid_org', member = 'uid_member', referee = 'uid_referee';
const root = 'tournaments/test_mode_fixture';
const summary = 'tournaments_summary/test_mode_fixture';
const userDb = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const t = { name:'Ensaio', creatorUid:org, adminUids:[org], testModeEnabled:true,
      isPublic:false, organizerOnly:true, membersOnly:false, memberUids:[dev], refereeUids:[] };
    await setDoc(doc(db, root), t);
    await setDoc(doc(db, summary), t);
    for (const col of ['matches', 'inscritos', 'courtState', 'billingReceipts', 'paymentSecrets']) {
      await setDoc(doc(db, root, col, 'one'), { participantUid:member, id:'one' });
    }
  });
  for (const path of [root, summary, root+'/matches/one', root+'/inscritos/one', root+'/courtState/one']) {
    await assertSucceeds(getDoc(doc(userDb(dev), path)));
    for (const uid of [null, org, member, referee]) await assertFails(getDoc(doc(userDb(uid), path)));
  }
  for (const col of ['billingReceipts', 'paymentSecrets']) {
    for (const uid of [org, member]) await assertFails(getDoc(doc(userDb(uid), root, col, 'one')));
  }
  for (const col of ['tournaments', 'tournaments_summary']) {
    const list = (uid, field, value) => getDocs(query(collection(userDb(uid), col),
      where(field, field === 'memberUids' || field === 'refereeUids' ? 'array-contains' : '==', value)));
    const publicResult = await assertSucceeds(list(null, 'isPublic', true));
    if (publicResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste na descoberta');
    const memberResult = await assertSucceeds(list(member, 'memberUids', member));
    if (memberResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste na lista do inscrito');
    const devResult = await assertSucceeds(list(dev, 'memberUids', dev));
    if (!devResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste ausente para dev');
    await assertFails(list(org, 'creatorUid', org));
  }
  await assertFails(setDoc(doc(userDb(org), root), { name:'Alterado' }, { merge:true }));
  await assertFails(setDoc(doc(userDb(dev), root), { testModeEnabled:false }, { merge:true }));
  console.log('✅ modo Teste isolado nas regras');
} finally {
  await env.cleanup();
}
