'use strict';

const crypto = require('node:crypto');
const auditor = require('./auditar-indice-fases-core.js');
const split = require('../functions/vendor/tournament-split-core.js');
const mirror = require('../functions/match-result-mirror-core.js');
const roster = require('../functions/match-roster.js');

const MIRROR_FIELDS = Object.freeze(['playerUids', ...roster.RESULT_FIELDS,
  'p1', 'p2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid', 'tournamentName', 'roundLabel']);

function mirrorDifferences(previous, desired) {
  return MIRROR_FIELDS.filter((field) => roster.canonicalJson(previous && previous[field]) !== roster.canonicalJson(desired && desired[field]));
}

function differenceKind(previous, desired, field) {
  const before = previous && previous[field];
  const after = desired && desired[field];
  if (before === undefined) return 'ausente_no_espelho';
  if (after === undefined) return 'ausente_no_jogo';
  return 'valores_diferentes';
}

function validDocument(doc, collection) {
  const name = String(doc && doc.name || '');
  if (!new RegExp('^projects/[^/]+/databases/[^/]+/documents/tournaments/[^/]+/' + collection + '/[^/]+$').test(name)) {
    throw new Error('documento de ' + collection + ' inválido');
  }
  if (!doc.updateTime || !doc.fields || typeof doc.fields !== 'object') {
    throw new Error('documento de ' + collection + ' incompleto');
  }
  return name;
}

function validTournament(doc) {
  const name = String(doc && doc.name || '');
  if (!/^projects\/[^/]+\/databases\/[^/]+\/documents\/tournaments\/[^/]+$/.test(name) ||
      !doc.updateTime || !doc.fields || typeof doc.fields !== 'object') {
    throw new Error('documento de torneio incompleto');
  }
  return name;
}

