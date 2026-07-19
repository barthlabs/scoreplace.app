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

// ── Original ENCERRADO/degradado: participants[] virou slots de chave SEM uid (é o que
//    acontece de verdade num torneio finalizado — "Duplas Mistas Sorteadas"). O reset velho
//    puxava esse lixo e destruía os inscritos reais do SB. NOVO: mantém os reais do SB,
//    LIMPOS e em ORDEM de enrollSeq, dropando o placeholder-fantasma sem uid. ───────────
var origFin = { id: 'FIN', name: 'Duplas Mistas', isPublic: true, creatorUid: 'uORG',
  format: 'Eliminatórias Simples', status: 'finished',
  // participants degradados: slots de chave, sem uid nem enrollSeq
  participants: [{ p1Name: 'X', p2Name: 'Y' }, { p1Name: 'Z', p2Name: 'W' }],
  matches: [{ id: 'm1' }, { id: 'm2' }], memberUids: ['uORG', 'uA', 'uB', 'uC'] };
// SB capturou os 3 reais (enrollSeq FORA de ordem) + 1 fantasma sem uid (adição de teste).
var sbFin = { id: 'FIN_SB', name: '(SB) Duplas Mistas', isSandbox: true, sandboxOf: 'FIN',
  notificationsMuted: true, isPublic: false, sandboxOwnerUid: 'uDEV', creatorUid: 'uDEV',
  organizerEmail: 'dev@x.com', createdAt: 't0',
  participants: [
    { uid: 'uC', displayName: 'Ced', enrollSeq: 20, checkedIn: true, matchNum: 3 },
    { uid: 'uA', displayName: 'Ana', enrollSeq: 2 },
    { displayName: 'Fantasma', enrollSeq: 9 },              // sem uid = placeholder de teste
    { uid: 'uB', displayName: 'Bia', enrollSeq: 7, isStandby: true }
  ],
  matches: [{ id: 'mX' }], status: 'finished' };
W.AppStore.tournaments = [origFin, sbFin];

W._resyncSandboxRoster(sbFin);

var finUids = (sbFin.participants || []).map(function (p) { return p.uid; });
ok(sbFin.participants.length === 3, 'encerrado: mantém os 3 inscritos REAIS do SB (não os slots degradados)');
ok(finUids.indexOf('uA') !== -1 && finUids.indexOf('uB') !== -1 && finUids.indexOf('uC') !== -1, 'encerrado: os 3 reais preservados');
ok(sbFin.participants.every(function (p) { return !!p.uid; }), 'encerrado: fantasma sem uid dropado');
// ordem = enrollSeq crescente (2, 7, 20) → Ana, Bia, Ced
ok(sbFin.participants[0].uid === 'uA' && sbFin.participants[1].uid === 'uB' && sbFin.participants[2].uid === 'uC', 'encerrado: ordenado por enrollSeq (ordem de inscrição real)');
// estado de teste (presença/jogo) LIMPO nos cards do roster
ok(sbFin.participants.every(function (p) { return p.checkedIn === undefined && p.matchNum === undefined && p.isStandby === undefined; }), 'encerrado: roster limpo (sem presença/jogo/standby)');
ok(sbFin.participants[0].enrollSeq === 2, 'encerrado: enrollSeq de ORIGEM preservado (não renumerou)');
// identidade do SB preservada; original degradado intocado.
ok(sbFin.id === 'FIN_SB' && sbFin.isSandbox === true && sbFin.sandboxOf === 'FIN', 'encerrado: identidade do SB preservada');
ok(origFin.participants.length === 2 && origFin.status === 'finished', 'encerrado: original intocado');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-reset-resync FALHOU'); process.exit(1); }
console.log('✅ sandbox-reset-resync: OK');
