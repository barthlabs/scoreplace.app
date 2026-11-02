'use strict';

const crypto = require('node:crypto');
const split = require('../functions/vendor/tournament-split-core.js');
const translator = require('./traduzir-resultado-pareado-e05-core.js');
const { stable } = require('./backup-torneio-operacional-core.js');

const MAX_READS = 1000;
const MAX_PAIRS = 100;
const MAX_BYTES = 4 * 1024 * 1024;
const PROJECT = 'scoreplace-app';
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const hash = value => crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const version = doc => stable(doc.updateTime);
const validId = id => /^[A-Za-z0-9_-]{1,240}$/.test(id) && !id.startsWith('sb_');

function checkSnapshot(snapshot, names = Object.keys(snapshot.collections || {})) {
  if (!snapshot || !snapshot.ref || !snapshot.root || !snapshot.root.exists ||
      !validId(snapshot.root.id) || snapshot.ref.path !== 'tournaments/' + snapshot.root.id ||
      !snapshot.collections || !snapshot.physicalCollectionNames ||
      names.some(name => !Array.isArray(snapshot.collections[name]))) {
    throw new Error('[E05] retrato físico inválido ou sandbox');
  }
  const count = 1 + names.reduce((n, name) => n + snapshot.collections[name].length, 0);
  if (count > MAX_READS) throw new Error('[E05] leitura supera 1000 documentos');
  const bytes = Buffer.byteLength(JSON.stringify({ root: stable(snapshot.root.data()),
    collections: Object.fromEntries(names.map(name => [name, snapshot.collections[name].map(doc =>
      ({ id: doc.id, data: stable(doc.data()) }))])) }), 'utf8');
  if (bytes > MAX_BYTES) throw new Error('[E05] retrato supera 4 MiB');
  return { count, bytes };
}

async function translate(snapshot) {
  const root = snapshot.root.data();
  const loaded = snapshot.collections;
  const readNames = new Set();
  const mounted = await split.montarDoBanco(root, name => {
    readNames.add(name);
    return (loaded[name] || []).map(doc => doc.data());
  });
  const matches = (loaded.matches || []).map(doc => ({ id: doc.id, data: doc.data() }));
  const results = (loaded.results || []).map(doc => ({ id: doc.id, data: doc.data() }));
  return { translated: translator.translateCollection(mounted, matches, results),
    readNames: [...readNames].sort() };
}

async function makePlan(snapshot) {
  const { translated, readNames } = await translate(snapshot);
  const casCollections = [...new Set([...readNames, 'matches', 'results'])].sort();
  const relevant = Object.fromEntries(casCollections.map(name =>
    [name, snapshot.collections[name] || []]));
  const size = checkSnapshot({ ...snapshot, collections: relevant }, casCollections);
  if (translated.report.pairedBlocked) throw new Error('[E05] par pareado bloqueado; revisão necessária');
  const targets = [...translated.proposals.keys()].sort().slice(0, MAX_PAIRS);
  const readSet = { root: { updateTime: version(snapshot.root), hash: hash(snapshot.root.data()) },
    collections: Object.fromEntries(Object.entries(relevant).sort(([a], [b]) => a.localeCompare(b))
      .map(([name, docs]) => [name, docs.map(doc => ({ id: doc.id,
        updateTime: version(doc), hash: hash(doc.data()) })).sort((a, b) => a.id.localeCompare(b.id))])) };
  const plan = { schema: 'scoreplace/e05-pair-plan/1', project: PROJECT,
    tournamentId: snapshot.root.id, collectionNames: snapshot.physicalCollectionNames.slice().sort(),
    casCollections, excludedCollections: snapshot.physicalCollectionNames.filter(name =>
      !casCollections.includes(name)).sort(),
    readSet, targets, counts: { pairs: translated.report.pairedReady,
      orphans: translated.report.orphanResults, reads: size.count, bytes: size.bytes } };
  plan.digest = hash(plan);
  return { plan, translated };
}

function validatePlan(plan) {
  if (!plan || plan.schema !== 'scoreplace/e05-pair-plan/1' || plan.project !== PROJECT ||
      !validId(plan.tournamentId) || !Array.isArray(plan.targets) || !plan.targets.length ||
      plan.targets.length > MAX_PAIRS || new Set(plan.targets).size !== plan.targets.length ||
      !plan.readSet || !plan.readSet.root || !plan.readSet.collections ||
      !Array.isArray(plan.collectionNames) || !Array.isArray(plan.casCollections) ||
      !Array.isArray(plan.excludedCollections) ||
      !same(plan.casCollections, Object.keys(plan.readSet.collections).sort()) ||
      !same(plan.excludedCollections, plan.collectionNames.filter(name =>
        !plan.casCollections.includes(name))) ||
      plan.digest !== hash(Object.fromEntries(Object.entries(plan).filter(([key]) => key !== 'digest')))) {
    throw new Error('[E05] plano pareado inválido');
  }
  return true;
}

