import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collectionGroup, doc, documentId, getDoc, getDocs, orderBy, query, setDoc, where } from 'firebase/firestore';

const require = createRequire(import.meta.url);
const { canReadTournamentData } = require('../../functions/result-history-visibility-core.js');
const [host, port] = String(process.env.FIRESTORE_EMULATOR_HOST || '').split(':');
assert.equal(host, '127.0.0.1');
assert.equal(Number(port), 8134);
const env = await initializeTestEnvironment({ projectId: 'demo-scoreplace',
  firestore: { rules: readFileSync(process.env.SP_RESULT_PARITY_RULES, 'utf8'),
    host, port: Number(port) } });

const rows = [
  { id: 'public', data: { isPublic: true } },
  { id: 'logged', data: { isPublic: false } },
  { id: 'members', data: { membersOnly: true, memberUids: ['member'] } },
  { id: 'organizers', data: { organizerOnly: true, memberUids: ['member'] } },
  { id: 'sandbox', data: { isSandbox: true, memberUids: ['member'] } },
  { id: 'organizers_ref', data: { organizerOnly: true, refereeUids: ['referee'] } }
].map(row => ({ ...row, data: { creatorUid: 'owner', adminUids: ['cohost'],
  refereeUids: ['referee'], memberUids: [], isPublic: false,
  organizerOnly: false, membersOnly: false, isSandbox: false, ...row.data } }));
const callers = [null, 'owner', 'cohost', 'member', 'referee', 'stranger'];
try {
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const row of rows) {
      await setDoc(doc(db, 'tournaments', row.id), row.data);
      await setDoc(doc(db, 'tournaments', row.id, 'results', 'm1'), {
        matchId: 'm1', playerUids: callers.filter(Boolean)
      });
    }
    const byPath = await getDocs(query(collectionGroup(db, 'results'),
      where('playerUids', 'array-contains', 'member'), orderBy(documentId())));
    assert.equal(byPath.size, rows.length,
      'cursor por caminho deve preservar docs sem updatedAt');
  });
  for (const row of rows) for (const caller of callers) {
    const db = caller === null ? env.unauthenticatedContext().firestore()
      : env.authenticatedContext(caller).firestore();
    const promise = getDoc(doc(db, 'tournaments', row.id, 'results', 'm1'));
    const expected = canReadTournamentData(row.data, caller);
    if (expected) await assertSucceeds(promise);
    else {
      const error = await assertFails(promise);
      assert.equal(error.code, 'permission-denied');
    }
  }
  assert.equal(canReadTournamentData(null, 'owner'), false);
  console.log('PARIDADE: OK (' + (rows.length * callers.length) + ' combinações)');
} finally {
  await env.cleanup();
}
