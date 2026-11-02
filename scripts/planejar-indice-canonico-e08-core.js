'use strict';

// E08: prévia de fase a partir de matches, com conjunto completo de leitura para CAS.
const crypto = require('node:crypto');
const { stable } = require('./backup-torneio-operacional-core.js');
const split = require('../js/views/tournament-split-core.js');
const roster = require('../functions/match-roster.js');
const auditor = require('./auditar-indice-fases-core.js');

function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function digestPlan(plan) {
  return hash({ root: plan.root, rootUpdateTime: plan.rootUpdateTime,
    rootHash: plan.rootHash, matches: plan.readSet.matches,
    extraCollections: plan.readSet.extraCollections,
    extras: plan.readSet.extras, targets: plan.targets });
}
function validateDoc(doc, prefix) {
  const name = String(doc && doc.name || '');
  if (!name.startsWith(prefix) || !name.slice(prefix.length) ||
      name.slice(prefix.length).includes('/') || !doc.updateTime ||
      !doc.fields || typeof doc.fields !== 'object') throw new Error('snapshot incompleto');
  return name.slice(prefix.length);
}

async function planRoot(root, matches, extras, decode) {
  const rootPrefix = 'projects/scoreplace-app/databases/(default)/documents/tournaments/';
  const id = validateDoc(root, rootPrefix);
  if (!Array.isArray(matches) || !extras || typeof extras !== 'object' || typeof decode !== 'function') {
    throw new Error('coleção incompleta');
  }
  const rootPath = root.name;
  const config = decode(root);
  const byId = new Map();
  for (const doc of matches) {
    const physicalId = validateDoc(doc, rootPath + '/matches/');
    if (byId.has(physicalId)) throw new Error('jogo físico repetido');
    const data = decode(doc);
    if (!data || !data.jogo || !data._loc ||
        String(data._chave || '') !== physicalId || String(data.jogo.id || '') !== physicalId) {
      throw new Error('jogo físico sem identidade/posição');
    }
    byId.set(physicalId, { doc, data });
  }
  const records = [...byId.values()].map(item => item.data);
  const census = auditor.report(config, records);
  const base = { root: root.name, rootUpdateTime: root.updateTime, rootHash: hash(root.fields),
    matchCount: records.length, census, targets: [], reason: null, eligible: false };
  if (!census.backfillCandidate || census.counts.ausente === 0) {
    base.reason = census.backfillCandidate ? 'sem_alvos' : 'cobertura';
    return base;
  }

  const collectionData = { matches: records };
  const extraProof = [];
  for (const [collection, docs] of Object.entries(extras)) {
    if (!Array.isArray(docs) || collection === 'matches' || collection === 'results') {
      throw new Error('subcoleção adicional inválida');
    }
    collectionData[collection] = docs.map(doc => {
      validateDoc(doc, rootPath + '/' + collection + '/');
      extraProof.push({ path: doc.name, updateTime: doc.updateTime, hash: hash(doc.fields) });
      return decode(doc);
    });
  }
  let mounted;
  try {
    mounted = await split.montarDoBanco(config, collection => {
      if (!Object.hasOwn(collectionData, collection)) throw new Error('subcoleção não lida');
      return collectionData[collection];
    });
  } catch (_) { base.reason = 'montagem'; return base; }
  const visible = roster.collectMatches(mounted);
  const visibleById = new Map();
  for (const game of visible) {
    const key = game && game.id != null ? String(game.id) : '';
    if (!key || visibleById.has(key)) { base.reason = 'jogo_duplicado'; return base; }
    visibleById.set(key, game);
  }
  if (visible.length !== records.length) { base.reason = 'montagem_incompleta'; return base; }
  for (const { doc, data } of byId.values()) {
    const phase = split.faseIndexavel(data.jogo, data._loc);
    const logicalId = String(data.jogo.id);
    if (!Number.isSafeInteger(phase) || phase < 0 ||
        roster.canonicalJson(visibleById.get(logicalId)) !== roster.canonicalJson(data.jogo)) {
      base.reason = 'fase_ou_jogo_divergente';
      base.targets = [];
      return base;
    }
    if (auditor.classify(data) === 'ausente') {
      base.targets.push({ path: doc.name, updateTime: doc.updateTime,
        hash: hash(doc.fields), phase });
    }
  }
  base.targets.sort((a, b) => a.path.localeCompare(b.path));
  base.eligible = true;
  base.readSet = {
    matches: matches.map(doc => ({ path: doc.name, updateTime: doc.updateTime,
      hash: hash(doc.fields) })).sort((a, b) => a.path.localeCompare(b.path)),
    extraCollections: Object.keys(extras).sort(),
    extras: extraProof.sort((a, b) => a.path.localeCompare(b.path))
  };
  base.digest = digestPlan(base);
  return base;
}

function aggregate(plans, readTime) {
  if (!Array.isArray(plans) || !/^\d{4}-\d\d-\d\dT/.test(readTime || '')) throw new Error('prévia incompleta');
  const eligible = plans.filter(plan => plan.eligible);
  return { readTime, tournaments: plans.length, eligibleTournaments: eligible.length,
    blockedTournaments: plans.length - eligible.length,
    targetGames: eligible.reduce((sum, plan) => sum + plan.targets.length, 0),
    digest: hash(eligible.map(plan => plan.digest).sort()), applicable: false, productionWrites: 0 };
}

module.exports = { planRoot, aggregate, digestPlan };
