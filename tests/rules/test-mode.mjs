import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8199').split(':');
const env = await initializeTestEnvironment({ projectId:'demo-scoreplace',
  firestore:{ rules:readFileSync('firestore.rules', 'utf8'), host, port:Number(port) } });
const dev = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const kelly = 'OkQJOEkLMchgKYFZb8nLJm7nLPH2';
const org = 'uid_org', member = 'uid_member', referee = 'uid_referee';
const root = 'tournaments/test_mode_fixture';
const summary = 'tournaments_summary/test_mode_fixture';
const userDb = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const t = { name:'Ensaio', creatorUid:org, adminUids:[org], testModeEnabled:true,
      isPublic:false, organizerOnly:true, membersOnly:false, memberUids:[org], refereeUids:[referee] };
    await setDoc(doc(db, root), t);
    await setDoc(doc(db, summary), t);
    await setDoc(doc(db, 'tournaments/kelly_preview'), {
      ...t, creatorUid:dev, adminUids:[dev], memberUids:[dev], refereeUids:[],
      testAudiencePreviewUid:kelly
    });
    await setDoc(doc(db, 'tournaments/other_preview'), {
      ...t, creatorUid:dev, adminUids:[dev], memberUids:[dev], refereeUids:[],
      testAudiencePreviewUid:'uid_other'
    });
    await setDoc(doc(db, 'tournaments/stale_preview'), {
      ...t, creatorUid:dev, adminUids:[dev], memberUids:[dev], refereeUids:[],
      testModeEnabled:false, testAudiencePreviewUid:kelly
    });
    for (const col of ['matches', 'inscritos', 'courtState', 'billingReceipts', 'paymentSecrets']) {
      await setDoc(doc(db, root, col, 'one'), { participantUid:member, id:'one' });
      await setDoc(doc(db, 'tournaments/kelly_preview', col, 'one'), { participantUid:member, id:'one' });
    }
  });
  for (const path of [root, summary, root+'/matches/one', root+'/inscritos/one', root+'/courtState/one']) {
    for (const uid of [org, referee]) await assertSucceeds(getDoc(doc(userDb(uid), path)));
    for (const uid of [null, dev, member]) await assertFails(getDoc(doc(userDb(uid), path)));
  }
  for (const col of ['billingReceipts', 'paymentSecrets']) {
    await assertSucceeds(getDoc(doc(userDb(org), root, col, 'one')));
    await assertFails(getDoc(doc(userDb(member), root, col, 'one')));
  }
  for (const path of ['tournaments/kelly_preview', ...['matches', 'inscritos', 'courtState']
    .map(col => `tournaments/kelly_preview/${col}/one`)]) {
    await assertSucceeds(getDoc(doc(userDb(kelly), path)));
    await assertFails(getDoc(doc(userDb(member), path)));
  }
  await assertFails(getDoc(doc(userDb(kelly), 'tournaments/other_preview')));
  await assertFails(getDoc(doc(userDb(kelly), root)));
  for (const col of ['billingReceipts', 'paymentSecrets']) {
    await assertFails(getDoc(doc(userDb(kelly), 'tournaments/kelly_preview', col, 'one')));
  }
  const previewList = uid => getDocs(query(collection(userDb(uid), 'tournaments'),
    where('testAudiencePreviewUid', '==', uid), where('testModeEnabled', '==', true)));
  const kellyList = await assertSucceeds(previewList(kelly));
  if (kellyList.docs.map(d => d.id).join(',') !== 'kelly_preview') throw new Error('Prévia exclusiva da Kelly falhou');
  await assertFails(previewList(member));
  await assertFails(setDoc(doc(userDb(kelly), 'tournaments/kelly_preview'), { name:'Alterado' }, { merge:true }));
  await assertFails(setDoc(doc(userDb(dev), 'tournaments/kelly_preview'),
    { testAudiencePreviewUid:member }, { merge:true }));
  for (const col of ['tournaments', 'tournaments_summary']) {
    const list = (uid, field, value) => getDocs(query(collection(userDb(uid), col),
      where(field, field === 'memberUids' || field === 'refereeUids' ? 'array-contains' : '==', value)));
    const publicResult = await assertSucceeds(list(null, 'isPublic', true));
    if (publicResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste na descoberta');
    const memberResult = await assertSucceeds(list(member, 'memberUids', member));
    if (memberResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste na lista do inscrito');
    const orgResult = await assertSucceeds(list(org, 'memberUids', org));
    if (!orgResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste ausente para organizador');
    const refereeResult = await assertSucceeds(list(referee, 'refereeUids', referee));
    if (!refereeResult.docs.some(d => d.id === 'test_mode_fixture')) throw new Error('Teste ausente para árbitro');
    await assertFails(list(dev, 'creatorUid', org));
  }
  await assertFails(setDoc(doc(userDb(org), root), { name:'Alterado' }, { merge:true }));
  await assertFails(setDoc(doc(userDb(dev), root), { testModeEnabled:false }, { merge:true }));
  console.log('✅ modo Teste isolado nas regras');
} finally {
  await env.cleanup();
}
