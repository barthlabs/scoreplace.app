/* Card de autopresença do PRÓPRIO participante no detalhe (dono, jul/2026): ponto de entrada
 * pré/pós-sorteio pro inscrito COMUM ligar a própria presença (toggle → _applySelfPresence,
 * verde/azul pelo GPS). Autoridade (org/co-org/árbitro) NÃO vê o card — marca pela chamada.
 *
 * Reproduz a falha: no código VELHO o participante comum não tinha entry point pré-sorteio
 * (a chamada só aparecia pra org). NOVO: _myPresenceCard rende o toggle pra ele.
 */
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── my-presence-card ────');

function mkT() {
  return {
    id: 'T1', teamSize: 1, status: 'open',
    participants: [{ uid: 'uA', displayName: 'Ana', name: 'Ana' }],
    memberUids: ['uA'], checkedIn: {}, absent: {}, checkedInConfirmed: {}
  };
}

ok(typeof W._myPresenceCard === 'function', '_myPresenceCard existe (falha no código velho)');

// (1) inscrito COMUM (não autoridade) → card com toggle chamando _applySelfPresence.
W.AppStore.currentUser = { uid: 'uA', displayName: 'Ana' };
W._isUserEnrolledInTournament = function () { return true; };
W._canManagePresence = function () { return false; };
var html = W._myPresenceCard(mkT());
ok(html && html.indexOf('Sua presença') !== -1, '1: participante comum vê "Sua presença"');
ok(html.indexOf('_applySelfPresence') !== -1, '1: toggle chama _applySelfPresence');
ok(html.indexOf('toggle-switch') !== -1, '1: usa o toggle canônico');

// (2) estado VERDE (presente) → toggle marcado + rótulo "Presente".
var tG = mkT();
W._idMapSet(tG, tG.checkedIn, { uid: 'uA', displayName: 'Ana' }, 1);
var hG = W._myPresenceCard(tG);
ok(hG.indexOf('checked') !== -1, '2: verde → toggle checked');
ok(hG.indexOf('Presente') !== -1, '2: verde → rótulo "Presente"');

// (3) estado AZUL (confirmado) → toggle marcado + rótulo "Confirmado".
var tB = mkT();
W._idMapSet(tB, tB.checkedInConfirmed, { uid: 'uA', displayName: 'Ana' }, 1);
var hB = W._myPresenceCard(tB);
ok(hB.indexOf('checked') !== -1, '3: azul → toggle checked');
ok(hB.indexOf('Confirmado') !== -1, '3: azul → rótulo "Confirmado"');

// (4) AUTORIDADE (org) NÃO vê o card — marca pela chamada.
W._canManagePresence = function () { return true; };
ok(W._myPresenceCard(mkT()) === '', '4: autoridade não vê o card (usa a chamada)');
W._canManagePresence = function () { return false; };

// (5) NÃO inscrito → sem card.
W._isUserEnrolledInTournament = function () { return false; };
ok(W._myPresenceCard(mkT()) === '', '5: não inscrito → sem card');
W._isUserEnrolledInTournament = function () { return true; };

// (6) torneio ENCERRADO → sem card.
var tF = mkT(); tF.status = 'finished';
ok(W._myPresenceCard(tF) === '', '6: torneio encerrado → sem card');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ my-presence-card FALHOU'); process.exit(1); }
console.log('✅ my-presence-card: OK');
