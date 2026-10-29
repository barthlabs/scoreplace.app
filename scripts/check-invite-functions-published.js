#!/usr/bin/env node
'use strict';
// O site desta versão depende de três callables publicadas antes dele.
// O recibo só é criado pelo publicador após os três alvos terminarem com sucesso.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.join(__dirname, '..');
const receipt = path.join(root, '.invite-functions-published.json');
const names = ['mutateHostOrganization', 'respondHostInvite', 'manageTournamentReferee'];
const index = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const cohost = fs.readFileSync(path.join(root, 'functions/cohost-core.js'), 'utf8');
const blocks = names.map((name) => {
  const start = index.indexOf('exports.' + name + ' = onCall(');
  if (start < 0) throw new Error('Callable não encontrada: ' + name);
  const next = index.indexOf('\nexports.', start + 1);
  return index.slice(start, next < 0 ? index.length : next);
});
const contractHash = crypto.createHash('sha256').update(blocks.join('\n') + '\n' + cohost).digest('hex');
if (process.argv[2] === '--stamp') {
  if (process.env.SP_DEPLOY_CONFIRMED !== '1') throw new Error('Recibo exige deploy confirmado pelo publicador');
  fs.writeFileSync(receipt, JSON.stringify({ schema: 1, contractHash, functions: names,
    deployedAt: new Date().toISOString() }, null, 2) + '\n');
  console.log('✓ recibo das três Functions de convite: ' + contractHash.slice(0, 12));
  process.exit(0);
}
let saved = null;
try { saved = JSON.parse(fs.readFileSync(receipt, 'utf8')); } catch (_) {}
if (!saved || saved.schema !== 1 || saved.contractHash !== contractHash ||
    !Array.isArray(saved.functions) || names.some((name) => !saved.functions.includes(name))) {
  console.error('✗ Functions de convite não comprovadas nesta versão; publique as três antes do Hosting.');
  process.exit(1);
}
console.log('✓ Functions de convite publicadas antes do Hosting (' + contractHash.slice(0, 12) + ')');
