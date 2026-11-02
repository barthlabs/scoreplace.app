'use strict';

// A transação E08 só acrescenta _phaseIndex. Toda outra parte é lida para CAS.
const split = require('../js/views/tournament-split-core.js');
const auditor = require('./auditar-indice-fases-core.js');
const planner = require('./planejar-indice-canonico-e08-core.js');
const { stable } = require('./backup-torneio-operacional-core.js');

function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function stamp(value) {
  if (value && Number.isInteger(value.seconds) && Number.isInteger(value.nanoseconds)) {
    return [value.seconds, value.nanoseconds];
  }
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(String(value || ''));
  if (!match) throw new Error('[E08] updateTime inválido');
  return [Date.parse(match[1] + 'Z') / 1000, Number((match[2] || '').padEnd(9, '0'))];
}
function sameStamp(a, b) { return same(stamp(a), stamp(b)); }
function idFromPath(path) { return String(path || '').split('/').pop(); }
function sortedNames(collections) { return Object.keys(collections).sort(); }

function validatePlan(plan) {
  if (!plan || plan.eligible !== true || !/^[a-f0-9]{64}$/i.test(plan.digest || '') ||
      !Array.isArray(plan.targets) || !plan.targets.length ||
      !plan.readSet || !Array.isArray(plan.readSet.matches) ||
      !Array.isArray(plan.readSet.extras) || !Array.isArray(plan.readSet.extraCollections) ||
      !String(plan.root || '').includes('/documents/tournaments/')) {
    throw new Error('[E08] plano inelegível ou incompleto');
  }
  if (plan.targets.length > 400) throw new Error('[E08] lote supera 400 atualizações');
  if (planner.digestPlan(plan) !== plan.digest) throw new Error('[E08] digest do plano divergiu');
  const paths = plan.targets.map(item => item.path);
  if (new Set(paths).size !== paths.length ||
      plan.targets.some(item => !plan.readSet.matches.some(doc => doc.path === item.path) ||
        !Number.isSafeInteger(item.phase) || item.phase < 0)) {
    throw new Error('[E08] alvos inconsistentes');
  }
  return idFromPath(plan.root);
}

function verifyPreflight(ref, plan, root, collections) {
  validatePlan(plan);
  if (!root.exists || root.ref.path !== 'tournaments/' + idFromPath(plan.root) ||
      !sameStamp(root.updateTime, plan.rootUpdateTime)) throw new Error('[E08] raiz mudou');
  const expectedCollections = [...new Set(['matches', ...plan.readSet.extraCollections])].sort();
  for (const name of expectedCollections) {
    if (!Object.hasOwn(collections, name)) throw new Error('[E08] parte da montagem ausente');
  }
  const proof = plan.readSet.matches.concat(plan.readSet.extras);
  const actual = [];
  for (const name of expectedCollections) {
    for (const doc of collections[name]) {
      actual.push({ path: 'projects/scoreplace-app/databases/(default)/documents/' + doc.ref.path,
        updateTime: doc.updateTime });
    }
  }
  if (actual.length !== proof.length) throw new Error('[E08] conjunto de leitura mudou');
  const byPath = new Map(actual.map(item => [item.path, item]));
  if (byPath.size !== actual.length || proof.some(item =>
    !byPath.has(item.path) || !sameStamp(byPath.get(item.path).updateTime, item.updateTime))) {
    throw new Error('[E08] versão de jogo ou parte mudou');
  }
  const matches = new Map(collections.matches.map(doc => [doc.id, doc]));
  if (matches.size !== collections.matches.length || matches.size !== plan.matchCount) {
    throw new Error('[E08] contagem de jogos mudou');
  }
  for (const target of plan.targets) {
    const doc = matches.get(idFromPath(target.path));
    if (!doc || auditor.classify(doc.data()) !== 'ausente' ||
        split.faseIndexavel(doc.data().jogo, doc.data()._loc) !== target.phase) {
      throw new Error('[E08] fase deixou de ser comprovável');
    }
  }
  return true;
}

function footprint(root, collections) {
  return Buffer.byteLength(JSON.stringify({ root: stable(root.data()),
    collections: Object.fromEntries(sortedNames(collections).map(name =>
      [name, collections[name].map(doc => ({ id: doc.id, data: stable(doc.data()) }))])) }), 'utf8');
}

async function applyPlan(db, ref, plan, before) {
  validatePlan(plan);
  verifyPreflight(ref, plan, before.root, before.collections);
  if (footprint(before.root, before.collections) > 4 * 1024 * 1024) {
    throw new Error('[E08] conjunto relevante supera 4 MiB');
  }
  return db.runTransaction(async tx => {
    const root = await tx.get(ref);
    const collections = {};
    for (const name of sortedNames(before.collections)) {
      collections[name] = (await tx.get(ref.collection(name))).docs;
    }
    verifyPreflight(ref, plan, root, collections);
    if (!same(root.data(), before.root.data())) throw new Error('[E08] raiz divergiu do backup');
    for (const name of sortedNames(collections)) {
      const current = collections[name], original = before.collections[name];
      if (current.length !== original.length) throw new Error('[E08] subcoleção mudou');
      const byId = new Map(original.map(doc => [doc.id, doc]));
      for (const doc of current) {
        const old = byId.get(doc.id);
        if (!old || !sameStamp(doc.updateTime, old.updateTime) || !same(doc.data(), old.data())) {
          throw new Error('[E08] CAS de parte falhou');
        }
      }
    }
    for (const target of plan.targets) {
      const doc = collections.matches.find(item => item.id === idFromPath(target.path));
      tx.update(doc.ref, { _phaseIndex: target.phase }, { lastUpdateTime: doc.updateTime });
    }
    return plan.targets.length;
  }, { maxAttempts: 1 });
}

async function auditPlan(ref, plan, before) {
  const root = await ref.get();
  if (!same(root.data(), before.root.data()) || !sameStamp(root.updateTime, before.root.updateTime)) {
    throw new Error('[E08] pós-auditoria: raiz mudou');
  }
  const names = (await ref.listCollections()).map(item => item.id).sort();
  if (!same(names, before.physicalCollectionNames)) throw new Error('[E08] pós-auditoria: coleções mudaram');
  const targets = new Map(plan.targets.map(item => [idFromPath(item.path), item.phase]));
  for (const name of names) {
    const docs = (await ref.collection(name).get()).docs;
    const old = new Map((before.collections[name] || []).map(item => [item.id, item]));
    if (docs.length !== old.size) throw new Error('[E08] pós-auditoria: contagem mudou');
    for (const doc of docs) {
      const previous = old.get(doc.id);
      const expected = previous && name === 'matches' && targets.has(doc.id)
        ? { ...previous.data(), _phaseIndex: targets.get(doc.id) }
        : previous && previous.data();
      if (!expected || !same(doc.data(), expected) ||
          (name !== 'matches' || !targets.has(doc.id)) && !sameStamp(doc.updateTime, previous.updateTime)) {
        throw new Error('[E08] pós-auditoria: documento divergiu em ' + name);
      }
    }
  }
  return true;
}

module.exports = { same, stamp, sameStamp, validatePlan, verifyPreflight, footprint, applyPlan, auditPlan };
