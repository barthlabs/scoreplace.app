/* Sandbox (SB) — Resetar re-sincroniza com o original AGORA (Etapa 4b): dropa as adições de
 * teste (dupla formada / +participante / placeholder) e puxa o roster atual do original,
 * PRESERVANDO a identidade/isolamento do SB. "SB tal qual o original no momento do reset."
 *
 * Reproduz a falha: no código velho o reset só limpava o sorteio e MANTINHA os inscritos do
 * SB (incluindo o lixo de teste) e não puxava o que mudou no original. NOVO: _resyncSandboxRoster.
 */
const { sandbox: W } = require('./render-harness');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── sandbox-reset-resync ────');

ok(typeof W._resyncSandboxRoster === 'function', '_resyncSandboxRoster existe (falha no velho)');

// original evoluiu: agora tem A, B, C (C entrou depois do SB nascer).
var orig = { id: 'ORIG', name: 'Copa', isPublic: true, creatorUid: 'uORG', format: 'Eliminatórias Simples',
  participants: [{ uid: 'uA', displayName: 'Ana' }, { uid: 'uB', displayName: 'Bia' }, { uid: 'uC', displayName: 'Ced' }],
  memberUids: ['uORG', 'uA', 'uB', 'uC'] };
// SB: clone antigo (A,B) + lixo de teste (dupla TESTE) + já sorteado.
var sb = { id: 'ORIG_SB', name: '(SB) Copa', isSandbox: true, sandboxOf: 'ORIG',
  notificationsMuted: true, isPublic: false, sandboxOwnerUid: 'uDEV', creatorUid: 'uDEV',
  organizerEmail: 'dev@x.com', createdAt: 't0',
  participants: [{ uid: 'uA', displayName: 'Ana' }, { uid: 'uB', displayName: 'Bia' }, { uid: 'uTEST', displayName: 'Teste' }],
  memberUids: ['uDEV', 'uA', 'uB', 'uTEST'], matches: [{ id: 'm1', p1: 'Ana', p2: 'Bia' }], status: 'active' };
W.AppStore.tournaments = [orig, sb];

W._resyncSandboxRoster(sb);

// roster puxado do original AGORA (A,B,C); lixo de teste (uTEST) sumiu.
var uids = (sb.participants || []).map(function (p) { return p.uid; });
ok(uids.indexOf('uC') !== -1, 'puxou o novo inscrito do original (uC)');
ok(uids.indexOf('uTEST') === -1, 'dropou a adição de teste (uTEST)');
ok(sb.participants.length === 3, 'roster = o do original (3 pessoas)');
ok(!sb.matches || sb.matches.length === 0 ? true : sb.matches.every(function () { return false; }), 'roster do original não traz o sorteio de teste');

// identidade/isolamento do SB PRESERVADOS.
ok(sb.id === 'ORIG_SB', 'id do SB preservado');
ok(String(sb.name).indexOf('(SB) ') === 0, 'nome (SB) preservado');
ok(sb.isSandbox === true, 'isSandbox preservado');
ok(sb.sandboxOf === 'ORIG', 'sandboxOf preservado');
ok(sb.notificationsMuted === true, 'notificações mudas preservadas');
ok(sb.isPublic === false, 'privado preservado');
ok(sb.creatorUid === 'uDEV', 'dev segue creator');
ok(sb.memberUids.indexOf('uDEV') !== -1, 'dev no memberUids');

// original NÃO tocado.
ok(orig.participants.length === 3 && orig.creatorUid === 'uORG' && orig.isPublic === true, 'original intocado');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-reset-resync FALHOU'); process.exit(1); }
console.log('✅ sandbox-reset-resync: OK');
