/**
 * scoreplace.app — Basic Unit Tests
 * Run: node tests/test-utils.js
 * Tests pure logic functions that don't require DOM or Firebase
 */

// Minimal global stubs
global.window = {};
global.firebase = { auth: () => ({}) };

// Load the utils module (contains pure functions)
require('../js/views/tournaments-utils.js');

let passed = 0;
let failed = 0;

function assert(condition, testName) {
    if (condition) {
        passed++;
        console.log('  ✅ ' + testName);
    } else {
        failed++;
        console.log('  ❌ ' + testName);
    }
}

// ─── _isLigaFormat ───
console.log('\n📋 _isLigaFormat');
assert(window._isLigaFormat({ format: 'Liga' }) === true, 'Liga format returns true');
assert(window._isLigaFormat({ format: 'Ranking' }) === true, 'Ranking format returns true');
assert(window._isLigaFormat({ format: 'Suíço Clássico' }) === false, 'Suíço returns false');
assert(!window._isLigaFormat(null), 'null returns falsy');
assert(window._isLigaFormat({}) === false, 'empty object returns false');

// ─── _getTournamentProgress ───
console.log('\n📋 _getTournamentProgress');
assert(window._getTournamentProgress(null).pct === 0, 'null tournament returns 0%');
assert(window._getTournamentProgress({}).pct === 0, 'empty tournament returns 0%');

var t1 = {
    matches: [
        { p1: 'Alice', p2: 'Bob', winner: 'Alice', score1: 2, score2: 0 },
        { p1: 'Carol', p2: 'Dave', winner: null }
    ]
};
var progress1 = window._getTournamentProgress(t1);
assert(progress1.total === 2, 'counts 2 real matches');
assert(progress1.completed === 1, 'counts 1 completed match');
assert(progress1.pct === 50, 'calculates 50% progress');

var t2 = {
    matches: [
        { p1: 'Alice', p2: 'BYE' },
        { p1: 'Bob', p2: 'Carol', winner: 'Bob', score1: 2, score2: 1 }
    ]
};
var progress2 = window._getTournamentProgress(t2);
assert(progress2.total === 1, 'excludes BYE matches from total');
assert(progress2.completed === 1, '1 completed (non-BYE)');
assert(progress2.pct === 100, '100% when all non-BYE complete');

var t3 = {
    rounds: [
        { matches: [{ p1: 'A', p2: 'B', winner: 'A' }] },
        { matches: [{ p1: 'C', p2: 'D', winner: 'C' }, { p1: 'E', p2: 'F' }] }
    ]
};
var progress3 = window._getTournamentProgress(t3);
assert(progress3.total === 3, 'counts matches across rounds');
assert(progress3.completed === 2, '2 completed across rounds');

// ─── _calcNextDrawDate ───
console.log('\n📋 _calcNextDrawDate');
assert(window._calcNextDrawDate(null) === null, 'null tournament returns null');
assert(window._calcNextDrawDate({}) === null, 'no drawFirstDate returns null');

var futureDate = new Date(Date.now() + 7 * 86400000);
var futureStr = futureDate.toISOString().split('T')[0];
var t4 = { drawFirstDate: futureStr, drawFirstTime: '19:00', drawIntervalDays: 7 };
var next4 = window._calcNextDrawDate(t4);
assert(next4 instanceof Date, 'returns Date object for future draw');
assert(next4.getTime() > Date.now(), 'future draw is in the future');

var pastDate = new Date(Date.now() - 20 * 86400000);
var pastStr = pastDate.toISOString().split('T')[0];
var t5 = { drawFirstDate: pastStr, drawFirstTime: '19:00', drawIntervalDays: 7 };
var next5 = window._calcNextDrawDate(t5);
assert(next5 instanceof Date, 'returns Date for past start');
assert(next5.getTime() > Date.now(), 'next draw is in the future even with past start');

// ─── _notifLevelAllowed ───
console.log('\n📋 _notifLevelAllowed');
assert(window._notifLevelAllowed('todas', 'all') === true, 'todas allows all');
assert(window._notifLevelAllowed('todas', 'important') === true, 'todas allows important');
assert(window._notifLevelAllowed('todas', 'fundamental') === true, 'todas allows fundamental');
assert(window._notifLevelAllowed('importantes', 'all') === false, 'importantes blocks all');
assert(window._notifLevelAllowed('importantes', 'important') === true, 'importantes allows important');
assert(window._notifLevelAllowed('importantes', 'fundamental') === true, 'importantes allows fundamental');
assert(window._notifLevelAllowed('fundamentais', 'all') === false, 'fundamentais blocks all');
assert(window._notifLevelAllowed('fundamentais', 'important') === false, 'fundamentais blocks important');
assert(window._notifLevelAllowed('fundamentais', 'fundamental') === true, 'fundamentais allows fundamental');
assert(window._notifLevelAllowed(null, 'all') === true, 'null level allows all');
assert(window._notifLevelAllowed(undefined, 'important') === true, 'undefined level allows all');

// ─── _isTeamEnrollMode (v4.4.96 — drift 'time' vs 'teams' que quebrava o card de duplas) ───
console.log('\n📋 _isTeamEnrollMode');
assert(typeof window._isTeamEnrollMode === 'function', 'helper canônico existe');
assert(window._isTeamEnrollMode('time') === true, "'time' (legado) é modo de equipe");
assert(window._isTeamEnrollMode('teams') === true, "'teams' (format2) é modo de equipe — REGRESSÃO se falhar");
assert(window._isTeamEnrollMode('misto') === true, "'misto' permite equipes");
assert(window._isTeamEnrollMode('individual') === false, "'individual' NÃO é equipe");
assert(window._isTeamEnrollMode(undefined) === false, 'undefined não é equipe');
assert(window._isTeamEnrollMode(null) === false, 'null não é equipe');
assert(window._isTeamEnrollMode('') === false, 'string vazia não é equipe');

// ─── Summary ───
console.log('\n' + '─'.repeat(40));
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(40));
process.exit(failed > 0 ? 1 : 0);
