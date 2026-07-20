// CAMADA DE PRESENÇA PENDENTE (v1.3.82) — o listener faz `store.tournaments = [docs frescos]` a
// cada snapshot (troca o objeto inteiro), jogando fora a presença otimista quando um snapshot STALE
// (pré-write) chega antes do write landar → "clica, aparece, apaga" (dono, SB Casais). O overlay
// guarda a INTENÇÃO por jogador e a reaplica sobre o doc fresco até ele confirmar (ou ~15s). Este
// teste carrega as funções REAIS do store.js (window._stampPresenceIntent / _reapplyPendingPresence)
// + o idMap REAL (identity-core) e prova: stale não reverte, fresco-confirma dropa, por-jogador não
// pisa em presença de OUTRO org, e expira.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window: W, load } = require('./headless');
load('identity-core.js'); // _idMapHas / _idMapSet / _idMapDel REAIS

// carrega SÓ as 2 funções do overlay a partir do store.js real (sem subir o store inteiro)
const src = fs.readFileSync(path.join(__dirname, '../js/store.js'), 'utf8');
const a = src.indexOf('window._pendingPresence = window._pendingPresence');
const bMark = 'window._reapplyPendingPresence = function';
const b = src.indexOf(bMark);
const bEnd = src.indexOf('\n};', b) + 3;
if (a < 0 || b < 0 || bEnd < 3) { console.error('❌ não achei as funções do overlay no store.js'); process.exit(1); }
vm.runInContext(src.slice(a, bEnd), W, { filename: 'store-overlay-slice.js' });

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } }
const whoU = (uid) => ({ uid: uid, displayName: 'P_' + uid });
const has = (t, map, who) => W._idMapHas(t, t[map] || {}, who);

// cada cenário parte de um `t` limpo
function fresh() { return { id: 'T1', checkedIn: {}, absent: {}, checkedInConfirmed: {} }; }
function reset() { W._pendingPresence = {}; }

// ── 1) STALE não reverte: marco presente, chega snapshot pré-write (absent) → overlay força presente
reset();
W._stampPresenceIntent('T1', whoU('u1'), 'present');
let staleDoc = fresh(); // servidor ainda sem a presença
W._reapplyPendingPresence([staleDoc]);
ok(has(staleDoc, 'checkedIn', whoU('u1')), 'stale: presença otimista SOBREVIVE ao snapshot pré-write');
ok(!!(W._pendingPresence['T1'] && W._pendingPresence['T1']['uid:u1']), 'stale: intenção ainda pendente (write não confirmou)');

// ── 2) FRESCO CONFIRMA: snapshot já reflete presente → overlay dropa a intenção
let confDoc = fresh(); W._idMapSet(confDoc, confDoc.checkedIn, whoU('u1'), Date.now());
W._reapplyPendingPresence([confDoc]);
ok(has(confDoc, 'checkedIn', whoU('u1')), 'confirma: continua presente');
ok(!(W._pendingPresence['T1'] && W._pendingPresence['T1']['uid:u1']), 'confirma: intenção DROPADA (write landou)');

// ── 3) ABSENT (W.O.): intenção absent sobrevive a snapshot pré-write
reset();
W._stampPresenceIntent('T1', whoU('u2'), 'absent');
let staleAbs = fresh(); // servidor ainda sem o W.O.
W._reapplyPendingPresence([staleAbs]);
ok(has(staleAbs, 'absent', whoU('u2')) && !has(staleAbs, 'checkedIn', whoU('u2')), 'absent: W.O. otimista sobrevive ao stale');

// ── 4) NONE (destoggle): remove presença; snapshot stale (ainda presente) → overlay tira de novo
reset();
let onDoc = fresh(); W._idMapSet(onDoc, onDoc.checkedIn, whoU('u3'), Date.now()); // estava presente
W._stampPresenceIntent('T1', whoU('u3'), 'none'); // usuário destogglou
let staleOn = fresh(); W._idMapSet(staleOn, staleOn.checkedIn, whoU('u3'), Date.now()); // snapshot ainda presente
W._reapplyPendingPresence([staleOn]);
ok(!has(staleOn, 'checkedIn', whoU('u3')), 'none: destoggle otimista sobrevive ao snapshot ainda-presente');

// ── 5) POR-JOGADOR: não reverte presença que OUTRO org marcou no mesmo doc
reset();
W._stampPresenceIntent('T1', whoU('u1'), 'present');      // eu marquei u1
let multiDoc = fresh();
W._idMapSet(multiDoc, multiDoc.checkedIn, whoU('u9'), Date.now()); // outro org marcou u9 (vem no snapshot)
W._reapplyPendingPresence([multiDoc]);
ok(has(multiDoc, 'checkedIn', whoU('u1')), 'multi: minha intenção (u1) aplicada');
ok(has(multiDoc, 'checkedIn', whoU('u9')), 'multi: presença de OUTRO org (u9) PRESERVADA (não revertida)');

// ── 6) EXPIRA: intenção com >15s é descartada (não gruda pra sempre se o write falhou)
reset();
W._stampPresenceIntent('T1', whoU('u1'), 'present');
W._pendingPresence['T1']['uid:u1'].at = Date.now() - 16000; // envelhece
let expDoc = fresh();
W._reapplyPendingPresence([expDoc]);
ok(!has(expDoc, 'checkedIn', whoU('u1')), 'expira: intenção velha (>15s) NÃO força mais presença');
ok(!(W._pendingPresence['T1'] && W._pendingPresence['T1']['uid:u1']), 'expira: intenção velha foi limpa');

// ── 7) doc some (torneio removido) → intenção limpa sem crashar
reset();
W._stampPresenceIntent('T1', whoU('u1'), 'present');
W._reapplyPendingPresence([]); // T1 não está no snapshot
ok(!W._pendingPresence['T1'], 'doc ausente: intenção limpa, sem erro');

console.log('\n' + (fail === 0 ? '✅ pending-presence-overlay: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fail > 0) process.exit(1);
