'use strict';
const fs = require('fs'); let fail = 0;
function ok(value, message) { console.log((value ? '✓ ' : '✗ ') + message); if (!value) fail++; }
const source = fs.readFileSync('functions/index.js', 'utf8');
const previewStart = source.indexOf('exports.previewTournamentLegacyPhaseMigration = onCall');
const previewEnd = source.indexOf('\nexports.setTournamentPhaseConfig', previewStart);
const preview = source.slice(previewStart, previewEnd);
ok(previewStart >= 0 && preview.includes('request.auth && request.auth.uid') && preview.includes('_isTournamentOrgCaller'),
  'prévia de migração exige sessão e autorização da organização por UID');
ok(preview.includes('_legacyPhaseAdapter.classifyLegacyPhase') && preview.includes('canMigrate') && !/\.update\(/.test(preview),
  'prévia classifica legado sem inventar política nem gravar o torneio');
const start = source.indexOf('exports.setTournamentPhaseConfig = onCall');
const end = source.indexOf('\nexports.', start + 8);
const body = source.slice(start, end < 0 ? source.length : end);
ok(start >= 0 && body.includes('db.runTransaction') && body.includes('request.auth && request.auth.uid'), 'phaseConfig decide em Function transacional autenticada');
ok(body.includes('_isTournamentOrgCaller') && body.includes('_phaseConfigCanChange'), 'Function autoriza organização por UID e recusa legado/materialização');
ok(body.includes('_phaseConfig.normalizePhaseConfig') && body.includes('tx.update(ref, { phaseConfig:'), 'Function valida o schema puro e grava somente pela transação');
process.exit(fail ? 1 : 0);
