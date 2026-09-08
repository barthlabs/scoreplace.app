/* casual-stats-canonicos — L3.P1
 *
 * A medição de produção encontrou playerUids/players/result em todas as salas
 * finalizadas e nenhum hostUid/guestUid. Este teste usa a forma realmente
 * persistida e trava cliente + backfill no mesmo núcleo de decisão.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Core = require('../functions/casual-stats-core.js');
let pass = 0, fail = 0;
function ok(value, label) { if (value) { pass++; console.log('✓ ' + label); } else { fail++; console.error('✗ ' + label); } }
function eq(actual, expected, label) { ok(actual === expected, label + ' (esperado ' + expected + ', veio ' + actual + ')'); }

const base = {
  status: 'finished',
  playerUids: ['ana', 'bia'],
  players: [{ uid: 'ana', team: 1 }, { uid: 'bia', team: 2 }],
  result: { winner: 1 },
  createdAt: '2026-09-08T10:00:00.000Z',
  finishedAt: '2026-09-08T10:05:00.000Z',
  sport: 'Beach Tennis'
};

ok(Core.isQualified(base), 'partida no schema real é qualificada');
eq(Core.didUidWin(base, 'ana'), true, 'time 1 vence por result.winner');
eq(Core.didUidWin(base, 'bia'), false, 'adversário não recebe vitória');
eq(Core.didUidWin(Object.assign({}, base, { result: { winner: 'draw' } }), 'ana'), false, 'empate não credita vitória');
eq(Core.participantUids({ playerUids: ['ana'], players: [{ uid: 'bia' }], participants: [{ uid: 'caio' }] }).sort().join(','), 'ana,bia,caio', 'união cobre os três espelhos de identidade');
ok(!Core.isQualified(Object.assign({}, base, { playerUids: ['ana'], players: [{ uid: 'ana', team: 1 }] })), 'autojogo não qualifica');
ok(!Core.isQualified(Object.assign({}, base, { playerUids: ['ana', 'bot_1'] })), 'bot não qualifica');
ok(!Core.isQualified(Object.assign({}, base, { finishedAt: '2026-09-08T10:02:00.000Z' })), 'partida menor que três minutos não qualifica');
eq(Core.applyDailyLimit([base, Object.assign({}, base), Object.assign({}, base), Object.assign({}, base), Object.assign({}, base), Object.assign({}, base)]).length, 5, 'limite diário preserva no máximo cinco partidas');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/trophies.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions/index.js'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'js/trophy-catalog.js'), 'utf8');
ok(/where\('playerUids', 'array-contains', uid\)/.test(client), 'cliente consulta índice playerUids');
ok(/where\("playerUids", "array-contains", uid\)/.test(server), 'backfill consulta índice playerUids');
ok(/CasualStatsCore\.didUidWin/.test(client), 'cliente calcula vitória pelo núcleo canônico');
ok(/_casualStats\.didUidWin/.test(server), 'backfill calcula vitória pelo núcleo canônico');
ok(!/where\(['"]hostUid['"]/.test(client + server) && !/where\(['"]guestUid['"]/.test(client + server), 'nenhuma consulta depende dos campos fantasmas');
ok(/CasualStatsCore\.isQualified/.test(catalog), 'catálogo delega qualificação ao núcleo canônico');

console.log('\ncasual-stats-canonicos: ' + pass + ' passou, ' + fail + ' falhou');
if (fail) process.exit(1);
