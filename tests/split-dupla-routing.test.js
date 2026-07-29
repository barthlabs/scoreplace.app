// DESFAZER DUPLA DA LISTA DE ESPERA — o clique que não fazia NADA.
//
// Dono, 26/jul/2026: _"desfazer dupla não está mais funcionando."_
//
// MEDIDO: os logs da CF `splitLatePair` não tinham NENHUMA invocação — só rollouts de deploy.
// Ou seja, o clique nem saía do cliente. Causa: `_splitDupla` procura a dupla APENAS em
// `t.participants` (o roster) e, não achando, fazia `return` MUDO — sem toast, sem CF, sem
// nada. E o painel da Lista de Espera renderiza o ✕ SEM ctx de split, então a dupla que vive
// na ESPERA caía justamente ali.
//
// Trava aqui a ENTRADA ÚNICA que ROTEIA (nunca duas portas divergindo):
//   roster   → _splitDupla (CF splitPair)
//   espera   → _splitLateDupla (CF splitLatePair)
//   nenhum   → AVISA (jamais silêncio)
// Ver [[feedback_unify_dual_entry_points]] / [[project_uid_identity_canon_locked]].
const { window: W, sandbox } = require('./render-harness');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// espiona as duas rotas + os toasts
let late = [], roster = [], toasts = [];
W._splitLateDupla = function (tId, id1, id2) { late.push({ tId: tId, id1: id1, id2: id2 }); };
W.FirestoreDB = { splitPair: function (tId, o) { roster.push({ tId: tId, o: o }); return { then: function () { return { catch: function () {} }; } }; } };
sandbox.showNotification = function (a, b, c) { toasts.push({ t: a, m: b, k: c }); };
function reset() { late = []; roster = []; toasts = []; }

const dupla = { p1Uid: 'wyzum', p2Uid: 'gtTy', _lateJoin: true };
function mk(onde) {
  const t = { id: 'T1', format: 'Dupla Eliminatória', teamSize: 2, participants: [], standbyParticipants: [], waitlist: [], matches: [] };
  if (onde === 'roster') t.participants.push(dupla);
  if (onde === 'standby') t.standbyParticipants.push(dupla);
  if (onde === 'waitlist') t.waitlist.push(dupla);
  W.AppStore.tournaments = [t];
  return t;
}

// ── 1. dupla na ESPERA (standby) → rota da espera, NUNCA silêncio ────────────────────────
reset(); mk('standby');
W._splitDupla('T1', 'wyzum', 'gtTy', null);
ok(late.length === 1, '(1) dupla no standby → chama _splitLateDupla — got ' + JSON.stringify(late));
ok(roster.length === 0, '(1) não chama a rota do roster');
ok(toasts.length === 0, '(1) sem toast de erro — foi resolvido, não recusado');

// ── 2. dupla na waitlist (o outro storage da espera) → mesma rota ────────────────────────
reset(); mk('waitlist');
W._splitDupla('T1', 'wyzum', 'gtTy', null);
ok(late.length === 1, '(2) dupla na waitlist → também roteia pra espera — got ' + JSON.stringify(late));

// ── 3. dupla no ROSTER → segue pela rota de sempre (sem regressão) ───────────────────────
reset(); mk('roster');
W._splitDupla('T1', 'wyzum', 'gtTy', null);
ok(roster.length === 1, '(3) dupla no roster → CF splitPair (rota original intacta) — got ' + JSON.stringify(roster));
ok(late.length === 0, '(3) não desvia pra rota da espera');

// ── 4. dupla em LUGAR NENHUM → AVISA (era o silêncio que originou o report) ──────────────
reset(); mk('nenhum');
W._splitDupla('T1', 'wyzum', 'gtTy', null);
ok(late.length === 0 && roster.length === 0, '(4) não inventa chamada quando não existe');
ok(toasts.length === 1, '(4) AVISA em vez de sair calado — got ' + JSON.stringify(toasts));
ok(/não encontrei/i.test(toasts[0] && toasts[0].t), '(4) o toast diz que não achou — got ' + JSON.stringify(toasts[0] && toasts[0].t));

// ── 5. o ✕ da espera gira: _splitLateDupla aceita o botão e solta em toda saída ──────────
(function () {
  reset();
  delete W._splitLateDupla;                     // volta o REAL (o espião substituiu)
  const path = require('path'), fs = require('fs'), vm = require('vm');
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8'), sandbox, { filename: 'bracket.js' });
  const btn = { nodeType: 1, innerHTML: '✕', style: {}, disabled: false, _attrs: {},
    getAttribute: function (k) { return this._attrs[k] || null; },
    setAttribute: function (k, v) { this._attrs[k] = v; },
    removeAttribute: function (k) { delete this._attrs[k]; },
    getBoundingClientRect: function () { return { width: 24, height: 24 }; } };
  W.FirestoreDB = {};                           // sem conexão → sai pelo GUARD
  W._splitLateDupla('T1', 'wyzum', 'gtTy', btn);
  ok(btn.getAttribute('data-spinning') !== '1', '(5) guard de saída SOLTA o botão (não trava girando)');
  ok(toasts.length === 1 && /sem conex/i.test(toasts[0].t), '(5) e avisa o motivo — got ' + JSON.stringify(toasts[0] && toasts[0].t));
})();

console.log((fail ? '❌' : '✅') + ' split-dupla-routing: ' + pass + ' ok, ' + fail + ' falhas');
fails.forEach(f => console.log('   ✗ ' + f));
process.exit(fail ? 1 : 0);