function stableDigest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function matchesToPlan(tournamentDoc, matchDocs, resultDocs, decode, extraCollections = {}) {
  const tournamentPath = validTournament(tournamentDoc);
  if (!Array.isArray(matchDocs) || !Array.isArray(resultDocs)) throw new Error('coleções incompletas');
  const tournament = decode(tournamentDoc);
  const records = matchDocs.map((doc) => {
    if (!validDocument(doc, 'matches').startsWith(tournamentPath + '/matches/')) {
      throw new Error('jogo de outro torneio');
    }
    return decode(doc);
  });
  const census = auditor.report(tournament, records);
  if (!census.backfillCandidate || census.counts.ausente === 0) {
    return { eligible: false, reason: census.backfillCandidate ? 'sem_alvos' : 'cobertura', census };
  }

  const resultById = new Map();
  for (const doc of resultDocs) {
    const name = validDocument(doc, 'results');
    if (!name.startsWith(tournamentPath + '/results/')) throw new Error('resultado de outro torneio');
    const id = name.slice(name.lastIndexOf('/') + 1);
    if (resultById.has(id)) throw new Error('resultado duplicado');
    resultById.set(id, doc);
  }
  const sorted = matchDocs.map((doc, index) => ({ doc, record: records[index] }))
    .sort((a, b) => a.doc.name.localeCompare(b.doc.name));
  const targets = [];
  const digestGames = [];
  let withResults = 0;
  let missingResults = 0;
  let nonSkippingMirrors = 0;
  const mirrorMismatchFields = {};
  const mirrorMismatchKinds = {};

  // Igual ao gatilho: monta com d.data() das subcoleções, sem tradutor de UI.
  const collectionData = { matches: records };
  for (const [name, docs] of Object.entries(extraCollections)) {
    if (!Array.isArray(docs)) throw new Error('subcoleção incompleta');
    collectionData[name] = docs.map(decode);
  }
  return split.montarDoBanco(tournament, (collection) => {
    if (!Object.prototype.hasOwnProperty.call(collectionData, collection)) {
      throw new Error('subcoleção exigida não lida');
    }
    return collectionData[collection];
  }).then((mounted) => {
    for (const { doc, record } of sorted) {
      const classification = auditor.classify(record);
      const phase = split.faseIndexavel(record.jogo, record._loc);
      const id = record && record.jogo && record.jogo.id != null ? String(record.jogo.id) : '';
      const result = id ? resultById.get(id) : null;
      if (classification === 'ausente') {
        // `skip` do espelho preserva órfãos; não pode tornar elegível um jogo
        // físico que não voltou da montagem canônica.
        const mountedGame = mirror.jogoPorId(mounted, id);
        if (!mountedGame) return { eligible: false, reason: 'jogo_nao_montado', census };
        if (!result) missingResults++;
        else {
          withResults++;
          const previous = decode(result);
          const mirrorPlan = mirror.planoDoEspelho(mounted, id, previous, tournamentPath.split('/').pop(), '2000-01-01T00:00:00.000Z');
          if (mirrorPlan.acao !== 'skip') {
            nonSkippingMirrors++;
            const desired = roster.buildSeedDoc(mounted, mountedGame);
            for (const field of mirrorDifferences(previous, desired)) {
              mirrorMismatchFields[field] = (mirrorMismatchFields[field] || 0) + 1;
              const kind = differenceKind(previous, desired, field);
              mirrorMismatchKinds[kind] = (mirrorMismatchKinds[kind] || 0) + 1;
            }
          }
        }
        targets.push({ path: doc.name, updateTime: doc.updateTime, phase });
      }
      digestGames.push({ path: doc.name, updateTime: doc.updateTime, classification, phase,
        resultPath: result ? result.name : null, resultUpdateTime: result ? result.updateTime : null });
    }
    if (missingResults || nonSkippingMirrors) {
      return { eligible: false, reason: missingResults ? 'espelho_ausente' : 'espelho_divergente',
        census, withResults, missingResults, nonSkippingMirrors, mirrorMismatchFields, mirrorMismatchKinds };
    }
    const digestInput = { tournamentPath, tournamentUpdateTime: tournamentDoc.updateTime, games: digestGames };
    return { eligible: true, census, withResults, missingResults, nonSkippingMirrors, mirrorMismatchFields, mirrorMismatchKinds,
      digestInput, targets, digest: stableDigest(digestInput) };
  });
}

function aggregatePlans(plans) {
  const eligible = plans.filter((plan) => plan.eligible);
  const mirrorMismatchFields = {};
  const mirrorMismatchKinds = {};
  for (const plan of plans) {
    for (const [field, count] of Object.entries(plan.mirrorMismatchFields || {})) {
      mirrorMismatchFields[field] = (mirrorMismatchFields[field] || 0) + count;
    }
    for (const [kind, count] of Object.entries(plan.mirrorMismatchKinds || {})) {
      mirrorMismatchKinds[kind] = (mirrorMismatchKinds[kind] || 0) + count;
    }
  }
  const digestInput = eligible.map((plan) => plan.digestInput)
    .sort((a, b) => a.tournamentPath.localeCompare(b.tournamentPath));
  return {
    tournaments: plans.length,
    eligibleTournaments: eligible.length,
    blockedTournaments: plans.length - eligible.length,
    targetGames: eligible.reduce((sum, plan) => sum + plan.targets.length, 0),
    withResults: plans.reduce((sum, plan) => sum + (plan.withResults || 0), 0),
    missingResults: plans.reduce((sum, plan) => sum + (plan.missingResults || 0), 0),
    nonSkippingMirrors: plans.reduce((sum, plan) => sum + (plan.nonSkippingMirrors || 0), 0),
    mirrorMismatchFields,
    mirrorMismatchKinds,
    digest: stableDigest(digestInput)
  };
}

module.exports = { validDocument, validTournament, stableDigest, mirrorDifferences, differenceKind, matchesToPlan, aggregatePlans };
