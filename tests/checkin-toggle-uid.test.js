/* Check-in é gravado por UID e SÓ uid (dono, 18-jul: "uid only! não pode gravar nada além do
 * uid"). O toggle "Presente" (`_applyCheckInToggle(tId, name, uid)`) recebe o uid do render e
 * chaveia t.checkedIn por ELE — homônimos não colidem.
 *
 * FALHA que este teste reproduz: dois "Rodrigo" (uR1, uR2). Marcar o SEGUNDO presente sem o uid
 * (comportamento antigo, só nome) resolve `_memberUidByName('Rodrigo')` → uR1 → grava a presença
 * na PESSOA ERRADA (uR1). Com o uid (uR2) o write vai pra chave certa. O caminho antigo fica
 * evidenciado (grava uR1); o novo passa.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');

// participants.js define _toggleCheckIn/_applyCheckInToggle/_applyWoSubsToTournament — não é
// carregado pela render-harness (que traz store/tournaments/bracket/identity-core). Carrega por cima.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8'),
  sandbox, { filename: 'participants.js' });
const W = sandbox;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── checkin-toggle-uid ────');

const mkT = () => ({
  id: 'T', format: 'Eliminatórias Simples', teamSize: 1, status: 'active',
  participants: [
    { uid: 'uR1', displayName: 'Rodrigo', name: 'Rodrigo' },
    { uid: 'uR2', displayName: 'Rodrigo', name: 'Rodrigo' },
    { uid: 'uAna', displayName: 'Ana', name: 'Ana' }
  ],
  checkedIn: {}, absent: {}, matches: []
});
let t = mkT();
W.AppStore.tournaments = [t];
W.AppStore.currentUser = { uid: 'org', displayName: 'Org' };
W.AppStore.mutate = function (tId, fn) { fn(t); return { then: function (cb) { cb && cb(); return { catch: function () {} }; } }; };
W._findTournamentById = function () { return t; };
W._canManagePresence = function () { return true; };            // autoridade → grava direto
W._reRenderParticipants = function () {};
W.showNotification = function () {};

ok(typeof W._applyCheckInToggle === 'function', '_applyCheckInToggle existe');
ok(W._memberUidByName(t, 'Rodrigo') === 'uR1', 'por-nome resolve o 1º homônimo (uR1) — a armadilha');

// (1) FIX: marcar o 2º Rodrigo presente COM o uid → grava a chave-UID certa (uR2), nada mais.
W._applyCheckInToggle('T', 'Rodrigo', 'uR2');
ok(t.checkedIn.uR2 != null, 'presença gravada na chave-uid do 2º Rodrigo (uR2)');
ok(t.checkedIn.uR1 == null, 'NÃO tocou o homônimo errado (uR1)');
ok(t.checkedIn.Rodrigo == null, 'NÃO gravou chave-nome ("Rodrigo") — nada além do uid');
ok(Object.keys(t.checkedIn).length === 1, 'exatamente uma chave (o uid) no mapa');

// (2) toggle OFF com o mesmo uid remove a presença
W._applyCheckInToggle('T', 'Rodrigo', 'uR2');
ok(t.checkedIn.uR2 == null, 'toggle off pelo uid remove a presença (uR2)');

// (3) REPRODUÇÃO da falha: SEM uid (comportamento antigo), o nome resolve o 1º homônimo → grava
//     na pessoa ERRADA (uR1) em vez do 2º Rodrigo que se quis marcar.
t = mkT(); W.AppStore.tournaments = [t];
W._applyCheckInToggle('T', 'Rodrigo');            // sem uid → caminho por nome
ok(t.checkedIn.uR1 != null, 'sem uid: nome cai no 1º homônimo (uR1) — a pessoa ERRADA');
ok(t.checkedIn.uR2 == null, 'sem uid: o 2º Rodrigo (uR2) fica sem presença — a falha que o uid corrige');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ checkin-toggle-uid FALHOU'); process.exit(1); }
console.log('✅ checkin-toggle-uid: OK');
