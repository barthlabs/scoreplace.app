'use strict';
/* Testa functions/enroll-core.js — a lógica das CFs enroll/deenroll.
 * Rodar:  node functions/test-enroll-core.js
 * Reproduz os cenários reais: inscrever num torneio ABERTO, bloquear se sorteio
 * já rolou, dedup por slot de dupla (uid do p2), e desinscrever a dupla inteira
 * quando UM membro sai. */
const C = require('./enroll-core');
const NOW = new Date('2026-07-17T12:00:00Z').getTime();

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }

// ── Inscrição num torneio aberto ─────────────────────────────────────────────
(() => {
  const data = { format: 'grupos_mata', status: 'open', creatorUid: 'org-uid-0001', participants: [] };
  const r = C.computeEnroll(data, { uid: 'nelson-uid-0001', displayName: 'Nelson Barth' }, null, NOW);
  eq('enroll aberto → outcome', r.outcome, 'enrolled');
  eq('enroll aberto → 1 participante', r.participants.length, 1);
  ok('enroll aberto → memberUids tem org+nelson',
    r.updateData.memberUids.indexOf('nelson-uid-0001') !== -1 && r.updateData.memberUids.indexOf('org-uid-0001') !== -1);
})();

// ── Já inscrito (solo, mesmo uid) ────────────────────────────────────────────
(() => {
  const data = { status: 'open', participants: [{ uid: 'nelson-uid-0001', displayName: 'Nelson' }] };
  const r = C.computeEnroll(data, { uid: 'nelson-uid-0001', displayName: 'Nelson' }, null, NOW);
  eq('já inscrito solo', r.outcome, 'already');
})();

// ── Já inscrito por SLOT de dupla (uid é o p2 de uma dupla) ───────────────────
(() => {
  const data = { status: 'open', participants: [
    { uid: 'kelly-uid', displayName: 'Kelly / Rodrigo', p1Uid: 'kelly-uid', p1Name: 'Kelly', p2Uid: 'rodrigo-uid', p2Name: 'Rodrigo' }
  ] };
  const r = C.computeEnroll(data, { uid: 'rodrigo-uid', displayName: 'Rodrigo' }, null, NOW);
  eq('já inscrito como p2 da dupla', r.outcome, 'already');
})();

// ── Inscrição bloqueada: sorteio já realizado (matches) ──────────────────────
(() => {
  const data = { status: 'active', participants: [], matches: [{ id: 1 }] };
  const r = C.computeEnroll(data, { uid: 'x-uid', displayName: 'X' }, null, NOW);
  eq('sorteio feito → closed', r.outcome, 'closed');
})();

// ── Liga com inscrição aberta permite entrar mesmo com sorteio ───────────────
(() => {
  const data = { format: 'Liga', status: 'active', ligaOpenEnrollment: true, participants: [], rounds: [{ id: 1 }] };
  const r = C.computeEnroll(data, { uid: 'y-uid', displayName: 'Y' }, null, NOW);
  eq('liga aberta com sorteio → enrolled', r.outcome, 'enrolled');
})();

// ── Capacidade cheia (modo cap) rejeita ──────────────────────────────────────
(() => {
  const data = { status: 'open', maxParticipants: 2, participants: [{ uid: 'a-uid' }, { uid: 'b-uid' }] };
  const r = C.computeEnroll(data, { uid: 'c-uid', displayName: 'C' }, null, NOW);
  eq('lotado → capacityFull', r.outcome, 'capacityFull');
})();

// ── Auto-close ao atingir o máximo ───────────────────────────────────────────
(() => {
  const data = { status: 'open', maxParticipants: 2, participants: [{ uid: 'a-uid' }] };
  const r = C.computeEnroll(data, { uid: 'b-uid', displayName: 'B' }, null, NOW);
  eq('atinge máx → enrolled', r.outcome, 'enrolled');
  eq('atinge máx → autoClose', r.autoClose, true);
  eq('atinge máx → status closed', r.updateData.status, 'closed');
})();

// ── Prazo de inscrição vencido bloqueia + fecha ──────────────────────────────
(() => {
  const data = { status: 'open', participants: [], registrationLimit: '2026-07-16T00:00:00Z' };
  const r = C.computeEnroll(data, { uid: 'z-uid', displayName: 'Z' }, null, NOW);
  eq('prazo vencido → closed', r.outcome, 'closed');
  eq('prazo vencido → grava status closed', r.updateData && r.updateData.status, 'closed');
})();

// ── Desinscrição self (solo) ─────────────────────────────────────────────────
(() => {
  const data = { status: 'open', participants: [{ uid: 'nelson-uid' }, { uid: 'other-uid' }] };
  const r = C.computeDeenroll(data, 'nelson-uid');
  eq('deenroll solo → deenrolled', r.outcome, 'deenrolled');
  eq('deenroll solo → sobra 1', r.participants.length, 1);
  eq('deenroll solo → sobrou other', r.participants[0].uid, 'other-uid');
})();

// ── Desinscrição de UM membro remove a dupla inteira ─────────────────────────
(() => {
  const data = { status: 'open', participants: [
    { uid: 'kelly-uid', displayName: 'Kelly / Rodrigo', p1Uid: 'kelly-uid', p2Uid: 'rodrigo-uid' },
    { uid: 'solo-uid' }
  ] };
  const r = C.computeDeenroll(data, 'rodrigo-uid');
  eq('deenroll p2 da dupla → remove a dupla', r.participants.length, 1);
  eq('deenroll p2 → sobra o solo', r.participants[0].uid, 'solo-uid');
})();

// ── Desinscrição de quem não está → notFound ─────────────────────────────────
(() => {
  const data = { status: 'open', participants: [{ uid: 'a-uid' }] };
  const r = C.computeDeenroll(data, 'ghost-uid');
  eq('deenroll ausente → notFound', r.outcome, 'notFound');
  eq('deenroll ausente → participants intactos', r.participants.length, 1);
})();

// ── Guest string legada não quebra e não é removido por uid ──────────────────
(() => {
  const data = { status: 'open', participants: ['Fulano Guest', { uid: 'a-uid' }] };
  const r = C.computeDeenroll(data, 'a-uid');
  eq('deenroll mantém guest string', r.participants.length, 1);
  eq('deenroll mantém guest string (valor)', r.participants[0], 'Fulano Guest');
})();

console.log('\nenroll-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
