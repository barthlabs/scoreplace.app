/* Presença VERDE (checkedIn, presente) vs AZUL (checkedInConfirmed, confirmado remoto — NÃO é
 * presente). Dono, jul/2026: "presente é só o verde; confirmado não é presente". O verde vence o
 * azul (chegar no local move azul→verde). Testa o factory canônico _rollCallPresenceCtx.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { sandbox } = require('./render-harness');
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'participants.js'), 'utf8'),
  sandbox, { filename: 'participants.js' });
const W = sandbox;
W._displayName = W._displayName || function (uid, guest) { return String(guest || uid || ''); };

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── presence-green-blue ────');

function mkT() {
  return {
    id: 'T', teamSize: 1, woScope: 'individual',
    participants: [{ uid: 'uA', displayName: 'Ana', name: 'Ana' }],
    checkedIn: {}, absent: {}, checkedInConfirmed: {}
  };
}
ok(typeof W._rollCallPresenceCtx === 'function', '_rollCallPresenceCtx existe');

// (1) AZUL: uid só em checkedInConfirmed → "Confirmado", toggle azul, NÃO presente.
var t = mkT();
W._idMapSet(t, t.checkedInConfirmed, { uid: 'uA', displayName: 'Ana' }, 1000);
var ctx = W._rollCallPresenceCtx(t, { isOrg: false, active: true });
var r = ctx.cardPresence(t.participants[0]);
ok(r.rowHtml.indexOf('Confirmado') !== -1, 'azul: rótulo "Confirmado"');
ok(r.rowHtml.indexOf('#3b82f6') !== -1, 'azul: toggle azul (#3b82f6)');
ok(r.styleExtra.indexOf('59,130,246') !== -1, 'azul: card com tinta azul');

// (2) filtro: "present" ESCONDE o azul; "confirmed" MOSTRA; "confirmado não é presente".
W._checkInFilter = 'present';
ok(W._rollCallPresenceCtx(t, { active: true }).cardPresence(t.participants[0]).skip === true, "filtro 'present' esconde o confirmado (azul) — não é presente");
W._checkInFilter = 'confirmed';
ok(!W._rollCallPresenceCtx(t, { active: true }).cardPresence(t.participants[0]).skip, "filtro 'confirmed' mostra o azul");
W._checkInFilter = 'all';

// (3) VERDE vence AZUL: uid em checkedIn E checkedInConfirmed → "Presente" (verde), não azul.
var t2 = mkT();
W._idMapSet(t2, t2.checkedInConfirmed, { uid: 'uA', displayName: 'Ana' }, 1000);
W._idMapSet(t2, t2.checkedIn, { uid: 'uA', displayName: 'Ana' }, 2000);
var r2 = W._rollCallPresenceCtx(t2, { active: true }).cardPresence(t2.participants[0]);
ok(r2.rowHtml.indexOf('Presente') !== -1 && r2.rowHtml.indexOf('Confirmado') === -1, 'verde vence azul → "Presente"');
ok(r2.styleExtra.indexOf('16,185,129') !== -1, 'verde vence azul → tinta verde');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ presence-green-blue FALHOU'); process.exit(1); }
console.log('✅ presence-green-blue: OK');
