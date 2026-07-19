/* CHAMADA (roll-call) de DUPLAS aparece DIRETO no detalhe do torneio (dono, 19-jul). A seção
 * canônica _buildDoublesInscritosSection (tournaments.js) só mostra os toggles Presente/Ausente +
 * W.O. quando o CALLER passa ctx.cardPresence/ctx.memberPresence. O #participants passava; o
 * DETALHE não → duplas sem chamada no detalhe. Agora o detalhe passa o factory canônico
 * window._rollCallPresenceCtx (participants.js), reusado nas duas telas (DRY).
 *
 * FALHA que este teste reproduz: sem o ctx, o HTML da seção NÃO tem _toggleCheckIn (o que o
 * detalhe fazia). Com o factory, o toggle + W.O. + filtro por presença aparecem.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');

// _rollCallPresenceCtx vive em participants.js (não carregado pela render-harness). Carrega por cima.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8'),
  sandbox, { filename: 'participants.js' });
const W = sandbox;
W._displayName = W._displayName || function (uid, guest) { return String(guest || uid || ''); };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── detail-doubles-rollcall ────');

function mkT() {
  return {
    id: 'DUP', teamSize: 2, enrollmentMode: 'teams', status: 'open', woScope: 'individual',
    participants: [
      { p1Uid: 'uA', p1Name: 'Ana', p2Uid: 'uB', p2Name: 'Bia' }, // dupla formada
      { uid: 'uC', displayName: 'Carla', name: 'Carla' },          // solo (sem dupla)
      { uid: 'uD', displayName: 'Duda', name: 'Duda' }             // solo (sem dupla)
    ],
    checkedIn: {}, absent: {}
  };
}
var t = mkT();
W.AppStore.tournaments = [t];
W._checkInFilter = 'all';

ok(typeof W._buildDoublesInscritosSection === 'function', '_buildDoublesInscritosSection existe');
ok(typeof W._rollCallPresenceCtx === 'function', '_rollCallPresenceCtx (factory) existe');

// (1) SEM ctx de presença (o detalhe ANTIGO): a seção de duplas renderiza mas NÃO tem toggle.
var dNo = W._buildDoublesInscritosSection(t, { isOrg: true, drawDone: false, chrome: true });
ok(dNo && dNo.isDoubles, 'seção de duplas renderiza (pré-sorteio)');
ok(dNo.html.indexOf('_toggleCheckIn') === -1, 'SEM ctx: nenhum toggle de presença — a falha do detalhe');

// (2) COM o factory: toggle Presente/Ausente + W.O. aparecem (chamada no detalhe).
var ctx = W._rollCallPresenceCtx(t, { isOrg: true, active: true, woScope: 'individual' });
var dYes = W._buildDoublesInscritosSection(t, { isOrg: true, drawDone: false, chrome: true, cardPresence: ctx.cardPresence, memberPresence: ctx.memberPresence });
ok(dYes.html.indexOf('_toggleCheckIn') !== -1, 'COM factory: toggle de presença aparece');
ok(dYes.html.indexOf('_markAbsent') !== -1, 'COM factory: botão W.O. aparece');
ok(dYes.html.indexOf("_toggleCheckIn('DUP', 'Carla', 'uC')") !== -1, 'toggle do solo Carla leva o uid (uC)');

// (3) filtro 'present' com ninguém presente → esconde os solos não-presentes.
t = mkT(); W.AppStore.tournaments = [t]; W._checkInFilter = 'present';
var ctxP = W._rollCallPresenceCtx(t, { isOrg: true, active: true });
var dP = W._buildDoublesInscritosSection(t, { isOrg: true, drawDone: false, chrome: true, cardPresence: ctxP.cardPresence, memberPresence: ctxP.memberPresence });
ok(dP.html.indexOf('Carla') === -1, "filtro 'present' esconde solo não-presente (Carla)");

// (4) marca Carla presente por UID → filtro 'present' passa a mostrá-la.
W._idMapSet(t, t.checkedIn, { uid: 'uC', displayName: 'Carla' }, 1000);
var ctxP2 = W._rollCallPresenceCtx(t, { isOrg: true, active: true });
var dP2 = W._buildDoublesInscritosSection(t, { isOrg: true, drawDone: false, chrome: true, cardPresence: ctxP2.cardPresence, memberPresence: ctxP2.memberPresence });
ok(dP2.html.indexOf('Carla') !== -1, "Carla presente (uid uC) aparece no filtro 'present'");
W._checkInFilter = 'all';

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ detail-doubles-rollcall FALHOU'); process.exit(1); }
console.log('✅ detail-doubles-rollcall: OK');
