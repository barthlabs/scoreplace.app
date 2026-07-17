/* Formar dupla na lista de espera — o nome de cada membro vem do UID (ao vivo).
 *
 * CÂNONE (dono): identidade é uid; o nome é puxado do perfil AO VIVO. O pXName gravado é só
 * fallback do guest SEM conta. Entrada COM uid tem o nome stripado no save → o card da dupla
 * NÃO pode ler p2Name cru (String(undefined) = "undefined"): tem que resolver pelo uid.
 *
 * Reproduz: tonho SEM uid (nome é a identidade) + Leila COM uid e p2Name vazio (stripado).
 * Velho: card mostrava "tonho / undefined". Novo: "tonho / Leila".
 *
 * node tests/late-join-name-uid.test.js
 */
const W = require('./render-harness').window;

// nome ao vivo por uid: só Leila tem conta; tonho é guest (sem uid).
W._displayNameForUid = function (uid, fb) { return uid === 'leila-uid' ? 'Leila' : (fb || ''); };
if (!W._getWaitlist) W._getWaitlist = function (t) { return Array.isArray(t.standbyParticipants) ? t.standbyParticipants.slice() : []; };

let pass = 0, fail = 0;
const ok = (n, c, got) => { if (c) { pass++; console.log('  ✓ ' + n + (got !== undefined ? ' — ' + got : '')); } else { fail++; console.log('  ✗ ' + n + (got !== undefined ? ' — ' + got : '')); } };

console.log('\n🤝 Nome da dupla tardia pelo uid (nunca "undefined")\n');
ok('_renderLateJoinPairing existe', typeof W._renderLateJoinPairing === 'function');

// Dupla formada: tonho (guest, sem uid, nome guardado) + Leila (uid, p2Name STRIPADO/undefined)
const t = {
  id: 't1',
  standbyParticipants: [
    { p1Name: 'tonho', p1Uid: '', p2Name: undefined, p2Uid: 'leila-uid',
      displayName: 'tonho / ', name: 'tonho / ', _lateJoin: true }
  ]
};
const html = W._renderLateJoinPairing(t, true);

ok('render não é vazio', html && html.length > 0);
ok('mostra "tonho" (guest, pelo nome guardado)', html.indexOf('>tonho<') !== -1 || html.indexOf('tonho') !== -1);
ok('mostra "Leila" (resolvido pelo uid)', html.indexOf('Leila') !== -1);
ok('NÃO mostra "undefined" no card', html.indexOf('undefined') === -1, html.indexOf('undefined') !== -1 ? 'apareceu!' : 'limpo');

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' passaram · ' + fail + ' falharam\n');
process.exit(fail ? 1 : 0);
