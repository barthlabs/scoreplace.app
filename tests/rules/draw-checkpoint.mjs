import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8199').split(':');
const env = await initializeTestEnvironment({ projectId:'demo-scoreplace-draw-checkpoint-rules',
  firestore:{ rules:readFileSync('firestore.rules', 'utf8'), host, port:Number(port) } });
const uid = 'B17n7JCXYOfqahlcLZ0fKxGGyUu1';
const rootPath = 'tournaments/draw_checkpoint_rules';
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, rootPath), {
      id:'draw_checkpoint_rules', creatorUid:uid, adminUids:[uid], memberUids:[uid], refereeUids:[],
      testModeEnabled:true, preserveDrawOnTestReset:true, isPublic:false, organizerOnly:true,
      membersOnly:false, status:'closed', drawCheckpoint:{ state:'capturing', epoch:'epoch-1', hash:'' }
    });
    await setDoc(doc(db, rootPath, 'resultQueue', 'queued'), {
      actorUid:uid, matchId:'match-1', payload:{ score:[6,4] }
    });
    await setDoc(doc(db, 'tournamentDrawCheckpoints/draw_checkpoint_rules/snapshots/epoch-1'), { state:'active' });
  });
  const db = env.authenticatedContext(uid).firestore();
  await assertFails(getDoc(doc(db, 'tournamentDrawCheckpoints/draw_checkpoint_rules/snapshots/epoch-1')));
  await assertFails(setDoc(doc(db, rootPath), { name:'Alterado enquanto fotografa' }, { merge:true }));
  await assertFails(setDoc(doc(db, rootPath), { drawCheckpoint:{ state:'active', epoch:'forged', hash:'forged' } }, { merge:true }));
  await assertFails(setDoc(doc(db, rootPath, 'resultQueue', 'new-item'), {
    actorUid:uid, matchId:'match-1', payload:{ score:[6,4] }
  }));
  await assertFails(deleteDoc(doc(db, rootPath)));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), rootPath), { drawCheckpoint:{ state:'resetting', epoch:'epoch-1', hash:'' } }, { merge:true });
  });
  await assertFails(setDoc(doc(db, rootPath), { name:'Alterado durante reset' }, { merge:true }));
  await assertFails(setDoc(doc(db, rootPath, 'resultQueue', 'during-reset'), {
    actorUid:uid, matchId:'match-1', payload:{ score:[6,4] }
  }));
  await assertFails(deleteDoc(doc(db, rootPath)));
  console.log('✅ Rules do checkpoint pós-sorteio verificadas');
} finally {
  await env.cleanup();
}
