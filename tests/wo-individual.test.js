/* W.O. INDIVIDUAL — o alvo é a PESSOA, nunca a dupla.
 *
 * REPRODUZ O CASO REAL (staging, jul/2026 — "Torneio de Férias só Casais"): com o toggle
 * `woScope: 'individual'` LIGADO, o botão W.O. do card do jogo oferecia "2 duplas" e o W.O.
 * caía no TIME inteiro; os suplentes nunca assumiam — na prática viravam excluídos.
 * Dono: _"numa dupla são duas pessoas... precisa apresentar os participantes individualmente
 * considerados para darmos W.O. em apenas um da dupla de cada vez. O individual pressupõe
 * que no momento do W.O. não é do time todo sem escolha."_
 *
 * CAUSA: `wo-claim.js` montava os alvos como `[m.p1, m.p2]` — os dois LADOS. O motor
 * (`_applyWO`) não tinha culpa: `isIndividualWO` exige que o absentName seja o MEMBRO
 * (`entryStr !== absentName`) e recebia a dupla inteira → fazia W.O. de time, obedecendo.
 *
 * Este teste usa os arquivos REAIS (identity-core + bracket-logic + wo-claim) com uid de
 * verdade — nada de stub de identidade por nome, que é justamente o que esconde o bug.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.console = console;
sandbox.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), addEventListener() {}, body: {} };
sandbox.location = { hash: '' };
sandbox.navigator = { userAgent: 'node' };
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox._t = (k) => k;
sandbox._warn = sandbox._log = sandbox._error = sandbox._debug = () => {};
sandbox._safeHtml = sandbox._safeText = (s) => String(s == null ? '' : s);
sandbox.showNotification = () => {};
sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
vm.createContext(sandbox);

const ROOT = path.join(__dirname, '..', 'js', 'views');
const load = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });

// Perfis vivos por uid — o display resolve por uid (o doc não guarda nome de quem tem conta).
const NAMES = { a1: 'Ana', b1: 'Bia', a2: 'Caio', b2: 'Duda', s1: 'Luiza', s2: 'Marcia' };
sandbox._profileNameByUid = NAMES;
sandbox._nameForUid = (u) => NAMES[u] || '';
sandbox._displayNameForUid = (u, stored) => NAMES[u] || stored || '';

load('identity-core.js');   // _participantUids / _idMap* / _entryHasVip — o cânone de uid
load('bracket-logic.js');   // _slotUids (team*Uids → p*Uid)
load('wo-claim.js');        // _woMatchMembers — o alvo do W.O.

let pass = 0, fail = 0;
const ok = (name, cond, got) => {
  if (cond) { pass++; console.log('  ✓ ' + name + (got !== undefined ? ' — ' + got : '')); }
  else { fail++; console.log('  ✗ ' + name + (got !== undefined ? ' — ' + got : '')); }
};

// ── Cenário: jogo de DUPLAS, 4 pessoas, slots com uid (como o motor grava) ────
function mkT(woScope) {
  return {
    id: 'T', name: 'só Casais', format: 'Eliminatórias Simples',
    enrollmentMode: 'teams', teamSize: 2, woScope: woScope || 'individual',
    participants: [
      { p1Uid: 'a1', p2Uid: 'b1' },   // forma REAL do doc: só uid, sem nome
      { p1Uid: 'a2', p2Uid: 'b2' },
    ],
    // 2 suplentes (as "Luiza/Marcia" da lista de espera do caso real)
    standbyParticipants: [{ uid: 's1' }, { uid: 's2' }],
    waitlist: [], checkedIn: {}, absent: {}, matches: [], vips: {},
  };
}
const mkMatch = () => ({
  id: 'm1', round: 1, p1: 'Ana / Bia', p2: 'Caio / Duda',
  team1Uids: ['a1', 'b1'], team2Uids: ['a2', 'b2'], winner: null,
});

console.log('\n═══ W.O. individual: o alvo é a PESSOA ═══\n');

// ── 1. O ALVO — o que a tela oferece ─────────────────────────────────────────
console.log('Alvos do W.O. num jogo de duplas (woScope individual):');
{
  const t = mkT('individual');
  const members = sandbox._woMatchMembers(t, mkMatch());
  ok('oferece 4 PESSOAS, não 2 duplas', members.length === 4,
     members.length + ' alvos: ' + members.map((m) => m.name).join(', '));
  ok('cada alvo carrega o uid da pessoa',
     members.every((m) => m.uids.length === 1 && !!m.uids[0]),
     members.map((m) => m.name + '=' + m.uids.join('+')).join(' | '));
  ok('nenhum alvo é o rótulo da dupla',
     !members.some((m) => String(m.name).indexOf('/') !== -1));
  ok('os 4 uids são os dos slots',
     members.map((m) => m.uids[0]).sort().join(',') === 'a1,a2,b1,b2');
}

// ── 2. woScope 'team' continua oferecendo os LADOS (é o outro modo, e é válido) ──
console.log('\nCom o toggle em TIME, o alvo volta a ser o lado (comportamento correto):');
{
  const t = mkT('team');
  const members = sandbox._woMatchMembers(t, mkMatch());
  ok('oferece os 2 lados', members.length === 2, members.map((m) => m.name).join(' | '));
  ok('o lado carrega os 2 uids', members[0].uids.length === 2, members[0].uids.join('+'));
}

// ── 3. TBD/BYE nunca é alvo ──────────────────────────────────────────────────
console.log('\nLado indefinido não é apontável:');
{
  const t = mkT('individual');
  const m = mkMatch(); m.p2 = 'TBD'; m.team2Uids = [];
  const members = sandbox._woMatchMembers(t, m);
  ok('só as 2 pessoas do lado definido', members.length === 2, members.map((x) => x.name).join(' | '));
}

// ── 4. Guest/fictício (sem uid) — a exceção canônica ─────────────────────────
// Sem uid não há pessoa a apontar individualmente: o lado fica como alvo único.
console.log('\nDupla com guest (sem conta) — exceção canônica:');
{
  const t = mkT('individual');
  const m = mkMatch(); m.team1Uids = ['a1']; // só 1 dos 2 tem conta
  const members = sandbox._woMatchMembers(t, m);
  const nomes = members.map((x) => x.name);
  ok('o lado com guest não é decomposto (fica o lado)', nomes.indexOf('Ana / Bia') !== -1,
     nomes.join(' | '));
  ok('o lado 100% com conta segue decomposto', nomes.indexOf('Caio') !== -1 && nomes.indexOf('Duda') !== -1);
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ` wo-individual: ${pass} ok, ${fail} falharam\n`);
process.exit(fail === 0 ? 0 : 1);
