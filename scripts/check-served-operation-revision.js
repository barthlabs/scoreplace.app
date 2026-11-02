#!/usr/bin/env node
'use strict';
// Compara o tráfego efetivo do Cloud Run com o manifesto, sem confundir a
// última revisão pronta com a revisão que está recebendo requisições.
const fs = require('node:fs');

function servedRevisionName(service) {
  const traffic = service.status?.traffic;
  if (!Array.isArray(traffic) || traffic.length !== 1) throw new Error('Tráfego dividido ou ausente');
  const item = traffic[0];
  if (item.percent !== 100 || item.tag || !item.revisionName) throw new Error('Tráfego não fixado em uma revisão');
  if (item.latestRevision === true && item.revisionName !== service.status?.latestReadyRevisionName) {
    throw new Error('Tráfego latestRevision divergente');
  }
  return item.revisionName;
}

function checkServed(service, revision, row) {
  const name = servedRevisionName(service);
  const container = revision.spec?.containers?.[0];
  const env = Object.fromEntries((container?.env || []).map(item => [item.name, item.value]));
  if (name !== row.revision || revision.metadata?.name !== name) throw new Error('Revisão servida divergente');
  if (!revision.status?.conditions?.some(item => item.type === 'Ready' && String(item.status) === 'True')) {
    throw new Error('Revisão servida não pronta');
  }
  if (!container?.image?.includes('@sha256:') || container.image !== row.image) throw new Error('Imagem servida divergente');
  if (env.SP_SOURCE_DIGEST !== row.sourceDigest || env.SP_OPERATION_REGION !== row.region) {
    throw new Error('Fonte ou região servida divergente');
  }
  if (revision.metadata?.annotations?.['run.googleapis.com/base-images']) throw new Error('Atualização automática da imagem');
  if (!/^https:\/\//.test(row.url) || service.status?.url !== row.url) throw new Error('URL pública divergente');
  return name;
}

// Decisão anterior ao corte de tráfego. A revisão recém-criada pode estar
// pronta mas "retired" enquanto a rota continua fixada na revisão antiga.
// Nunca confundir spec.template (desejo) com a revisão que recebe requisições.
function candidateDecision(service, revision, expected) {
  const name = service.status?.latestCreatedRevisionName;
  if (!expected || !expected.previousRevision ||
      !/^[a-f0-9]{64}$/.test(expected.sourceDigest || '') ||
      !/^[a-z]+(?:-[a-z]+)*[0-9]+$/.test(expected.region || '') || !name ||
      name === expected.previousRevision ||
      (expected.revision && name !== expected.revision) ||
      revision.metadata?.name !== name) throw new Error('Revisão candidata ausente ou divergente');
  const conditions = revision.status?.conditions || [];
  const ready = type => conditions.some(item => item.type === type && String(item.status) === 'True');
  if (!ready('Ready') || !ready('ContainerReady')) {
    throw new Error('Revisão candidata não pronta');
  }
  const container = revision.spec?.containers?.[0];
  const env = Object.fromEntries((container?.env || []).map(item => [item.name, item.value]));
  const image = container?.image;
  if (!image?.includes('@sha256:') || (expected.image && image !== expected.image)) {
    throw new Error('Imagem candidata divergente');
  }
  if (env.SP_SOURCE_DIGEST !== expected.sourceDigest || env.SP_OPERATION_REGION !== expected.region) {
    throw new Error('Fonte ou região candidata divergente');
  }
  if (revision.metadata?.annotations?.['run.googleapis.com/base-images']) {
    throw new Error('Atualização automática da imagem candidata');
  }
  if (expected.url && service.status?.url !== expected.url) throw new Error('URL candidata divergente');
  const served = servedRevisionName(service);
  if (served !== expected.previousRevision && served !== name) {
    throw new Error('Tráfego aponta para revisão inesperada');
  }
  return { action: served === name ? 'current' : 'promote', revision: name, image };
}

if (require.main === module) {
  const service = JSON.parse(process.env.SP_SERVICE_JSON || '{}');
  const revision = JSON.parse(process.env.SP_REVISION_JSON || '{}');
  const manifest = JSON.parse(fs.readFileSync(process.env.SP_FILE, 'utf8'));
  const rows = manifest.filter(row => row.name === process.env.SP_NAME && row.region === process.env.SP_REGION);
  if (rows.length !== 1) throw new Error('Manifesto ausente ou duplicado');
  process.stdout.write(checkServed(service, revision, rows[0]) + '\n');
}
module.exports = { servedRevisionName, checkServed, candidateDecision };
