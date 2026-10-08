'use strict';

// O agendador consulta a subcoleção em todos os torneios. Sem este índice de
// grupo, o Firestore responde FAILED_PRECONDITION e a fila inteira fica parada.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'functions-autodraw', 'index.js'), 'utf8');
let failures = 0;

function ok(condition, label) {
  console.log((condition ? '✓ ' : '✗ ') + label);
  if (!condition) failures++;
}

const override = (indexes.fieldOverrides || []).find((item) =>
  item.collectionGroup === 'notificationOutbox' && item.fieldPath === 'dispatchStatus'
);
ok(Boolean(override), 'declara índice de grupo para o status da outbox');
ok(Boolean(override && (override.indexes || []).some((index) =>
  index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
)), 'índice atende à igualdade collectionGroup por dispatchStatus');

const scheduler = source.slice(
  source.indexOf('exports.releasePendingScoreApprovalNotifications'),
  source.indexOf('exports.deliverScoreNotification')
);
ok(/collectionGroup\('notificationOutbox'\)/.test(scheduler), 'agendador lê a outbox em todos os torneios');
ok(/where\('dispatchStatus', '==', 'pending'\)/.test(scheduler), 'agendador filtra avisos pendentes pelo campo indexado');

process.exit(failures ? 1 : 0);
