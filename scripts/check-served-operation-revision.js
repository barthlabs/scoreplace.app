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

if (require.main === module) {
  const service = JSON.parse(process.env.SP_SERVICE_JSON || '{}');
  const revision = JSON.parse(process.env.SP_REVISION_JSON || '{}');
  const manifest = JSON.parse(fs.readFileSync(process.env.SP_FILE, 'utf8'));
  const rows = manifest.filter(row => row.name === process.env.SP_NAME && row.region === process.env.SP_REGION);
  if (rows.length !== 1) throw new Error('Manifesto ausente ou duplicado');
  process.stdout.write(checkServed(service, revision, rows[0]) + '\n');
}
module.exports = { servedRevisionName, checkServed };
