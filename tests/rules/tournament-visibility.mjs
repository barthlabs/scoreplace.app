import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-scoreplace',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) }
});
const org = 'uid_org', cohost = 'uid_cohost', member = 'uid_member', stranger = 'uid_stranger';
const get = (uid, path) => getDoc(doc(uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore(), path));
const succeeds = async (uid, path) => {
  try { await assertSucceeds(get(uid, path)); }
  catch (error) { throw new Error('Leitura deveria passar: ' + path + ' para ' + uid, { cause: error }); }
};
const fails = async (uid, path) => {
  try { await assertFails(get(uid, path)); }
  catch (error) { throw new Error('Leitura deveria falhar: ' + path + ' para ' + uid, { cause: error }); }
};
try {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const [id, mode] of [['hidden', 'organizerOnly'], ['members', 'membersOnly'], ['public', 'isPublic']]) {
      const base = { id, name: id, creatorUid: org, adminUids: [org, cohost], memberUids: [org, member], isPublic: mode === 'isPublic', organizerOnly: mode === 'organizerOnly', membersOnly: mode === 'membersOnly' };
      await setDoc(doc(db, 'tournaments', id), base);
      await setDoc(doc(db, 'tournaments_summary', id), { ...base,
        memberUids: mode === 'organizerOnly' ? [org] : base.memberUids });
      await setDoc(doc(db, 'tournaments', id, 'inscritos', 'p1'), { name: 'Atleta' });
      await setDoc(doc(db, 'tournaments', id, 'history', 'h1'), { message: 'Registro' });
      await setDoc(doc(db, 'tournaments', id, 'results', 'm1'), { playerUids: [] });
    }
  });
  for (const path of ['tournaments/hidden', 'tournaments_summary/hidden', 'tournaments/hidden/inscritos/p1', 'tournaments/hidden/history/h1', 'tournaments/hidden/results/m1']) {
    await succeeds(org, path);
    await succeeds(cohost, path); // adminUid ativo, mesmo fora de memberUids do torneio
    await fails(member, path);
    await fails(stranger, path);
    await fails(null, path);
  }
  for (const path of ['tournaments/members', 'tournaments_summary/members', 'tournaments/members/inscritos/p1']) {
    await succeeds(org, path);
    await succeeds(cohost, path);
    await succeeds(member, path);
    await fails(stranger, path);
    await fails(null, path);
  }
  await assertSucceeds(get(null, 'tournaments/public'));
  await assertSucceeds(get(null, 'tournaments_summary/public'));
  console.log('✅ visibilidade do torneio: geral, inscritos e organizadores');
} finally {
  await env.cleanup();
}
