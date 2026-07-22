// TRAVA ESTRUTURAL — CÂNONE (dono, jul/2026): "faça de forma robusta".
//
// REGRA: TODO mutator que roda dentro de AppStore.mutate / commitTournamentTx TEM de ser
// IDEMPOTENTE. Motivo: o mutator é re-executado para o MESMO clique —
//   (a) AppStore.mutate aplica no objeto LOCAL e de novo no doc FRESCO da transação;
//   (b) commitTournamentTx faz RETRY (while _attempt < 5) em conflito transiente;
//   (c) o Firestore re-executa a função da transação sob contenção.
// Um mutator que LÊ o estado fresco e INVERTE (toggle) se auto-desfaz em nº PAR de execuções.
// Foi a causa-raiz de "presença pulando e desmarcando" (v1.3.152) e a MESMA bomba estava no W.O.
//
// Este teste NÃO testa um bug específico: testa a PROPRIEDADE em toda a família de mutators de
// presença/W.O. — aplicar N vezes tem de dar o MESMO resultado que aplicar 1 vez. Mutator novo que
// nasça como toggle fica VERMELHO aqui. [[project_concurrency_safe_saves]]
const H = require('./render-harness');
const W = H.sandbox;
require('./headless').load('participants.js');

let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const UID = 'u1', NOME = 'Fulano';
function mkT(o) {
  o = o || {};
  const t = { id: 'MUT', format: 'Eliminatórias Simples', teamSize: 1,
    participants: [{ uid: UID, displayName: NOME, name: NOME }],
    checkedIn: {}, absent: {}, checkedInConfirmed: {},
    standbyParticipants: [], waitlist: [], teamOrigins: {}, matches: [], woHistory: [] };
  if (o.present) t.checkedIn[UID] = 1;
  if (o.absent) t.absent[UID] = 1;
  if (o.confirmed) t.checkedInConfirmed[UID] = 1;
  return t;
}
// assinatura do estado que importa (presença/ausência), pra comparar N× vs 1×
const sig = (t) => JSON.stringify({
  ci: Object.keys(t.checkedIn || {}).sort(),
  ab: Object.keys(t.absent || {}).sort(),
  cf: Object.keys(t.checkedInConfirmed || {}).sort(),
});
// aplica `fn` n vezes sobre um doc partindo de `mk()` e devolve a assinatura final
function applyN(mk, fn, n) { const t = mk(); for (let i = 0; i < n; i++) fn(t); return sig(t); }

// Cada caso: nome + estado inicial + mutator (como ele roda DENTRO da transação)
const CASES = [
  { nome: 'presença: marcar PRESENTE', mk: () => mkT({}),
    fn: (ft) => { W._idMapSet(ft, ft.checkedIn, { uid: UID }, 1); W._idMapDel(ft, ft.absent, { uid: UID }); W._idMapDel(ft, ft.checkedInConfirmed, { uid: UID }); } },
  { nome: 'presença: DESMARCAR', mk: () => mkT({ present: true }),
    fn: (ft) => { W._idMapDel(ft, ft.checkedIn, { uid: UID }); } },
  { nome: 'autopresença: sair (verde+azul)', mk: () => mkT({ present: true, confirmed: true }),
    fn: (ft) => { W._idMapDel(ft, ft.checkedIn, { uid: UID }); W._idMapDel(ft, ft.checkedInConfirmed, { uid: UID }); } },
  { nome: 'autopresença: confirmar remoto (azul)', mk: () => mkT({}),
    fn: (ft) => { W._idMapDel(ft, ft.absent, { uid: UID }); W._idMapSet(ft, ft.checkedInConfirmed, { uid: UID }, 1); W._idMapDel(ft, ft.checkedIn, { uid: UID }); } },
  { nome: 'chamada: zerar tudo', mk: () => mkT({ present: true, absent: false }),
    fn: (ft) => { ft.checkedIn = {}; ft.absent = {}; ft.checkedInConfirmed = {}; } },
  // W.O. — pelo ALVO explícito (v1.3.154). Sem alvo seria toggle e falharia em nº par.
  { nome: 'W.O.: marcar AUSENTE (alvo explícito)', mk: () => mkT({}),
    fn: (ft) => { W._applyAbsenceToggle(ft, NOME, true); } },
  { nome: 'W.O.: REVERTER (alvo explícito)', mk: () => mkT({ absent: true }),
    fn: (ft) => { W._applyAbsenceToggle(ft, NOME, false); } },
];

console.log('── todo mutator transacional é IDEMPOTENTE (N× ≡ 1×) ──');
CASES.forEach(c => {
  const uma = applyN(c.mk, c.fn, 1);
  [2, 3, 5].forEach(n => {
    ok(applyN(c.mk, c.fn, n) === uma, `${c.nome}: aplicado ${n}× ≡ 1× (got ${applyN(c.mk, c.fn, n)} vs ${uma})`);
  });
});

// PROVA de que o teste TEM dente: um toggle clássico falha aqui
console.log('\n── sanidade: um TOGGLE falha nesta trava (o teste tem dente) ──');
(function () {
  const toggle = (ft) => { if (W._idMapHas(ft, ft.checkedIn, { uid: UID })) W._idMapDel(ft, ft.checkedIn, { uid: UID }); else W._idMapSet(ft, ft.checkedIn, { uid: UID }, 1); };
  const uma = applyN(() => mkT({}), toggle, 1);
  ok(applyN(() => mkT({}), toggle, 2) !== uma, 'toggle aplicado 2× ≠ 1× — a trava PEGA esse padrão');
})();

console.log('\n' + (fail === 0 ? '✅ mutators-idempotent-canon: OK' : '❌ ' + fail + ' FALHA(S)') + '  (' + pass + ' asserts ok)');
if (fails.length) { console.error('\nFALHAS:'); fails.forEach(f => console.error('  ✗ ' + f)); }
process.exit(fail > 0 ? 1 : 0);