function verifyReadSet(snapshot, plan) {
  validatePlan(plan);
  checkSnapshot({ ...snapshot, collections: Object.fromEntries(plan.casCollections.map(name =>
    [name, snapshot.collections[name] || []])) }, plan.casCollections);
  if (snapshot.root.id !== plan.tournamentId ||
      !same(snapshot.physicalCollectionNames.slice().sort(), plan.collectionNames) ||
      !same(version(snapshot.root), plan.readSet.root.updateTime) ||
      hash(snapshot.root.data()) !== plan.readSet.root.hash) throw new Error('[E05] raiz mudou; gere nova prévia');
  for (const name of plan.casCollections) {
    const actual = snapshot.collections[name] || [];
    const expected = plan.readSet.collections[name];
    if (actual.length !== expected.length) throw new Error('[E05] coleção mudou; gere nova prévia');
    const byId = new Map(expected.map(item => [item.id, item]));
    for (const doc of actual) {
      const old = byId.get(doc.id);
      if (!old || !same(version(doc), old.updateTime) || hash(doc.data()) !== old.hash) {
        throw new Error('[E05] documento mudou; gere nova prévia');
      }
    }
  }
  return true;
}

async function applyPlan(db, ref, plan, before, hooks = {}) {
  verifyReadSet(before, plan);
  return db.runTransaction(async tx => {
    const root = await tx.get(ref);
    const names = (await ref.listCollections()).map(col => col.id).sort();
    if (!same(names, plan.collectionNames)) throw new Error('[E05] coleções mudaram; gere nova prévia');
    const collections = {};
    for (const name of plan.casCollections) collections[name] = (await tx.get(ref.collection(name))).docs;
    const current = { ref, root, collections, physicalCollectionNames: names };
    verifyReadSet(current, plan);
    const { translated } = await makePlan(current);
    const currentTargets = [...translated.proposals.keys()].sort().slice(0, MAX_PAIRS);
    if (!same(currentTargets, plan.targets)) throw new Error('[E05] pares mudaram; gere nova prévia');
    if (hooks.beforeWrite) await hooks.beforeWrite(current);
    const matches = new Map(collections.matches.map(doc => [doc.id, doc]));
    const results = new Map(collections.results.map(doc => [doc.id, doc]));
    for (const id of plan.targets) {
      const match = matches.get(id), result = results.get(id);
      if (!match || !result) throw new Error('[E05] par desapareceu');
      tx.update(match.ref, translated.proposals.get(id), { lastUpdateTime: match.updateTime });
      tx.delete(result.ref, { lastUpdateTime: result.updateTime });
    }
    return plan.targets.length;
  }, { maxAttempts: 1 });
}

async function auditPlan(ref, plan, before, expected) {
  const root = await ref.get();
  if (!same(root.data(), before.root.data()) || !same(version(root), version(before.root))) {
    throw new Error('[E05] pós-auditoria: raiz divergiu');
  }
  const targets = new Set(plan.targets);
  const names = (await ref.listCollections()).map(col => col.id).sort();
  const expectedNames = plan.collectionNames.filter(name => name !== 'results' ||
    before.collections.results.length > targets.size);
  if (!same(names, expectedNames)) throw new Error('[E05] pós-auditoria: coleções divergiram');
  for (const name of names) {
    const docs = (await ref.collection(name).get()).docs;
    const original = new Map(before.collections[name].map(doc => [doc.id, doc]));
    const expectedCount = original.size - (name === 'results' ? targets.size : 0);
    if (docs.length !== expectedCount) throw new Error('[E05] pós-auditoria: contagem divergente');
    for (const doc of docs) {
      const old = original.get(doc.id);
      const target = name === 'matches' && targets.has(doc.id);
      if (!old || !same(doc.data(), target ? expected.proposals.get(doc.id) : old.data()) ||
          (!target && !same(version(doc), version(old)))) {
        throw new Error('[E05] pós-auditoria: documento divergente');
      }
    }
  }
  return true;
}

module.exports = { MAX_READS, MAX_PAIRS, MAX_BYTES, same, hash, validId, checkSnapshot,
  translate, makePlan, validatePlan, verifyReadSet, applyPlan, auditPlan };
