import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const env = await initializeTestEnvironment({
  projectId: 'demo-scoreplace',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) }
});
const org = 'uid_org', cohost = 'uid_cohost', member = 'uid_member', stranger = 'uid_stranger';
const referee = 'uid_referee', invited = 'uid_invited', removed = 'uid_removed';
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
      const base = { id, name: id, creatorUid: org, adminUids: [org, cohost], memberUids: mode === 'organizerOnly' ? [org, cohost] : [org, member], refereeUids: mode === 'isPublic' ? [] : [referee, removed], isPublic: mode === 'isPublic', organizerOnly: mode === 'organizerOnly', membersOnly: mode === 'membersOnly' };
      await setDoc(doc(db, 'tournaments', id), base);
      await setDoc(doc(db, 'tournaments_summary', id), { ...base,
        memberUids: mode === 'organizerOnly' ? [org] : base.memberUids });
      await setDoc(doc(db, 'tournaments', id, 'inscritos', 'p1'), { name: 'Atleta' });
      await setDoc(doc(db, 'tournaments', id, 'history', 'h1'), { message: 'Registro' });
      await setDoc(doc(db, 'tournaments', id, 'courtState', 'main'), { released: { m1: '2026-10-22T18:00:00Z' } });
      await setDoc(doc(db, 'tournaments', id, 'courtReleases', 'm1'), { matchId: 'm1' });
      await setDoc(doc(db, 'tournaments', id, 'results', 'm1'), { playerUids: mode === 'organizerOnly' ? [] : [member] });
    }
    await setDoc(doc(db, 'tournaments', 'legacy_creator'), { creatorUid: 'uid_legacy_creator', memberUids: [org], isPublic: false, organizerOnly: true });
    await setDoc(doc(db, 'tournaments_summary', 'legacy_creator'), { creatorUid: 'uid_legacy_creator', memberUids: [org], isPublic: false, organizerOnly: true });
  });
  await succeeds(removed, 'tournaments/hidden');
  await succeeds(removed, 'tournaments_summary/hidden');
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    for (const id of ['hidden', 'members']) {
      for (const col of ['tournaments', 'tournaments_summary']) {
        await setDoc(doc(db, col, id), { refereeUids: [referee] }, { merge: true });
      }
    }
  });
  for (const path of ['tournaments/hidden', 'tournaments_summary/hidden', 'tournaments/hidden/inscritos/p1', 'tournaments/hidden/history/h1', 'tournaments/hidden/results/m1', 'tournaments/hidden/courtState/main', 'tournaments/hidden/courtReleases/m1']) {
    await succeeds(org, path);
    await succeeds(cohost, path); // adminUid ativo, mesmo fora de memberUids do torneio
    await succeeds(referee, path);
    await fails(invited, path);
    await fails(removed, path);
    await fails(member, path);
    await fails(stranger, path);
    await fails(null, path);
  }
  for (const path of ['tournaments/members', 'tournaments_summary/members', 'tournaments/members/inscritos/p1', 'tournaments/members/courtState/main', 'tournaments/members/courtReleases/m1']) {
    await succeeds(org, path);
    await succeeds(cohost, path);
    await succeeds(member, path);
    await succeeds(referee, path);
    await fails(stranger, path);
    await fails(null, path);
  }
  await assertSucceeds(get(null, 'tournaments/public'));
  await assertSucceeds(get(null, 'tournaments_summary/public'));
  await assertSucceeds(get(null, 'tournaments/public/courtState/main'));
  await assertSucceeds(get(null, 'tournaments/public/courtReleases/m1'));
  await assertFails(setDoc(doc(env.authenticatedContext(org).firestore(), 'tournaments', 'public', 'courtState', 'main'), { released: {} }));
  await assertFails(setDoc(doc(env.authenticatedContext(org).firestore(), 'tournaments', 'public', 'courtReleases', 'm1'), { matchId: 'forged' }));
  await assertFails(setDoc(doc(env.authenticatedContext(referee).firestore(), 'tournaments', 'hidden', 'courtState', 'main'), { released: {} }));
  const list = (uid, col, field, value) => getDocs(query(
    collection(uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore(), col),
    where(field, field === 'memberUids' || field === 'refereeUids' ? 'array-contains' : '==', value)
  ));
  for (const col of ['tournaments', 'tournaments_summary']) {
    const checkList = async (label, promise) => {
      try { return await assertSucceeds(promise); }
      catch (error) { throw new Error(col + ': consulta recusada: ' + label, { cause: error }); }
    };
    const memberList = await checkList('inscrito', list(member, col, 'memberUids', member));
    if (memberList.docs.some(d => d.id === 'hidden')) throw new Error(col + ': modo oculto vazou na lista do inscrito');
    const orgList = await checkList('organizador', list(org, col, 'memberUids', org));
    if (!orgList.docs.some(d => d.id === 'hidden')) throw new Error(col + ': organizador não recebeu o torneio oculto');
    const refereeList = await checkList('árbitro confirmado', list(referee, col, 'refereeUids', referee));
    if (!refereeList.docs.some(d => d.id === 'hidden') || !refereeList.docs.some(d => d.id === 'members')) throw new Error(col + ': escala de arbitragem incorreta');
    const invitedList = await checkList('árbitro convidado', list(invited, col, 'refereeUids', invited));
    const removedList = await checkList('árbitro removido', list(removed, col, 'refereeUids', removed));
    if (!invitedList.empty || !removedList.empty) throw new Error(col + ': convite ou remoção concedeu leitura');
    const publicList = await checkList('público', list(null, col, 'isPublic', true));
    if (!publicList.docs.some(d => d.id === 'public')) throw new Error(col + ': torneio geral ausente');
    // Mesmo formato das consultas de loadAllTournaments/loadOpenTournaments.
    const discovered = await checkList('descoberta autenticada', list(stranger, col, 'isPublic', true));
    if (discovered.docs.some(d => d.id === 'hidden')) throw new Error(col + ': descoberta expôs torneio oculto');
    await assertFails(list(stranger, col, 'isPublic', false));
    await assertFails(list(stranger, col, 'creatorUid', org));
    const legacyCreated = await checkList('criador legado', list('uid_legacy_creator', col, 'creatorUid', 'uid_legacy_creator'));
    if (!legacyCreated.docs.some(d => d.id === 'legacy_creator')) throw new Error(col + ': criador legado perdeu o próprio torneio');
  }
  // Mesmo formato da contagem de privados em todos-torneios: só os vinculados.
  const ownPrivate = await assertSucceeds(list(member, 'tournaments_summary', 'memberUids', member));
  if (ownPrivate.docs.filter(d => d.data().isPublic === false).map(d => d.id).join(',') !== 'members') {
    throw new Error('contagem de privados do inscrito não deve incluir torneio oculto');
  }
  // O espelho de torneio oculto não indexa jogadores; o histórico continua
  // funcionando para outros torneios sem revelar o sorteio no app antigo.
  const memberDb = env.authenticatedContext(member).firestore();
  const history = await assertSucceeds(getDocs(query(collectionGroup(memberDb, 'results'), where('playerUids', 'array-contains', member))));
  if (history.docs.some(d => d.ref.parent.parent.id === 'hidden')) throw new Error('histórico vazou o sorteio oculto');
  console.log('✅ visibilidade do torneio: geral, inscritos e organizadores');
} finally {
  await env.cleanup();
}
