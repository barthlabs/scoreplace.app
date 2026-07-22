/* W.O. SEMPRE DISPONÍVEL — canônico, função pura da CONFIG (não do dia/instância).
 *
 * REPRODUZ O CASO REAL (prod, 18-jul-2026 — "Duplas Mistas Sorteadas"): torneio de UM DIA
 * (10h→15h), resultEntry=['organizer','players']. O botão W.O. sumiu de TODOS os jogos —
 * inclusive 3º lugar e final — porque o gate era `_woIsMultiDay(t) && _playersEnter(t)`, e
 * um torneio de 1 dia dá `_woIsMultiDay=false`. Dono: _"wo sempre. a pessoa estava no início
 * do torneio, mas abandonou antes de jogar o terceiro. ou a pessoa se machuca. isso pode
 * acontecer no primeiro jogo. entao tem que estar sempre disponivel."_
 *
 * REGRA CANÔNICA ([[feedback_behavior_is_pure_function_of_config]]): W.O. num jogo NÃO decidido
 * = função da CONFIG, não do nº de dias. Organizador/co-host DECLARA sempre; participante
 * ACUSA quando resultEntry inclui players/all. Idêntico em qualquer torneio.
 *
 * Estes casos FALHAM no gate antigo (multi-dia) e PASSAM no novo.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {} };
sandbox.location = { hash: '' }; sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..', 'js', 'views');
const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });

const NAMES = { uA: 'Ana', uB: 'Bia' };
sandbox._nameForUid = (u) => NAMES[u] || '';
sandbox._displayNameForUid = (u, stored) => NAMES[u] || stored || '';

load('identity-core.js');
load('bracket-logic.js');
load('wo-claim.js');

// AppStore mock — papel controlado por _IS_ORG e currentUser por teste.
sandbox.AppStore = {
  tournaments: [],
  currentUser: null,
  isOrganizer: () => !!sandbox._IS_ORG,
  isCreator: () => false,
};
sandbox._findTournamentById = (id) => sandbox.AppStore.tournaments.find((x) => String(x.id) === String(id));

function mkT(id, resultEntry, sameDay, decided) {
  return {
    id: id, format: 'Eliminatórias Simples', resultEntry: resultEntry,
    startDate: '2026-07-18T10:00',
    endDate: sameDay ? '2026-07-18T15:00' : '2026-07-20T15:00',
    participants: [{ uid: 'uA', displayName: 'Ana' }, { uid: 'uB', displayName: 'Bia' }],
    matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia', team1Uids: ['uA'], team2Uids: ['uB'], winner: decided ? 'Ana' : null }],
    woClaims: [],
  };
}
function chip(t, asOrg, asUid) {
  sandbox._IS_ORG = asOrg;
  sandbox.AppStore.currentUser = asUid ? { uid: asUid } : (asOrg ? { uid: 'org1' } : null);
  sandbox.AppStore.tournaments = [t];
  return sandbox.window._woClaimChip(t, { scope: 'match', matchId: 'm1', compact: true }) || '';
}

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } };

console.log('──── W.O. sempre (1 dia) ────');

// _woClaimEnabled = "participante pode acusar" = resultEntry inclui players — SEM multi-dia.
ok('1 dia + players → _woClaimEnabled TRUE (era false pelo gate multi-dia)',
  sandbox.window._woClaimEnabled(mkT('t1', ['organizer', 'players'], true, false)) === true);
ok('1 dia + só organizer → _woClaimEnabled FALSE (participante não acusa)',
  sandbox.window._woClaimEnabled(mkT('t2', ['organizer'], true, false)) === false);
ok('multi-dia + players → TRUE (sanidade)',
  sandbox.window._woClaimEnabled(mkT('t3', ['players'], false, false)) === true);

// Organizador declara SEMPRE, mesmo 1 dia e resultEntry só organizer (o caso que sumia).
ok('ORG · 1 dia · resultEntry=[organizer] · jogo aberto → chip PRESENTE',
  chip(mkT('t4', ['organizer'], true, false), true, null).length > 0);
ok('ORG · 1 dia · jogo DECIDIDO → chip AUSENTE (rc.done)',
  chip(mkT('t5', ['organizer'], true, true), true, null) === '');

// Participante acusa só quando resultEntry inclui players.
ok('JOGADOR · 1 dia · resultEntry=[organizer,players] · aberto → chip PRESENTE',
  chip(mkT('t6', ['organizer', 'players'], true, false), false, 'uA').length > 0);
ok('JOGADOR · 1 dia · resultEntry=[organizer] (sem players) → chip AUSENTE',
  chip(mkT('t7', ['organizer'], true, false), false, 'uA') === '');

// CONSISTÊNCIA: dois torneios de config idêntica → resultado idêntico (dias/ids diferentes).
(function () {
  var a = chip(mkT('cfgA', ['organizer', 'players'], true, false), false, 'uA').length > 0;
  var b = chip(mkT('cfgB', ['organizer', 'players'], true, false), false, 'uA').length > 0;
  ok('mesma config → mesmo comportamento (torneios diferentes)', a === b && a === true);
})();

console.log('═'.repeat(40));
console.log((fail === 0 ? '✅' : '❌') + ' wo-availability-canonical: ' + pass + ' ok, ' + fail + ' falharam');
if (fail > 0) process.exit(1);
