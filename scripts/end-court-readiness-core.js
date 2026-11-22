'use strict';

const { checkTargetedPublication } = require('./backend-publication-core');

const REQUIRED_FUNCTIONS = Object.freeze([
  'createTournament', 'tournamentSummary', 'tournamentSummaryMatch',
  'tournamentSummaryParticipant', 'tournamentSummaryRegistration',
  'tournamentSummaryLegacyGroup', 'endMatchOnCourt'
]);
const REGIONS = Object.freeze({
  v2:['us-east1', 'us-east4', 'us-south1'],
  v3:['us-east1', 'us-east4', 'us-south1', 'us-central1', 'southamerica-east1']
});

function validateFunctionSet(manifest) {
  const names = manifest && manifest.functions;
  if (!Array.isArray(names) || names.length !== REQUIRED_FUNCTIONS.length ||
      new Set(names).size !== names.length || REQUIRED_FUNCTIONS.some(name => !names.includes(name))) {
    throw new Error('manifesto deve conter exatamente as sete funções requeridas, sem duplicatas ou extras');
  }
}

function regionalRows(rows, version, sourceCommit, sourceDigest) {
  if (!Array.isArray(rows)) throw new Error(`manifesto regional ${version} inválido`);
  const serviceName = `sp-op-end-court-${version}`;
  const targetRows = rows.filter(row => row && row.name === serviceName && row.target === 'endMatchOnCourt');
  const expectedRegions = REGIONS[version];
  if (targetRows.length !== expectedRegions.length) throw new Error(`manifesto ${version} incompleto ou duplicado`);
  const byRegion = new Map();
  for (const row of targetRows) {
    if (!expectedRegions.includes(row.region) || byRegion.has(row.region)) {
      throw new Error(`região ${version} inválida ou duplicada: ${row.region}`);
    }
    if (row.commit !== sourceCommit || row.sourceDigest !== sourceDigest ||
        !String(row.image || '').includes('@sha256:') || !/^https:\/\//.test(row.url || '') ||
        !row.revision || row.env?.SP_SOURCE_DIGEST !== sourceDigest ||
        row.env?.SP_OPERATION_REGION !== row.region) {
      throw new Error(`revisão regional ${version}/${row.region} não confere com a fonte validada`);
    }
    byRegion.set(row.region, row);
  }
  if (expectedRegions.some(region => !byRegion.has(region))) {
    throw new Error(`manifesto ${version} não cobre todas as regiões esperadas`);
  }
  return targetRows;
}

function buildReadyDocument({ requiredManifest, receipt, exportedNames, regionalManifests,
  sourceDigest, centralSourceDigest }) {
  validateFunctionSet(requiredManifest);
  const sourceCommit = requiredManifest.backendCommit;
  if (!/^[a-f0-9]{40}$/.test(sourceCommit || '') ||
      !/^[a-f0-9]{64}$/.test(sourceDigest || '') ||
      !/^[a-f0-9]{64}$/.test(centralSourceDigest || '')) {
    throw new Error('commit ou digest recalculado inválido; readiness permanece false');
  }
  const publication = checkTargetedPublication(requiredManifest, receipt, sourceCommit, exportedNames);
  if (!publication.ok || publication.verified.length !== REQUIRED_FUNCTIONS.length) {
    throw new Error(`publicação central não confirmada: ${publication.reason || 'conjunto incompleto'}`);
  }
  const rowsV2 = regionalRows(regionalManifests?.v2, 'v2', sourceCommit, sourceDigest);
  const rowsV3 = regionalRows(regionalManifests?.v3, 'v3', sourceCommit, sourceDigest);
  const regions = [...new Set([...rowsV2, ...rowsV3].map(row => row.region))];
  const expectedUnion = [...new Set([...REGIONS.v2, ...REGIONS.v3])];
  if (regions.length !== expectedUnion.length || expectedUnion.some(region => !regions.includes(region))) {
    throw new Error('cobertura de regiões não confere');
  }
  return { ready:true, sourceDigest, centralSourceDigest, sourceCommit,
    verifiedVersions:['v2', 'v3'], regions };
}

module.exports = { REQUIRED_FUNCTIONS, REGIONS, validateFunctionSet, regionalRows, buildReadyDocument };
