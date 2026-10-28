#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const { servedRevisionName } = require('./check-served-operation-revision');

function checkRecovery(service, source, gate, name, regionalName) {
  const expected = source.filter(row => row.name === regionalName && row.region === 'us-east1');
  const saved = gate.recovery?.filter(row => row.name === name);
  if (expected.length !== 1 || saved?.length !== 1) throw new Error('recovery ausente ou duplicada');
  const image = service.spec?.template?.spec?.containers?.[0]?.image;
  if (!image?.includes('@sha256:') || image !== saved[0].image || image !== expected[0].image)
    throw new Error('imagem recovery diverge da porta regional');
  if (service.status?.url !== saved[0].url || service.spec?.template?.metadata?.annotations?.['run.googleapis.com/base-images'])
    throw new Error('URL ou atualização automática da recovery divergente');
  if (servedRevisionName(service) !== saved[0].revision)
    throw new Error('revisão servida da recovery divergente');
  return saved[0];
}

if (require.main === module) {
  const service = JSON.parse(process.env.SP_JSON || '{}');
  const source = JSON.parse(fs.readFileSync(process.env.SP_SOURCE_MANIFEST, 'utf8'));
  const gate = JSON.parse(fs.readFileSync(process.env.SP_GATE_MANIFEST, 'utf8'));
  checkRecovery(service, source, gate, process.env.SP_NAME, process.env.SP_REGIONAL);
}
module.exports = { checkRecovery };
