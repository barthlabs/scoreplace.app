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

/* ── Original ENCERRADO/degradado: participants[] virou slots de chave SEM uid ─────────
 * ⚠️ ESTE BLOCO MUDOU DE LADO NA 2.1.86, e o motivo é uma ordem do dono (01/set/2026):
 *   _"O sandbox é uma réplica fiel do original. […] Não é permitido simplificar, limpar,
 *    reconstruir, normalizar, reduzir ou substituir participantes, inscrições, member
 *    state, jogos, resultados, fases, rankings, classificações congeladas, W.O., espera,
 *    histórico, barras, progresso ou chaves."_
 *
 * O que este bloco EXIGIA antes era exatamente isso: com o original degradado, o resync
 * mantinha os inscritos que o SB tinha capturado, DESMONTAVA duplas de teste em pessoas,
 * DROPAVA o placeholder sem uid e REORDENAVA por enrollSeq. Era uma reconstrução — bem
 * intencionada (proteger gente real que só existia no SB), mas uma reconstrução, e ela
 * produzia um sandbox que NÃO era o original: divergia em participantes, espera e ordem.
 *
 * ⭐ Agora o resync copia o original COMO ELE ESTÁ. Se o original está degradado, a réplica
 * fica degradada igual — que é o que "réplica fiel" quer dizer. O isolamento (id, sandboxOf,
 * mudez, privacidade, dono) continua preservado, e é isso que este bloco passa a medir.
 * ⚠️ A perda que a versão antiga evitava é REAL e fica registrada: um SB de torneio
 * encerrado perde os inscritos que só existiam nele. Se um dia isso incomodar, a saída NÃO
 * é reconstruir aqui — é o SB não ressincronizar com original degradado. */
var origFin = { id: 'FIN', name: 'Duplas Mistas', isPublic: true, creatorUid: 'uORG',
  format: 'Eliminatórias Simples', status: 'finished', enrollmentMode: 'individual', teamSize: 2,
  participants: [{ p1Name: 'X', p2Name: 'Y' }, { p1Name: 'Z', p2Name: 'W' }],
  waitlist: [{ uid: 'uEsp', displayName: 'Espera' }],
  standbyParticipants: [{ uid: 'uSup', displayName: 'Suplente' }],
  matches: [{ id: 'm1' }, { id: 'm2' }], memberUids: ['uORG', 'uA', 'uB', 'uC', 'uD'] };
var sbFin = { id: 'FIN_SB', name: '(SB) Duplas Mistas', isSandbox: true, sandboxOf: 'FIN',
  notificationsMuted: true, isPublic: false, sandboxOwnerUid: 'uDEV', creatorUid: 'uDEV',
  organizerEmail: 'dev@x.com', createdAt: 't0', enrollmentMode: 'individual', teamSize: 2,
  participants: [
    { uid: 'uC', displayName: 'Ced', enrollSeq: 20, checkedIn: true, matchNum: 3 },
    { p1Uid: 'uA', p1Name: 'Ana', p1Seq: 2, p2Uid: 'uD', p2Name: 'Duda', p2Seq: 5 },
    { displayName: 'Fantasma', enrollSeq: 9 },
    { uid: 'uB', displayName: 'Bia', enrollSeq: 7, isStandby: true }
  ],
  waitlist: [], standbyParticipants: [],
  matches: [{ id: 'mX' }], status: 'finished', teamOrigins: { 'Ana / Duda': 'manual' } };
W.AppStore.tournaments = [origFin, sbFin];

W._resyncSandboxRoster(sbFin);

var _c = function (v) { return JSON.stringify(v === undefined ? null : v); };
ok(_c(sbFin.participants) === _c(origFin.participants),
  '⭐⭐ réplica fiel: participants IDÊNTICO ao do original (nada desmontado, dropado ou reordenado)');
ok(_c(sbFin.waitlist) === _c(origFin.waitlist),
  '⭐⭐ a ESPERA veio do original (o resync não zera mais)');
ok(_c(sbFin.standbyParticipants) === _c(origFin.standbyParticipants),
  '⭐⭐ e os SUPLENTES também');
ok(sbFin.participants.some(function (p) { return p.p1Name === 'X'; }),
  'encerrado: o slot degradado do original passou como está (não foi "limpo")');
ok(sbFin.id === 'FIN_SB' && sbFin.isSandbox === true && sbFin.sandboxOf === 'FIN', 'encerrado: identidade do SB preservada');
ok(sbFin.notificationsMuted === true && sbFin.isPublic === false, 'encerrado: isolamento preservado');
ok(sbFin.memberUids.indexOf('uDEV') !== -1 && sbFin.memberUids.indexOf('uA') === -1,
  'encerrado: memberUids segue sendo ESCOPO de entrega (só o dev)');
ok(sbFin._semPesados === undefined && sbFin._nPartes === undefined,
  '⛔ encerrado: o resync também nasce INTEIRO (não promete partes que ninguém escreve)');
ok(origFin.participants.length === 2 && origFin.status === 'finished', 'encerrado: original intocado');

// ── Torneio de DUPLAS FIXAS (Casais, enrollmentMode='teams'): a dupla É a unidade de
//    inscrição → o reset PRESERVA os pares (não desmonta como no individual). ───────────
var origTeam = { id: 'CAS', name: 'Casais', isPublic: true, creatorUid: 'uORG',
  format: 'Eliminatórias Simples', status: 'open', enrollmentMode: 'teams', teamSize: 2,
  participants: [
    { p1Uid: 'uP1', p1Name: 'Pedro', p1Seq: 1, p2Uid: 'uP2', p2Name: 'Paula', p2Seq: 2 },
    { uid: 'uSolo', displayName: 'Solo', enrollSeq: 3 } // solo esperando parceiro — legítimo
  ], memberUids: ['uORG', 'uP1', 'uP2', 'uSolo'] };
var sbTeam = { id: 'CAS_SB', name: '(SB) Casais', isSandbox: true, sandboxOf: 'CAS',
  notificationsMuted: true, isPublic: false, sandboxOwnerUid: 'uDEV', creatorUid: 'uDEV',
  organizerEmail: 'dev@x.com', createdAt: 't0', enrollmentMode: 'teams', teamSize: 2,
  participants: [], status: 'active', matches: [{ id: 'mT' }] };
W.AppStore.tournaments = [origTeam, sbTeam];
W._resyncSandboxRoster(sbTeam);
// ⭐ Aqui o par é preservado porque NADA é reconstruído — a cópia é fiel por definição.
var pairKept = (sbTeam.participants || []).some(function (p) { return p.p1Uid === 'uP1' && p.p2Uid === 'uP2'; });
ok(pairKept, 'casais (teams): dupla FIXA preservada como par (não desmontou)');
ok((sbTeam.participants || []).some(function (p) { return p.uid === 'uSolo'; }), 'casais: solo esperando parceiro preservado');
ok(sbTeam.participants.length === 2, 'casais: 2 entradas (1 dupla + 1 solo)');
ok(JSON.stringify(sbTeam.participants) === JSON.stringify(origTeam.participants),
  '⭐⭐ casais: participants IDÊNTICO ao do original');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ sandbox-reset-resync FALHOU'); process.exit(1); }
console.log('✅ sandbox-reset-resync: OK');
