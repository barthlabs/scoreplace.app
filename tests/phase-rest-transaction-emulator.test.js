'use strict';

// Prova anterior à integração: REST + regras reais + snapshot transacional.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rodarNoEmulador } = require('./emulador');

const ROOT = path.join(__dirname, '..');
const PROJECT = 'demo-scoreplace';
const PORT = 8219;

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-phase-rest-'));
  const config = path.join(dir, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(ROOT, 'firestore.rules') },
    emulators: { firestore: { host: '127.0.0.1', port: PORT }, ui: { enabled: false }, singleProjectMode: true }
  }));
  try {
    const javaBin = [process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin'),
      '/opt/homebrew/opt/openjdk/bin'].find((dir) => dir && fs.existsSync(path.join(dir, 'java')));
    const output = rodarNoEmulador([
      'emulators:exec', '--only', 'firestore', '--config', config, '--project', PROJECT,
      'node tests/phase-rest-transaction-emulator.test.js'
    ], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, {
        PATH: javaBin ? javaBin + path.delimiter + process.env.PATH : process.env.PATH
      })
    });
    assert.match(output, /phase REST transaction: OK/);
    const timing = output.match(/phase REST selective emulator: (\d+) ms \(begin \+ root \+ 3 counts \+ phase query\)/);
    assert.ok(timing, 'medição da sequência seletiva ausente');
    assert.match(output, /phase preview emulator: 30 full games, 10 phase games, 3 aggregations, 1 root/,
      'medição 30/10 da E10 ausente');
    console.log(timing[0]);
    console.log('phase preview emulator: 30 full games, 10 phase games, 3 aggregations, 1 root');
    console.log('phase REST transaction: OK');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
} else {
  const host = String(process.env.FIRESTORE_EMULATOR_HOST);
  assert.match(host, /^127\.0\.0\.1:\d+$/);
  const base = 'http://' + host + '/v1/projects/' + PROJECT + '/databases/(default)';
  const docs = base + '/documents';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = (uid) => encoded({ alg: 'none', typ: 'JWT' }) + '.' + encoded({
    iss: 'https://securetoken.google.com/' + PROJECT, aud: PROJECT, sub: uid, user_id: uid,
    iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600,
    firebase: { identities: {}, sign_in_provider: 'google.com' }
  }) + '.';
  const request = async (method, url, uid, body) => {
    const headers = { 'Content-Type': 'application/json' };
    if (uid) headers.Authorization = uid === 'owner' ? 'Bearer owner' : 'Bearer ' + token(uid);
    let response;
    try {
      response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch (error) {
      throw new Error('requisição emulada não respondeu: ' + method + ' ' + url.replace(base, ''), { cause: error });
    }
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  };
  const str = (value) => ({ stringValue: value });
  const int = (value) => ({ integerValue: String(value) });
  const root = (id) => docs + '/tournaments/' + id;
  const match = (id, game) => root(id) + '/matches/' + game;
  const countQuery = (indexed, transaction) => ({
    transaction,
    structuredAggregationQuery: {
      structuredQuery: {
        from: [{ collectionId: 'matches' }],
        ...(indexed ? { where: { fieldFilter: {
          field: { fieldPath: '_phaseIndex' }, op: 'GREATER_THAN_OR_EQUAL', value: int(0)
        } } } : {})
      },
      aggregations: [{ alias: 'n', count: {} }]
    }
  });
  const boundedCountQuery = (transaction) => ({
    transaction,
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'matches' }], where: { fieldFilter: {
        field: { fieldPath: '_phaseIndex' }, op: 'IN',
        value: { arrayValue: { values: Array.from({ length: 30 }, (_, n) => int(n)) } }
      } } },
      aggregations: [{ alias: 'n', count: {} }]
    }
  });
  const phaseQuery = (transaction) => ({
    transaction,
    structuredQuery: {
      from: [{ collectionId: 'matches' }],
      where: { fieldFilter: { field: { fieldPath: '_phaseIndex' }, op: 'EQUAL', value: int(1) } }
    }
  });
  (async () => {
    const publicRoot = { fields: {
      creatorUid: str('org'), isPublic: { booleanValue: true },
      _nPartes: { mapValue: { fields: { matches: int(2) } } }
    } };
    const privateRoot = { fields: {
      creatorUid: str('org'), isPublic: { booleanValue: false }, organizerOnly: { booleanValue: true },
      _nPartes: { mapValue: { fields: { matches: int(1) } } }
    } };
    for (const [url, body] of [
      [root('public'), publicRoot], [root('private'), privateRoot],
      [root('other'), publicRoot],
      [match('public', 'm0'), { fields: { _phaseIndex: int(0), jogo: { mapValue: { fields: { id: str('m0') } } } } }],
      [match('public', 'm1'), { fields: { _phaseIndex: int(1), jogo: { mapValue: { fields: { id: str('m1') } } } } }],
      [match('other', 'foreign'), { fields: { _phaseIndex: int(1) } }],
      [match('private', 'm0'), { fields: { _phaseIndex: int(0) } }]
    ]) {
      const write = await request('PATCH', url, 'owner', body);
      assert.equal(write.status, 200, 'fixture recusada');
    }
    const begin = await request('POST', docs + ':beginTransaction', null, { options: { readOnly: {} } });
    assert.equal(begin.status, 200, 'transação anônima recusada');
    const tx = begin.data && begin.data.transaction;
    assert.ok(tx, 'transação sem token');
    const parent = root('public');
    const publicName = 'projects/' + PROJECT + '/databases/(default)/documents/tournaments/public';
    const rootInTx = await request('POST', docs + ':batchGet', null,
      { documents: [publicName], transaction: tx });
    assert.equal(rootInTx.status, 200, 'batchGet da raiz no mesmo snapshot recusado: ' + JSON.stringify(rootInTx.data));
    assert.equal(rootInTx.data[0].found.name, publicName);
    const total = await request('POST', parent + ':runAggregationQuery', null, countQuery(false, tx));
    assert.equal(total.status, 200, 'agregação total recusada');
    assert.equal(Number(total.data[0].result.aggregateFields.n.integerValue), 2);
    // A raiz também deve ficar presa ao mesmo snapshot, não só as contagens.
    assert.equal((await request('PATCH', parent + '?updateMask.fieldPaths=snapshotProbe', 'owner',
      { fields: { snapshotProbe: str('new') } })).status, 200);
    const rootAgain = await request('POST', docs + ':batchGet', null,
      { documents: [publicName], transaction: tx });
    assert.equal(rootAgain.status, 200);
    assert.equal(rootAgain.data[0].found.fields.snapshotProbe, undefined,
      'batchGet transacional não pode ver alteração posterior da raiz');
    const rootFresh = await request('GET', parent, null);
    assert.equal(rootFresh.status, 200);
    assert.equal(rootFresh.data.fields.snapshotProbe.stringValue, 'new');
    // Inserção depois da primeira contagem: as próximas leituras devem manter o snapshot.
    assert.equal((await request('PATCH', match('public', 'late'), 'owner', { fields: { jogo: { mapValue: { fields: { id: str('late') } } } } })).status, 200);
    const indexed = await request('POST', parent + ':runAggregationQuery', null, countQuery(true, tx));
    assert.equal(indexed.status, 200, 'agregação indexada recusada');
    assert.equal(Number(indexed.data[0].result.aggregateFields.n.integerValue), 2);
    const phase = await request('POST', parent + ':runQuery', null, phaseQuery(tx));
    assert.equal(phase.status, 200, 'consulta de fase recusada');
    assert.deepEqual(phase.data.filter((row) => row.document).map((row) => row.document.name.split('/').pop()), ['m1']);
    const fresh = await request('POST', parent + ':runAggregationQuery', null, countQuery(false, undefined));
    assert.equal(fresh.status, 200);
    assert.equal(Number(fresh.data[0].result.aggregateFields.n.integerValue), 3);
    const other = await request('POST', root('other') + ':runAggregationQuery', null, countQuery(false, undefined));
    assert.equal(other.status, 200);
    assert.equal(Number(other.data[0].result.aggregateFields.n.integerValue), 1, 'outro torneio não deve entrar no total');
    const cases = [
      ['fraction', { doubleValue: 1.5 }, 0], ['negative', int(-1), 0],
      ['string', str('1'), 0], ['high', int(30), 0],
      ['missing', null, 0], ['one-point-zero', { doubleValue: 1 }, 1]
    ];
    for (const [name, value, expected] of cases) {
      assert.equal((await request('PATCH', root('probe-' + name), 'owner', publicRoot)).status, 200);
      const fields = value ? { _phaseIndex: value } : { jogo: { mapValue: { fields: { id: str(name) } } } };
      assert.equal((await request('PATCH', match('probe-' + name, 'm'), 'owner', { fields })).status, 200);
      const counted = await request('POST', root('probe-' + name) + ':runAggregationQuery', null,
        boundedCountQuery(undefined));
      assert.equal(counted.status, 200, 'IN de 30 valores recusado: ' + name);
      assert.equal(Number(counted.data[0].result.aggregateFields.n.integerValue), expected,
        'IN não filtrou corretamente: ' + name);
    }
    // Caminho normal de escrita do backend: o mesmo planWrites/applyPlan usado por
    // _gravaTorneio, executado numa transação real contra o Firestore emulado.
    const admin = require('../functions-autodraw/node_modules/firebase-admin');
    const writePlan = require('../functions-autodraw/write-plan');
    const split = require('../functions-autodraw/vendor/tournament-split-core');
    const app = admin.initializeApp({ projectId: PROJECT }, 'phase-write-plan-test');
    try {
      const db = app.firestore();
      const ref = db.collection('tournaments').doc('writer-plan');
      const source = { id: 'writer-plan', creatorUid: 'org', isPublic: true,
        phases: [{ name: 'Fase 1' }, { name: 'Fase 2' }, { name: 'Fase 3' }],
        currentPhaseIndex: 1,
        matches: [{ id: 'created', phaseIndex: 1, p1: 'A', p2: 'B' }] };
      const planFor = (before, after, options = {}) => writePlan.planWrites(before, after, {
        split, boundary: (tournament) => ({ persist: tournament }),
        agoraIso: '2026-10-31T00:00:00.000Z', ...options
      });
      const created = planFor(null, source);
      const createdMatch = created.ops.find((op) => op.colecao === 'matches' && op.tipo === 'set');
      assert.equal(createdMatch.doc._phaseIndex, 1, 'planejador gera índice na criação');
      await db.runTransaction(async (tx) => writePlan.applyPlan(tx, ref, created,
        { FieldValue: admin.firestore.FieldValue }));
      let snap = await ref.collection('matches').doc(createdMatch.chave).get();
      assert.equal(snap.data()._phaseIndex, 1, 'executor persistiu índice de fase');
      const edited = JSON.parse(JSON.stringify(source));
      edited.matches[0].scoreP1 = 6;
      const changed = planFor(source, edited);
      const changedMatch = changed.ops.find((op) => op.colecao === 'matches' && op.tipo === 'set');
      assert.equal(changedMatch.doc._phaseIndex, 1, 'edição conserva índice no plano');
      await db.runTransaction(async (tx) => writePlan.applyPlan(tx, ref, changed,
        { FieldValue: admin.firestore.FieldValue }));
      snap = await ref.collection('matches').doc(changedMatch.chave).get();
      assert.equal(snap.data()._phaseIndex, 1, 'edição conserva índice persistido');
      assert.equal(snap.data().jogo.scoreP1, 6);
      const expanded = JSON.parse(JSON.stringify(edited));
      expanded.matches.push({ id: 'added', phaseIndex: 1, p1: 'C', p2: 'D' });
      const addition = planFor(edited, expanded, { phaseReadProof: true });
      await db.runTransaction(async (tx) => writePlan.applyPlan(tx, ref, addition,
        { FieldValue: admin.firestore.FieldValue }));
      const certified = (await ref.get()).data()._phaseReadCertificate;
      assert.equal(certified.count, 2, 'adição e atestado devem confirmar juntos');
      assert.equal((await ref.collection('matches').get()).size, 2);
      const removal = planFor(expanded, edited, { phaseReadProof: true });
      await assert.rejects(() => db.runTransaction(async (tx) => {
        await writePlan.applyPlan(tx, ref, removal,
          { FieldValue: admin.firestore.FieldValue });
        throw new Error('rollback intencional');
      }), /rollback intencional/);
      assert.equal((await ref.collection('matches').get()).size, 2,
        'rollback não pode remover só o jogo');
      assert.deepEqual((await ref.get()).data()._phaseReadCertificate, certified,
        'rollback não pode alterar só o atestado');
      await db.runTransaction(async (tx) => writePlan.applyPlan(tx, ref, removal,
        { FieldValue: admin.firestore.FieldValue }));
      assert.equal((await ref.collection('matches').get()).size, 1);
      const afterRemovalCertificate = (await ref.get()).data()._phaseReadCertificate;
      assert.equal(afterRemovalCertificate.count, 1, 'remoção e atestado devem confirmar juntos');
      assert.notEqual(afterRemovalCertificate.digest, certified.digest);
      // Dois escritores começam com a mesma fotografia. O conflito na raiz
      // deve refazer um deles com a lista física atual, não gravar atestado
      // calculado sobre o conjunto antigo e perder uma das alterações.
      let releaseFirstReads;
      const bothRead = new Promise((resolve) => { releaseFirstReads = resolve; });
      let reads = 0;
      const competingWrite = (mutate) => db.runTransaction(async (tx) => {
        const rootBefore = await tx.get(ref);
        const gamesBefore = await tx.get(ref.collection('matches'));
        const before = {
          ...rootBefore.data(),
          matches: gamesBefore.docs.map((doc) => doc.data().jogo)
        };
        reads++;
        if (reads === 2) releaseFirstReads();
        if (reads <= 2) {
          let timer;
          try {
            await Promise.race([bothRead, new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('segundo escritor não iniciou')), 5000);
            })]);
          } finally { clearTimeout(timer); }
        }
        const after = JSON.parse(JSON.stringify(before));
        mutate(after.matches);
        const plan = planFor(before, after, { phaseReadProof: true });
        writePlan.applyPlan(tx, ref, plan, { FieldValue: admin.firestore.FieldValue });
      });
      await Promise.all([
        competingWrite((games) => games.push({ id: 'parallel-added', phaseIndex: 1, p1: 'E', p2: 'F' })),
        competingWrite((games) => { games.find((game) => game.id === 'created').scoreP1 = 9; })
      ]);
      assert(reads >= 3, 'um escritor deve refazer a transação após o conflito');
      const physical = (await ref.collection('matches').get()).docs.map((doc) => doc.data());
      assert.equal(physical.length, 2, 'adição concorrente não pode ser perdida');
      assert.equal(physical.find((record) => record.jogo.id === 'created').jogo.scoreP1, 9,
        'placar concorrente não pode ser perdido');
      const actualCertificate = require('../functions-autodraw/vendor/phase-index-certificate-core').build(physical, split);
      assert.deepEqual((await ref.get()).data()._phaseReadCertificate, actualCertificate,
        'atestado deve corresponder aos envelopes físicos depois da concorrência');
    } finally {
      await app.delete();
    }
    // Medição local da sequência seletiva completa no emulador. Não é SLA de
    // produção nem inclui renderização, App Check ou eventual fallback integral.
    const selectedAt = Date.now();
    const selectedBegin = await request('POST', docs + ':beginTransaction', null,
      { options: { readOnly: {} } });
    assert.equal(selectedBegin.status, 200);
    const selectedTx = selectedBegin.data.transaction;
    const selectedParent = root('writer-plan');
    const selectedName = 'projects/' + PROJECT + '/databases/(default)/documents/tournaments/writer-plan';
    const selectedRoot = await request('POST', docs + ':batchGet', null,
      { documents: [selectedName], transaction: selectedTx });
    const selectedTotal = await request('POST', selectedParent + ':runAggregationQuery', null,
      countQuery(false, selectedTx));
    const selectedIndexed = await request('POST', selectedParent + ':runAggregationQuery', null,
      boundedCountQuery(selectedTx));
    const selectedPhaseCount = await request('POST', selectedParent + ':runAggregationQuery', null, {
      transaction: selectedTx,
      structuredAggregationQuery: {
        structuredQuery: phaseQuery(selectedTx).structuredQuery,
        aggregations: [{ alias: 'n', count: {} }]
      }
    });
    const selectedGames = await request('POST', selectedParent + ':runQuery', null,
      phaseQuery(selectedTx));
    assert([selectedRoot, selectedTotal, selectedIndexed, selectedPhaseCount, selectedGames]
      .every((result) => result.status === 200), 'sequência seletiva incompleta');
    assert.equal(selectedRoot.data[0].found.name, selectedName);
    assert.equal(Number(selectedTotal.data[0].result.aggregateFields.n.integerValue), 2);
    assert.equal(Number(selectedIndexed.data[0].result.aggregateFields.n.integerValue), 2);
    assert.equal(Number(selectedPhaseCount.data[0].result.aggregateFields.n.integerValue), 2);
    assert.equal(selectedGames.data.filter((row) => row.document).length, 2);
    const selectedMs = Date.now() - selectedAt;
    assert.equal((await request('POST', docs + ':rollback', null,
      { transaction: selectedTx })).status, 200);
    console.log('phase REST selective emulator: ' + selectedMs + ' ms (begin + root + 3 counts + phase query)');
    // Exercita a porta real do cliente contra o REST do emulador, incluindo
    // field() (integerValue em string) e digest do escritor Admin SDK.
    const vm = require('node:vm');
    let browserUid = null;
    const phaseTransferred = [];
    let bulkAggregations = 0;
    let bulkRoots = 0;
    const browser = { _phaseGamesRead: require('../js/views/phase-games-read-core'),
      _tSplit: split,
      firebase: { app: () => ({ options: { projectId: PROJECT } }),
        auth: () => ({ currentUser: browserUid
          ? { getIdToken: async () => token(browserUid) } : null }) } };
    const localFetch = async (url, options) => {
      if (url.includes('/phase-bulk:runAggregationQuery')) bulkAggregations++;
      if (url.endsWith(':batchGet') && options.body.includes('tournaments/phase-bulk')) bulkRoots++;
      const result = await fetch(url.replace('https://firestore.googleapis.com',
        'http://' + host), options);
      if (url.endsWith(':runQuery') && result.ok) {
        const rows = await result.clone().json();
        phaseTransferred.push(Array.isArray(rows) ? rows.filter((row) => row.document).length : 0);
      }
      return result;
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8'),
      { window: browser, fetch: localFetch, AbortController, setTimeout, clearTimeout });
    const client = browser.FirestoreDB;
    client.db = {};
    client._ehSandbox = () => false;
    client.loadTournamentById = async () => ({ full: true });
    const selective = await client.loadTournamentPhaseGames('writer-plan', 1);
    assert.equal(selective.mode, 'partial', 'atestado v2 fresco deve habilitar leitura seletiva');
    assert.equal(selective.games.length, 2);
    const selectedCurrent = await client.loadTournamentPhaseGames('writer-plan', 'current');
    assert.equal(selectedCurrent.mode, 'partial', 'fase atual deve vir da mesma raiz');
    assert.equal(selectedCurrent.phaseIndex, 1);
    assert.equal(selectedCurrent.games.length, 2);
    const bulkApp = admin.initializeApp({ projectId: PROJECT }, 'phase-bulk-test');
    const dbBulk = bulkApp.firestore();
    const bulk = { id: 'phase-bulk', creatorUid: 'org', isPublic: true,
      phases: [{ name: 'Grupos' }, { name: 'Semi' }, { name: 'Final' }],
      currentPhaseIndex: 2,
      matches: Array.from({ length: 30 }, (_, n) => ({
        id: 'bulk-' + n, phaseIndex: Math.floor(n / 10), p1: 'A', p2: 'B'
      })) };
    const bulkPlan = writePlan.planWrites(null, bulk, {
      split, boundary: (tournament) => ({ persist: tournament }),
      agoraIso: '2026-10-31T00:00:00.000Z', phaseReadProof: true
    });
    await dbBulk.runTransaction(async (tx) => writePlan.applyPlan(tx,
      dbBulk.collection('tournaments').doc(bulk.id), bulkPlan,
      { FieldValue: admin.firestore.FieldValue }));
    const fullGameCount = (await dbBulk.collection('tournaments').doc(bulk.id)
      .collection('matches').get()).size;
    assert.equal(fullGameCount, 30, 'leitor integral recebe 30 jogos');
    browserUid = 'stranger';
    const transferredBefore = phaseTransferred.length;
    const bulkCurrent = await client.loadTournamentPhaseGames(bulk.id, 'current',
      { skipFullFallback: true });
    assert.equal(bulkCurrent.mode, 'partial');
    assert.equal(bulkCurrent.phaseIndex, 2);
    assert.equal(bulkCurrent.games.length, 10);
    assert.deepEqual(phaseTransferred.slice(transferredBefore), [10],
      'prévia transfere 10 documentos de jogo, mais raiz e três agregações');
    assert.equal(bulkAggregations, 3);
    assert.equal(bulkRoots, 1);
    console.log('phase preview emulator: ' + fullGameCount + ' full games, ' +
      bulkCurrent.games.length + ' phase games, ' + bulkAggregations +
      ' aggregations, ' + bulkRoots + ' root');
    const restricted = { ...bulk, id: 'phase-restricted', isPublic: false,
      organizerOnly: true };
    const restrictedPlan = writePlan.planWrites(null, restricted, {
      split, boundary: (tournament) => ({ persist: tournament }),
      agoraIso: '2026-10-31T00:00:00.000Z', phaseReadProof: true
    });
    await dbBulk.runTransaction(async (tx) => writePlan.applyPlan(tx,
      dbBulk.collection('tournaments').doc(restricted.id), restrictedPlan,
      { FieldValue: admin.firestore.FieldValue }));
    assert.equal((await client.loadTournamentPhaseGames(restricted.id, 'current',
      { skipFullFallback: true })).mode, 'fullFallback', 'estranho não lê organizerOnly');
    browserUid = 'org';
    assert.equal((await client.loadTournamentPhaseGames(restricted.id, 'current',
      { skipFullFallback: true })).mode, 'partial', 'organizador pode ler sua prévia');
    browserUid = null;
    await bulkApp.delete();
    const staleApp = admin.initializeApp({ projectId: PROJECT }, 'phase-stale-certificate-test');
    try {
      const gameRef = staleApp.firestore().collection('tournaments').doc('writer-plan')
        .collection('matches').doc('created');
      await gameRef.update({ _phaseIndex: 2, 'jogo.phaseIndex': 2 });
      const stale = await client.loadTournamentPhaseGames('writer-plan', 1);
      assert.equal(stale.mode, 'fullFallback',
        'troca de fase com a mesma contagem e atestado antigo deve recuar');
      assert.equal(stale.readOnly, true);
      assert.equal(stale.tournament.full, true);
    } finally { await staleApp.delete(); }
    const deniedRoot = await request('GET', root('private'), 'stranger');
    const deniedCount = await request('POST', root('private') + ':runAggregationQuery', 'stranger', countQuery(false, undefined));
    const deniedPhase = await request('POST', root('private') + ':runQuery', 'stranger', phaseQuery(undefined));
    assert.equal(deniedRoot.status, 403);
    assert.equal(deniedCount.status, 403);
    assert.equal(deniedPhase.status, 403);
    const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
    const { collection, getDocs } = require('firebase/firestore');
    const env = await initializeTestEnvironment({
      projectId: PROJECT,
      firestore: { host: '127.0.0.1', port: Number(host.split(':')[1]) }
    });
    try {
      await assert.rejects(() => getDocs(collection(env.authenticatedContext('stranger').firestore(), 'tournaments', 'private', 'matches')));
      const publicDocs = await getDocs(collection(env.unauthenticatedContext().firestore(), 'tournaments', 'public', 'matches'));
      assert.equal(publicDocs.size, 3);
    } finally {
      await env.cleanup();
    }
    console.log('phase REST transaction: OK');
  })().catch((error) => { console.error(error); process.exitCode = 1; });
}
