/* HARNESS E2E "TUDO NA CF" — roda as AÇÕES REAIS do usuário (as funções de cliente REAIS:
 * generateDrawFunction, _formDuplaByUids, _splitDupla, _triggerLateIntegration…) contra os
 * MESMOS cores que as Cloud Functions rodam (functions-autodraw/draw-core.js e
 * functions/pair-core.js). NÃO é objeto montado à mão nem reimplementação de teste — é o fluxo
 * do clique do dono passando pelo dispatch real → core real → doc re-renderizado.
 *
 * Por que existe: os testes anteriores chamavam o core direto (dc.integrateLateEntries) com um
 * `t` montado à mão — teatro. Este harness stuba a CAMADA DE TRANSPORTE (FirestoreDB.formPair/
 * splitPair, _callIntegrateLate/_callDrawRound/_callCloseRound) pra rodar o core real sobre o
 * doc em memória, exatamente como a CF faz na transação. Se o cliente computar algo que devia
 * estar na CF, ou se a CF não integrar, o teste QUEBRA.
 *
 * Criação = caminho REAL: window.FORMAT2.compileToPhases (o mesmo que create-tournament.js roda
 * ao salvar) → topLevel + phases. Sorteio = generateDrawFunction (dispatch real → drawInitial).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const H = require('./render-harness');
const W = H.sandbox;
const dc = require('../functions-autodraw/draw-core.js');
const pc = require('../functions/pair-core.js');

// format2.js (compilador de criação) não é carregado pelo render-harness — carrega no sandbox.
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'format2.js'), 'utf8'), W, { filename: 'format2.js' });
if (!W.FORMAT2 || typeof W.FORMAT2.compileToPhases !== 'function') throw new Error('FORMAT2 não carregou no harness');

// ── thenable síncrono (mesmo padrão do headless: os fluxos do harness são síncronos) ──
function thenable(val, err) {
  return {
    then: function (cb, eb) { if (err) { if (eb) eb(err); } else if (cb) { try { cb(val); } catch (e) { err = e; } } return thenable(val, err); },
    catch: function (eb) { if (err && eb) eb(err); return thenable(err ? val : val, null); }
  };
}
function findDoc(tId) {
  var list = (W.AppStore && W.AppStore.tournaments) || [];
  return list.find(function (x) { return String(x.id) === String(tId); }) || null;
}
function applyUpdate(doc, updateData) {
  if (!updateData) return;
  // mesma semântica do tx.update da CF (campos top-level substituídos)
  Object.keys(updateData).forEach(function (k) { doc[k] = updateData[k]; });
}

// ── TRANSPORTE stubado → CORES REAIS das CFs (o que a CF faz na transação) ──
var _sawSaveTournament = 0;   // "tudo na CF" = form/split NÃO podem chamar saveTournament
W.FirestoreDB = W.FirestoreDB || {};
W.FirestoreDB.formPair = function (tId, opts) {
  var doc = findDoc(tId); if (!doc) return thenable(null, new Error('not-found'));
  var r = pc.computeFormPair(doc, { uid1: opts.uid1 || '', name1: opts.name1 || '', uid2: opts.uid2 || '', name2: opts.name2 || '', changeRule: !!opts.changeRule });
  if (r.updateData) applyUpdate(doc, r.updateData);
  return thenable({ data: { notFound: r.outcome === 'notFound', newName: r.newName } });
};
W.FirestoreDB.splitPair = function (tId, opts) {
  var doc = findDoc(tId); if (!doc) return thenable(null, new Error('not-found'));
  var r = pc.computeSplitPair(doc, { id1: opts.id1, id2: opts.id2 });
  if (r.updateData) applyUpdate(doc, r.updateData);
  return thenable({ data: { notFound: r.outcome === 'notFound' } });
};
W.FirestoreDB.saveTournament = function () { _sawSaveTournament++; return thenable({}); };
W.FirestoreDB.mutateTournament = function (tId, fn) { var doc = findDoc(tId); if (doc) fn(doc); return thenable({}); };
// _callIntegrateLate: o dispatch real do cliente (via _triggerLateIntegration) → CF integrateLateEntries.
W._callIntegrateLate = function (payload) {
  var doc = findDoc((payload && payload.tournamentId) || ''); if (!doc) return thenable(null, new Error('not-found'));
  var res = dc.integrateLateEntries(doc, {});
  return thenable({ data: res || { ok: false } });
};
// firebase.auth().currentUser: o guard do _triggerLateIntegration real não é usado (stubamos
// _callIntegrateLate), mas outras funções podem consultar — deixa um usuário logado.
W.firebase = W.firebase || {};
W.firebase.auth = function () { return { currentUser: { uid: 'org', getIdToken: function () { return thenable('tok'); } } }; };
W.AppStore.currentUser = W.AppStore.currentUser || { uid: 'org', displayName: 'Org' };
W._softRefreshView = function () {};
W._suppressSoftRefresh = false;
// FIDELIDADE: o dono forma a dupla na tela de INSCRITOS, onde o bracket NÃO re-renderiza. Se o
// harness deixasse _rerenderBracket rodar (e disparar _triggerLateIntegration no render), mascararia
// o bug — a integração TEM que vir do dispatch EXPLÍCITO do fluxo, não do render. Noop = pior caso.
W._rerenderBracket = function () {};
// anti-spam do _triggerLateIntegration é por assinatura; zera entre cenários
function resetLateGuards() { W._lateIntegrateInflight = {}; W._lateIntegrateLastSig = {}; }

// ── CRIAÇÃO como no app: FORMAT2.compileToPhases → doc pronto pro sorteio ──
function createTournament(cfg, o) {
  o = o || {};
  var out = W.FORMAT2.compileToPhases(cfg, { sport: o.sport || (cfg.disputa === 'individual' ? 'Tênis' : 'Beach Tennis'), resultEntry: o.resultEntry || ['organizer'], lateEnrollment: o.lateEnrollment || 'closed' });
  var t = Object.assign({
    id: o.id || ('E2E-' + Math.floor(Math.abs(Math.sin(pass + fail + 1)) * 1e6)),
    sport: o.sport || (cfg.disputa === 'individual' ? 'Tênis' : 'Beach Tennis'),
    participants: o.participants || [], combinedCategories: [], currentPhaseIndex: 0,
    checkedIn: {}, absent: {}, standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [],
    creatorUid: 'org', organizerEmail: 'org@x.com',
    newMatchups: (o.newMatchups != null ? o.newMatchups : undefined),
    lateEnrollment: o.lateEnrollment || 'closed'
  }, out.topLevel, { fmt2: out.cfg, phases: out.phases });
  if (o.newMatchups != null) t.newMatchups = o.newMatchups;
  W.AppStore.tournaments = [t];
  return t;
}
function draw(t) { resetLateGuards(); W.generateDrawFunction(t.id); return t; }

// ── asserts ──
var pass = 0, fail = 0; var fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }
function results() { return { pass: pass, fail: fail, fails: fails }; }
function sawSave() { return _sawSaveTournament; }
function resetSaveCounter() { _sawSaveTournament = 0; }

module.exports = { W: W, dc: dc, pc: pc, createTournament: createTournament, draw: draw, thenable: thenable, findDoc: findDoc, ok: ok, results: results, resetLateGuards: resetLateGuards, sawSave: sawSave, resetSaveCounter: resetSaveCounter, H: H };
