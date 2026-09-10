'use strict';
const fs = require('fs');
const core = require('../functions-autodraw/league-season-core.js');
let failed = 0;
function ok(value, label) { console.log((value ? '✓ ' : '✗ ') + label); if (!value) failed++; }

let t = { format: 'Liga', status: 'active', combinedCategories: ['A'] };
let r = core.closeExpiredLeagueSeason(t, { expired: true, nowIso: '2026-09-09T00:00:00.000Z', computeStandings: () => [{ uid: 'u1' }] });
ok(r.changed && t.status === 'finished' && t.finishedAt === '2026-09-09T00:00:00.000Z' && t.standings.length === 1, 'núcleo fecha Liga e calcula classificação no servidor');
r = core.closeExpiredLeagueSeason(t, { expired: true, nowIso: 'later' });
ok(!r.changed, 'núcleo é idempotente após o fecho');
ok(!core.closeExpiredLeagueSeason({ format: 'Liga', status: 'active' }, { expired: false }).changed, 'prazo não vencido não fecha');
const fn = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const start = fn.indexOf('exports.closeExpiredLeagueSeason');
const end = fn.indexOf('exports.setTournamentCategoryConfig', start);
const body = fn.slice(start, end);
ok(start >= 0 && body.includes('_isTournamentAdmin') && body.includes('_closeExpiredLeagueSeason'), 'CF autentica a organização e usa a porta transacional');
ok(fn.includes("doc('season-finished')") && fn.includes('notificationOutbox'), 'aviso é persistido pelo servidor e deduplicado');
const dash = fs.readFileSync('js/views/dashboard.js', 'utf8');
const helperStart = dash.indexOf('window._requestExpiredLeagueSeasonClose');
const block = dash.slice(helperStart, dash.indexOf('})();', helperStart) + 4);
ok(block.includes("_callCF('closeExpiredLeagueSeason'") && !block.includes('saveTournament') && !/t\.status\s*=(?!=)/.test(block), 'dashboard apenas dispara a CF e não persiste fechamento');
const tours = fs.readFileSync('js/views/tournaments.js', 'utf8');
ok(!tours.includes('_applyLigaSeasonClosure') && tours.includes('_requestExpiredLeagueSeasonClose(t)'), 'lista de torneios não mantém segundo escritor local');
process.exit(failed ? 1 : 0);
