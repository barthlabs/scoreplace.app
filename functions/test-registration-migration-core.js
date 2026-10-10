'use strict';
const R = require('./registration-core');
const M = require('./registration-migration-core');
const fs = require('fs');
let pass = 0, fail = 0;
function ok(name, value) { if (value) pass++; else { fail++; console.error('✗ ' + name); } }
function bad(name, fn) { try { fn(); ok(name, false); } catch (_) { ok(name, true); } }

const report = R.projectLegacyRoster('t1', [
  { sourceKey: 'dupla-1', entry: { p1Uid: 'u1', p2Name: 'Convidada', category: 'cat-a' } },
  { sourceKey: 'solo-1', entry: { uid: 'u3', category: 'cat-b' } },
]);
const first = M.decideMaterialization('t1', report, {});
ok('gera um documento por pessoa e categoria', first.creates.length === 3 && first.conflicts.length === 0);
const pairDocs = first.creates.filter((item) => item.fixedPairId);
ok('dupla formada fica vinculada nos dois registros da categoria', pairDocs.length === 2 && pairDocs[0].fixedPairId === pairDocs[1].fixedPairId);
ok('convidada usa identidade manual, não nome', pairDocs.some((item) => item.participantKind === 'manual' && item.manualParticipantId.indexOf('legacy-manual-') === 0));
ok('convidada preserva nome somente para exibição no torneio', pairDocs.some((item) => item.participantKind === 'manual' && item.manualDisplayName === 'Convidada'));
ok('conta usa somente UID', pairDocs.some((item) => item.participantKind === 'account' && item.participantUid === 'u1' && item.manualParticipantId === null));

const stored = Object.fromEntries(first.creates.map((item) => [item.registrationId, Object.assign({}, item, { createdAt: 'server-time' })]));
const second = M.decideMaterialization('t1', report, stored);
ok('reaplicar o mesmo plano é no-op', second.creates.length === 0 && second.already.length === 3 && second.conflicts.length === 0);
stored[first.creates[0].registrationId].participantUid = 'outra-conta';
ok('nunca sobrescreve uma inscrição canônica divergente', M.decideMaterialization('t1', report, stored).conflicts.length === 1);
bad('recusa plano ainda com exceções', () => M.desiredDocuments('t1', Object.assign({}, report, { unsupported: [{ reason: 'x' }] })));

const server = fs.readFileSync(__dirname + '/index.js', 'utf8');
const start = server.indexOf('exports.applyCanonicalRegistrationMigration = onCall');
const body = start === -1 ? '' : server.slice(start, server.indexOf('\n// Configuração tipada', start));
ok('callable de migração existe', start !== -1);
ok('callable exige fingerprint e organização por UID', body.includes('expectedFingerprint') && body.includes('_isTournamentOrgCaller(tournament, callerUid)'));
ok('migração só é liberada depois das mutações canônicas e conserva a trava do servidor',
  server.includes('const _CANONICAL_REGISTRATION_MUTATIONS_READY = true;') &&
  body.includes('if (!_CANONICAL_REGISTRATION_MUTATIONS_READY)') && body.includes('operações canônicas de elenco não foram concluídas'));
ok('callable relê registros físicos e recusa plano alterado', body.includes('lerRegistrosDaParte') && body.includes('report.fingerprint !== expectedFingerprint'));
ok('callable cria somente operações decididas pelo núcleo', body.includes('decision.creates.forEach') && body.includes('tx.create('));
ok('callable não reescreve participants nem resultados legados', !/gravar\(tx, ref.*participants/.test(body) && !/matches\s*:/.test(body));

console.log((fail ? '❌' : '✅') + ' registration-migration-core: ' + pass + ' ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
