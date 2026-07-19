/* GATE DE APROVAÇÃO DE RESULTADO — node tests/result-approval-gate.test.js
 *
 * Congela `_resultNeedsApproval` (bracket-ui.js REAL) — a DECISÃO que dispara (ou não) o fluxo
 * de aprovação por participantes (4 fases: proposta→counter→confirma/contesta→org, memória
 * project_resultado_participantes). É a porta de entrada: só entra no fluxo quando
 *   • `resultEntry` permite players ('players' | 'all' | array contendo 'players'); E
 *   • o usuário é PARTICIPANTE do jogo (não organizador/co-host); E
 *   • o adversário existe (não TBD/BYE) e TEM uid (alguém pra aprovar); E
 *   • o resultado não está em disputa (disputed → só o organizador lança).
 *
 * Obs: a ORQUESTRAÇÃO das 4 fases (_notifyPendingApproval/_contestResult/_approveResult) é
 * acoplada a AppStore/Firestore/DOM → fica pra camada 2 (Playwright). store.js NÃO carrega no
 * harness (trava no load por DOM), então o gate roda direto.
 * CANÔNICO (dono, 18/jul): a resolução de lado é SÓ pelo UID do SLOT (window._slotUids —
 * team*Uids/p*Uid/team*Obj), nunca casando nome. Os matches reais carregam uid no slot
 * (verificado no doc de prod: team1Obj com p1Uid/p2Uid) — o fixture reflete isso.
 */
const H = require('./headless.js');
H.load('bracket-ui.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const A = { displayName: 'Ana', uid: 'uA' };
const B = { displayName: 'Bia', uid: 'uB' };
function tour(resultEntry, parts) {
  return { id: 't', resultEntry: resultEntry, creatorUid: 'ORG', participants: parts || [A, B] };
}
// SLOT carrega o uid (p1Uid/p2Uid) — como o sorteio grava. Resolução = uid, não nome.
const matchAB = { id: 'm', p1: 'Ana', p2: 'Bia', p1Uid: 'uA', p2Uid: 'uB', winner: null };
const need = (t, m, u) => W._resultNeedsApproval(t, m, u);

// ── resultEntry: quem pode lançar ──────────────────────────────────────────
ok(need(tour('players'), matchAB, { uid: 'uA' }) === true, "[resultEntry] 'players' + participante → precisa aprovação");
ok(need(tour('all'), matchAB, { uid: 'uA' }) === true, "[resultEntry] 'all' → players podem lançar → aprovação");
ok(need(tour(['players']), matchAB, { uid: 'uA' }) === true, "[resultEntry] array ['players'] → aprovação");
ok(need(tour('organizer'), matchAB, { uid: 'uA' }) === false, "[resultEntry] 'organizer' → players NÃO lançam → sem aprovação");

// ── papel do usuário ───────────────────────────────────────────────────────
ok(need(tour('players'), matchAB, { uid: 'ORG' }) === false, '[papel] organizador lança direto (sem aprovação)');
ok(need(tour('players'), matchAB, { uid: 'uZ' }) === false, '[papel] usuário fora do jogo → sem aprovação');
ok(need(tour('players'), matchAB, null) === false, '[papel] sem usuário → false');

// ── adversário precisa existir e ter uid NO SLOT ───────────────────────────
ok(need(tour('players'), { id: 'm', p1: 'Ana', p2: 'Bia', p1Uid: 'uA', winner: null }, { uid: 'uA' }) === false, '[adversário] slot sem uid (informal) → ninguém pra aprovar → false');
ok(need(tour('players'), { id: 'm', p1: 'Ana', p2: 'TBD', p1Uid: 'uA' }, { uid: 'uA' }) === false, '[adversário] TBD → false');
ok(need(tour('players'), { id: 'm', p1: 'Ana', p2: 'BYE', p1Uid: 'uA' }, { uid: 'uA' }) === false, '[adversário] BYE → false');

// ── disputa: trava participantes (só organizador lança) ────────────────────
ok(need(tour('players'), { id: 'm', p1: 'Ana', p2: 'Bia', p1Uid: 'uA', p2Uid: 'uB', pendingResult: { disputed: true } }, { uid: 'uA' }) === false,
  '[disputa] resultado em disputa → participantes bloqueados (só org)');

// ── guarda de args ─────────────────────────────────────────────────────────
ok(need(null, matchAB, { uid: 'uA' }) === false, '[args] sem torneio → false');
ok(need(tour('players'), null, { uid: 'uA' }) === false, '[args] sem match → false');

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' result-approval-gate: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
