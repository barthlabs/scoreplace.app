'use strict';
/* Testa functions/cohost-core.js — resposta a convite de co-organização/transferência.
 * Rodar:  node functions/test-cohost-core.js
 *
 * TRAVA DE REGRESSÃO (o bug real, Sentry SCOREPLACE-WEB-6R): aceitar convite de co-host
 * MUDA adminUids (o uid do co-host entra ao virar 'active'). Era isso que estourava a
 * regra `isCoHostAcceptanceDiff` (hasOnly(['coHosts','adminEmails'])) e dava
 * permission-denied determinístico pra todo convidado COM conta. O teste abaixo afirma
 * que adminUids muda de fato — se alguém "consertar" devolvendo o aceite pro cliente sob
 * aquela regra, este teste continua verde mas o cânone fica documentado no updateData.
 *
 * CÂNONE DE IDENTIDADE: casamento SÓ por uid (nunca e-mail/nome). */
const C = require('./cohost-core');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name); } }
function eq(name, a, b) { ok(name + ' (' + JSON.stringify(a) + ' === ' + JSON.stringify(b) + ')', JSON.stringify(a) === JSON.stringify(b)); }

const ORG = 'org-uid-000000001';
const CO = 'cohost-uid-00000001';
const OUTRO = 'outro-uid-00000001';

function baseDoc() {
  return {
    name: 'Confra BT',
    creatorUid: ORG,
    creatorEmail: 'org@example.com',
    organizerEmail: 'org@example.com',
    participants: [{ uid: ORG }, { uid: CO }, { uid: OUTRO }],
    coHosts: [{ uid: CO, email: 'co@example.com', displayName: 'Co Host', status: 'pending', type: 'cohost' }]
  };
}

// ── ACEITE de co-host: o cânone do bug ───────────────────────────────────────
(() => {
  const d = baseDoc();
  const antes = C.computeAdminUids(d);
  const r = C.computeRespondHostInvite(d, CO, 'cohost', 'accept');
  eq('aceite → applied', r.outcome, 'applied');
  eq('aceite → co-host vira active', r.updateData.coHosts[0].status, 'active');
  ok('ANTES do aceite adminUids NÃO tem o co-host', antes.indexOf(CO) === -1);
  ok('REGRESSÃO: aceite MUDA adminUids (entra o uid do co-host)',
    r.updateData.adminUids.indexOf(CO) !== -1);
  ok('aceite mantém o criador em adminUids', r.updateData.adminUids.indexOf(ORG) !== -1);
  ok('aceite recomputa memberUids', Array.isArray(r.updateData.memberUids) && r.updateData.memberUids.indexOf(CO) !== -1);
  ok('aceite recomputa adminEmails (derivado, compat das regras)',
    r.updateData.adminEmails.indexOf('co@example.com') !== -1);
  // A prova de que a regra antiga NÃO cobria este write:
  const chaves = Object.keys(r.updateData).sort();
  ok('updateData vai ALÉM de [coHosts, adminEmails] — o que a regra antiga proibia',
    chaves.length > 2 && chaves.indexOf('adminUids') !== -1);
})();

// ── IDENTIDADE SÓ POR UID: e-mail igual não vale ─────────────────────────────
(() => {
  const d = baseDoc();
  d.coHosts[0].uid = ''; // convite legado, só e-mail
  const r = C.computeRespondHostInvite(d, CO, 'cohost', 'accept');
  eq('convite sem uid → notFound (nunca casa por e-mail)', r.outcome, 'notFound');
  eq('convite sem uid → nada a gravar', r.updateData, null);
})();

// ── Terceiro não aceita convite alheio ───────────────────────────────────────
(() => {
  const r = C.computeRespondHostInvite(baseDoc(), OUTRO, 'cohost', 'accept');
  eq('outro uid → notFound', r.outcome, 'notFound');
})();

// ── Idempotência: aceitar duas vezes ─────────────────────────────────────────
(() => {
  const d = baseDoc();
  d.coHosts[0].status = 'active';
  const r = C.computeRespondHostInvite(d, CO, 'cohost', 'accept');
  eq('já ativo → notFound (idempotente)', r.outcome, 'notFound');
})();

// ── RECUSA de co-host ────────────────────────────────────────────────────────
(() => {
  const r = C.computeRespondHostInvite(baseDoc(), CO, 'cohost', 'reject');
  eq('recusa → applied', r.outcome, 'applied');
  eq('recusa → convite sai da lista', r.updateData.coHosts.length, 0);
  ok('recusa NÃO promove ninguém', r.updateData.adminUids.indexOf(CO) === -1);
})();

// ── TRANSFERÊNCIA: só o destinatário aceita (buraco do cliente) ───────────────
(() => {
  const d = baseDoc();
  d.pendingTransfer = { targetUid: CO, fromUid: ORG, targetName: 'Co Host' };
  const rIntruso = C.computeRespondHostInvite(d, OUTRO, 'transfer', 'accept');
  eq('ESCALADA: terceiro NÃO assume a organização', rIntruso.outcome, 'notFound');

  const r = C.computeRespondHostInvite(d, CO, 'transfer', 'accept');
  eq('transferência → applied', r.outcome, 'applied');
  eq('transferência → creatorUid vira quem aceitou', r.updateData.creatorUid, CO);
  eq('transferência → pendingTransfer limpo', r.updateData.pendingTransfer, null);
  ok('transferência → organizador antigo vira co-host ativo',
    r.updateData.coHosts.some(function (ch) { return ch.uid === ORG && ch.status === 'active'; }));
  ok('transferência → novo organizador em adminUids', r.updateData.adminUids.indexOf(CO) !== -1);
})();

// ── TRANSFERÊNCIA sem targetUid (legado) não é aceitável ─────────────────────
(() => {
  const d = baseDoc();
  d.pendingTransfer = { targetEmail: 'co@example.com', fromUid: ORG };
  const r = C.computeRespondHostInvite(d, CO, 'transfer', 'accept');
  eq('transferência sem targetUid → notFound', r.outcome, 'notFound');
})();

// ── Entradas inválidas não explodem ──────────────────────────────────────────
(() => {
  eq('sem doc', C.computeRespondHostInvite(null, CO, 'cohost', 'accept').outcome, 'notFound');
  eq('sem uid', C.computeRespondHostInvite(baseDoc(), '', 'cohost', 'accept').outcome, 'notFound');
  eq('ação inválida', C.computeRespondHostInvite(baseDoc(), CO, 'cohost', 'promote').outcome, 'notFound');
  eq('tipo inválido', C.computeRespondHostInvite(baseDoc(), CO, 'xpto', 'accept').outcome, 'notFound');
})();

console.log('\ncohost-core: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);
